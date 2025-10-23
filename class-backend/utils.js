const { StreamClient } = require("@stream-io/node-sdk");
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const apiKey = process.env.STREAM_KEY;
const secret = process.env.STREAM_TOKEN;

client = new StreamClient(apiKey, secret);

const resend = new Resend(process.env.RESEND_API_KEY);


// Generate AI attendance summary
const generateAttendanceSummary = async (callId) => {
  try {
    // Fetch all attendance records for this call
    const { data: attendanceRecords, error: fetchError } = await supabase
      .from('participants')
      .select('*')
      .eq('call_id', callId);

    if (fetchError) {
      console.error('Error fetching attendance data:', fetchError);
      return null;
    }

    if (!attendanceRecords || attendanceRecords.length === 0) {
      console.log('No attendance records found for call:', callId);
      return null;
    }

    // Prepare attendance data for AI
    const attendanceData = attendanceRecords.map(record => {
      const duration = record.duration_seconds || 0;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;

      return {
        name: record.full_name,
        user_id: record.user_id,
        joined_at: new Date(record.joined_at).toLocaleString(),
        left_at: record.left_at ? new Date(record.left_at).toLocaleString() : 'Still in call',
        duration: `${minutes}m ${seconds}s`,
        duration_seconds: duration
      };
    });

    // Calculate total participants and average duration
    const totalParticipants = new Set(attendanceRecords.map(r => r.user_id)).size;
    const totalSessions = attendanceRecords.length;
    const avgDuration = attendanceRecords.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / attendanceRecords.length;

    // Create AI prompt
    const prompt = `You are an educational assistant analyzing class attendance data. Generate a detailed, professional attendance summary report.

Call ID: ${callId}
Total Unique Participants: ${totalParticipants}
Total Sessions: ${totalSessions}
Average Duration: ${Math.floor(avgDuration / 60)} minutes

Attendance Details:
${JSON.stringify(attendanceData, null, 2)}

Generate a comprehensive summary that includes:
1. Overall attendance statistics
2. Engagement level analysis (based on duration)
3. Notable patterns (e.g., participants who joined multiple times, early leavers, full attendees)
4. Recommendations for improving attendance/engagement

Keep the tone professional and constructive.`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert educational analyst providing detailed attendance reports." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const summary = completion.choices[0].message.content;

    // Store summary in database
    const { data: summaryData, error: summaryError } = await supabase
      .from('call_summaries')
      .insert([{
        call_id: callId,
        summary: summary,
        total_participants: totalParticipants,
        total_sessions: totalSessions,
        average_duration_seconds: Math.floor(avgDuration),
        created_at: new Date().toISOString()
      }])
      .select();

    if (summaryError) {
      console.error('Error storing summary:', summaryError);
    } else {
      console.log('Summary stored successfully:', summaryData);
    }

    return {
      summary,
      attendanceData,
      stats: {
        totalParticipants,
        totalSessions,
        avgDuration
      }
    };
  } catch (error) {
    console.error('Error generating attendance summary:', error);
    return null;
  }
};

// Generate PDF from attendance summary
const generatePDF = async (callId, summary, attendanceData, stats) => {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF directory if it doesn't exist
      const pdfDir = path.join(__dirname, '../pdfs');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      const fileName = `attendance-${callId}-${Date.now()}.pdf`;
      const filePath = path.join(pdfDir, fileName);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Attendance Summary Report', { align: 'center' });
      doc.moveDown();

      // Call details
      doc.fontSize(12).font('Helvetica');
      doc.text(`Call ID: ${callId}`);
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // Statistics
      doc.fontSize(16).font('Helvetica-Bold').text('Statistics');
      doc.fontSize(11).font('Helvetica');
      doc.text(`Total Unique Participants: ${stats.totalParticipants}`);
      doc.text(`Total Sessions: ${stats.totalSessions}`);
      doc.text(`Average Duration: ${Math.floor(stats.avgDuration / 60)} minutes`);
      doc.moveDown();

      // AI Summary
      doc.fontSize(16).font('Helvetica-Bold').text('AI Analysis');
      doc.fontSize(10).font('Helvetica');
      doc.text(summary, { align: 'justify' });
      doc.moveDown();

      // Attendance Details Table
      doc.fontSize(16).font('Helvetica-Bold').text('Detailed Attendance');
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica');
      attendanceData.forEach((record, index) => {
        if (doc.y > 700) {
          doc.addPage();
        }

        doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${record.name}`);
        doc.fontSize(9).font('Helvetica');
        doc.text(`   User ID: ${record.user_id}`);
        doc.text(`   Joined: ${record.joined_at}`);
        doc.text(`   Left: ${record.left_at}`);
        doc.text(`   Duration: ${record.duration}`);
        doc.moveDown(0.5);
      });

      // Footer
      doc.fontSize(8).text('Generated by AI-Powered Attendance System using Stream', {
        align: 'center'
      });

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Send email with PDF attachment
const sendEmailWithPDF = async (callId, summary, pdfPath) => {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');
    const fileName = path.basename(pdfPath);

    const { data, error } = await resend.emails.send({
      from: 'Attendance System <onboarding@resend.dev>',
      to: 'loyaltysamuel@gmail.com', // this should be the email of the class teacher from your database
      subject: `Attendance Summary - Call ${callId}`,
      html: `
        <h2>Attendance Summary Report</h2>
        <p>The class session has ended. Please find the detailed attendance summary attached.</p>
        <h3>Quick Overview:</h3>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          ${summary.split('\n').slice(0, 5).join('<br/>')}
        </div>

        <p><strong>Full report is attached as PDF.</strong></p>

        <hr/>
        <p style="color: #666; font-size: 12px;">Generated by AI-Powered Attendance System</p>
      `,
      attachments: [
        {
          filename: fileName,
          content: pdfBase64
        }
      ]
    });

    if (error) {
      console.error('Error sending email:', error);
      return false;
    }

    console.log('Email sent successfully:', data);

    // Clean up PDF file after sending (optional)
    fs.unlinkSync(pdfPath);
    console.log('PDF file cleaned up:', pdfPath);

    return true;
  } catch (error) {
    console.error('Error in email sending process:', error);
    return false;
  }
};

module.exports = { client, supabase, generatePDF, sendEmailWithPDF, generateAttendanceSummary }