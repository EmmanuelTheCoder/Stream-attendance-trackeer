import { useEffect, useState, useRef } from 'react';
import {
  CallControls,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { useUser } from './UserContext';

const apiKey = import.meta.env.VITE_STREAM_KEY;

const Call = () => {
  const { user } = useUser();
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const clientRef = useRef(null);
  const callRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setError('No user data available');
      setIsLoading(false);
      return;
    }
    if(!user?.id || !user?.token){
        setError("User Id or User token not found");
        setIsLoading(false)
        return;
    }

    if (!user.callType || !user.callId) {
      setError('Missing call information');
      setIsLoading(false);
      return;
    }

    if (!apiKey) {
      setError('Missing Stream API key');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const initializeCall = async () => {
      try {
        const videoClient = new StreamVideoClient({
          apiKey,
        });

        await videoClient.connectUser({id: user.id}, user.token);
        
        const videoCall = videoClient.call(user.callType, user.callId);

        await videoCall.join({create: false});

        if (isMounted) {
          clientRef.current = videoClient;
          callRef.current = videoCall;
          setClient(videoClient);
          setCall(videoCall);
          setIsLoading(false);
        } else {
          // If component unmounted during initialization, clean up
          await videoCall.leave().catch((err) => console.error("Failed to leave:", err));
          await videoClient.disconnectUser().catch((err) => console.error("Failed to disconnect:", err));
        }
      } catch (err) {
        console.error('Error initializing call:', err);
        if (isMounted) {
          setError(err.message || 'Failed to initialize call');
          setIsLoading(false);
        }
      }
    };

    initializeCall();

    return () => {
      isMounted = false;

      if (callRef.current) {
        callRef.current.leave().catch((err) => console.error("Failed to leave the call:", err));
      }
      if (clientRef.current) {
        clientRef.current.disconnectUser().catch((err) => console.error("Failed to disconnect:", err));
      }

      clientRef.current = null;
      callRef.current = null;
      setClient(undefined);
      setCall(undefined);
    };
  }, [user?.id, user?.token, apiKey]);

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (isLoading || !client || !call) {
    return (
      <div className="loading-container">
        <p>Loading call...</p>
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
    <StreamTheme>
      <StreamCall call={call}>
          <SpeakerLayout />
          <CallControls />
      </StreamCall>
    </StreamTheme>
    </StreamVideo>
  );
};

export default Call;
