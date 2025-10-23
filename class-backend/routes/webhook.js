const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabase, generatePDF, sendEmailWithPDF, generateAttendanceSummary } = require("../utils");




// In-memory deduplication store (use Redis in production)
const processedWebhooks = new Set();

// Cleanup old webhook IDs every 24 hours
setInterval(() => {
  if (processedWebhooks.size > 10000) processedWebhooks.clear();
}, 24 * 60 * 60 * 1000);




// Verify webhook signature
const verifySignature = (req, res, next) => {
  const { 'x-signature': signature, 'x-api-key': apiKey } = req.headers;

  console.log('🔐 Webhook authentication check:', {
    eventType: req.body.type,
    hasSignature: !!signature,
    hasApiKey: !!apiKey,
    signatureLength: signature?.length,
    apiKeyMatch: apiKey === process.env.STREAM_KEY
  });

  if (!signature || !apiKey) {
    console.error('❌ Missing authentication headers');
    return res.status(401).json({ error: 'Missing authentication headers' });
  }

  if (apiKey !== process.env.STREAM_KEY) {
    console.error('❌ Invalid API key');
    return res.status(401).json({ error: 'Invalid API key' });
  }

  try {
    // Use raw body if available, otherwise fallback to JSON.stringify
    const bodyToVerify = req.rawBody || JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', process.env.STREAM_TOKEN)
      .update(bodyToVerify)
      .digest('hex');

    console.log('🔑 Signature comparison:', {
      usingRawBody: !!req.rawBody,
      received: signature.substring(0, 20) + '...',
      expected: expectedSignature.substring(0, 20) + '...',
      match: signature === expectedSignature
    });

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      console.error('❌ Signature mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('✅ Signature verified successfully');
    next();
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return res.status(401).json({ error: 'Signature verification failed' });
  }
};

// Event handlers
const handleEvent = async (type, payload) => {
    console.log(`\n=== WEBHOOK EVENT RECEIVED ===`);
    console.log(`Type: ${type}`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));
    console.log(`==============================\n`);

  switch (type) {
    case 'call.session_started':
      console.log('Call session started:', payload);
      break;
    case 'call.session_ended':
      console.log('Call session ended:', payload);

      // Generate AI attendance summary
      const callId = payload.call_cid;
      console.log(`Generating attendance summary for call: ${callId}`);

      const result = await generateAttendanceSummary(callId);

      if (result) { 
        console.log('=== ATTENDANCE SUMMARY ===');
        console.log(result.summary);
        console.log('==========================');

        try {
          // Generate PDF
          console.log('Generating PDF report...');
          const pdfPath = await generatePDF(
            callId,
            result.summary,
            result.attendanceData,
            result.stats
          );
          console.log('PDF generated:', pdfPath);

          // Send email with PDF attachment
          console.log('Sending email with PDF attachment...');
          const emailSent = await sendEmailWithPDF(callId, result.summary, pdfPath);

          if (emailSent) {
            console.log('✅ Attendance summary email sent successfully!');
          } else {
            console.log('❌ Failed to send attendance summary email');
          }
        } catch (error) {
          console.error('Error in PDF/Email process:', error);
        }
      } else {
        console.log('Failed to generate attendance summary');
      }
      break;
    case 'call.session_participant_joined':
      //console.log('Member joined the call:', payload);
      const { data: joinData, error: joinError } = await supabase
        .from('participants')
        .insert([{
          call_id: payload.call_cid,
          session_id: payload.session_id,
          user_session_id: payload.participant.user_session_id,
          user_id: payload.participant.user.userId,
          full_name: payload.participant.user.full_name,
          joined_at: payload.participant.joined_at,
          left_at: null,
          duration_seconds: null
        }])
        .select();

      if (joinError) {
        console.error('Error storing join data:', joinError);
      } else {
        console.log('Join data stored:', joinData);
      }
      break;

    case 'call.session_participant_left':
      //console.log('Member left the call:', payload);

      // Find the most recent session record(s) without left_at
      const { data: sessionData, error: fetchError } = await supabase
        .from('participants')
        .select('*')
        .eq('user_session_id', payload.participant.user_session_id)
        .select();

      if (fetchError) {
        console.error('Error fetching session:', fetchError);
        break;
      }

      if (sessionData && sessionData.length > 0) {
        // Process the most recent session
        const session = sessionData[0];
        const leftAt = new Date(payload.participant.joined_at);
        const joinedAt = new Date(session.joined_at);
        const durationSeconds = Math.floor((leftAt - joinedAt) / 1000);

        const { data: updateData, error: updateError } = await supabase
          .from('participants')
          .update({
            left_at: payload.participant.joined_at,
            duration_seconds: durationSeconds
          })
          .eq('user_session_id', payload.participant.user_session_id)
          .select();

        if (updateError) {
          console.error('Error updating leave data:', updateError);
        } else {
          console.log(`Member left. Duration: ${durationSeconds}s (${Math.floor(durationSeconds / 60)} minutes)`);
          console.log('Leave data stored:', updateData);
        }
      }
      break;

    default:
      console.log(`Unhandled event: ${type}`, payload);
  }
};

// Webhook endpoint with raw body capture
router.post('/webhook',
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }),
  verifySignature,
  (req, res) => {
  const webhookId = req.headers['x-webhook-id'];
  const webhookAttempt = req.headers['x-webhook-attempt'];
  const { type, ...payload } = req.body;

  // Fast response
  res.status(200).json({ received: true });

  // Deduplication check
  if (processedWebhooks.has(webhookId)) {
    console.log(`Duplicate webhook: ${webhookId}`);
    return;
  }

  processedWebhooks.add(webhookId);

  if (!type) {
    console.error('Missing type field:', req.body);
    return;
  }

  console.log(`Webhook: ${type} (ID: ${webhookId}, Attempt: ${webhookAttempt})`);

  // Process asynchronously
  setImmediate(async () => {
    try {
      await handleEvent(type, payload);
      console.log(`Processed webhook ${webhookId}`);
    } catch (error) {
      console.error(`Error processing webhook ${webhookId}:`, error);
    }
  });
});

module.exports = router;

