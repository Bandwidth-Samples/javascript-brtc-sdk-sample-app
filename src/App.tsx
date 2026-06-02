import React, {useEffect, useRef, useState} from 'react';
import './css/App.scss';
import Navbar from "./components/Navbar";
import EndpointHandler from "./components/EndpointHandler";
import MediaCapture from "./components/MediaCapture";
import BandwidthRtc, {ReadyMetadata} from "bandwidth-rtc";
import MediaPlayer from "./components/MediaPlayer";
import CallController from "./components/CallController";

function App() {

    const [brtcClient, setBrtcClient] = useState<BandwidthRtc | null>(null);
    const [brtcClientReady, setBrtcClientReady] = useState<boolean>(false);
    const [readyMetadata, setReadyMetadata] = useState<ReadyMetadata | null>(null);
    const [inCall, setInCall] = useState(false);
    const [incomingCallId, setIncomingCallId] = useState<string | null>(null);
    const [inboundStream, setInboundStream] = useState<MediaStream | null>(null);
    // true once the WS streamAvailable notification arrives; gates in-call state
    const callExpectedRef = useRef(false);
    // holds the subscribe-peer MediaStream from WebRTC ontrack, which fires once
    // at connection time before any call arrives
    const subscribeStreamRef = useRef<MediaStream | null>(null);

    const prepBrtcClient= async (reset: boolean) => {
        console.log("Prepping Bandwidth RTC Client")
        if (reset) {
            console.log("Resetting Bandwidth RTC Client")
            setBrtcClientReady(false)
            setReadyMetadata(null)
            setBrtcClient(null)
        }
        if (!brtcClient || reset) {
            console.log("Creating Bandwidth RTC Client")
            let brtcClient = new BandwidthRtc('debug')
            brtcClient.onReady((readyMetadata: ReadyMetadata) => {
                console.log("Ready Metadata:", readyMetadata);
                setBrtcClientReady(true)
                setReadyMetadata(readyMetadata)
            })
            setBrtcClient(brtcClient)
        }
    }

    useEffect(() => {
        prepBrtcClient(false)
    }, []);

    useEffect(() => {
        if (!brtcClient) return;
        brtcClient.onStreamAvailable((s) => {
            console.log("Stream available:", s);
            if (s.callId && !s.mediaStream) {
                callExpectedRef.current = true;
                setIncomingCallId(s.callId);
                // ontrack may have already fired before this notification arrived
                if (subscribeStreamRef.current) {
                    setInCall(true);
                    setInboundStream(subscribeStreamRef.current);
                }
            } else if (s.mediaStream) {
                subscribeStreamRef.current = s.mediaStream;
                if (callExpectedRef.current) {
                    setInCall(true);
                    setInboundStream(s.mediaStream);
                }
            }
        });
        brtcClient.onStreamUnavailable((s) => {
            console.log("Stream unavailable:", s);
            callExpectedRef.current = false;
            subscribeStreamRef.current = null;
            setInCall(false);
            setIncomingCallId(null);
            setInboundStream(null);
        });
    }, [brtcClient]);

    const handleAccept = async () => {
        if (!brtcClient) return;
        await brtcClient.acceptStream(incomingCallId ?? undefined);
        setInCall(true);
        setIncomingCallId(null);
        if (subscribeStreamRef.current) {
            setInboundStream(subscribeStreamRef.current);
        }
    };

    const handleDecline = async () => {
        if (!brtcClient) return;
        await brtcClient.declineStream(incomingCallId ?? undefined);
        setIncomingCallId(null);
    };

    const resetClient = async () => {
        await prepBrtcClient(true)
    }

  const gatewayUrl = process.env.REACT_APP_WSS_URL;

  return (
    <div className="App">
        <Navbar />
        {brtcClient && (
            <>
                <EndpointHandler bandwidthRtcClient={brtcClient} resetClient={resetClient} gatewayUrl={gatewayUrl} />
                <hr />
                {brtcClientReady}
                {incomingCallId && (
                    <div style={{
                        background: '#e3f2fd',
                        border: '2px solid #1976d2',
                        borderRadius: 8,
                        padding: '12px 24px',
                        margin: '8px auto',
                        maxWidth: 480,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                    }}>
                        <span style={{ fontWeight: 600 }}>Incoming call</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleAccept}
                                style={{ background: '#4caf50', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Accept
                            </button>
                            <button
                                onClick={handleDecline}
                                style={{ background: '#f44336', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Decline
                            </button>
                        </div>
                    </div>
                )}
                {readyMetadata && (
                    <>
                    <h2>Bandwidth RTC Agent Sample</h2>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <MediaCapture bandwidthRtcClient={brtcClient} />
                        <MediaPlayer inboundStream={inboundStream} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <CallController bandwidthRtcClient={brtcClient} readyMetadata={readyMetadata} inCall={inCall} setInCall={setInCall} />
                    </div>
                    </>
                )}
            </>
        )}
    </div>
  );
}

export default App;
