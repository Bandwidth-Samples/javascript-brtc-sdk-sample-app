import React, {useEffect, useState} from 'react';
import './css/App.scss';
import Navbar from "./components/Navbar";
import EndpointHandler from "./components/EndpointHandler";
import MediaCapture from "./components/MediaCapture";
import BandwidthRtc, {EndpointType, ReadyMetadata, RtcStream} from "bandwidth-rtc";
import MediaPlayer from "./components/MediaPlayer";
import CallController from "./components/CallController";
import IncomingCall from "./components/IncomingCall";

function App() {

    const [brtcClient, setBrtcClient] = useState<BandwidthRtc | null>(null);
    const [brtcClientReady, setBrtcClientReady] = useState<boolean>(false);
    const [readyMetadata, setReadyMetadata] = useState<ReadyMetadata | null>(null);
    const [inCall, setInCall] = useState(false);
    const [inboundStream, setInboundStream] = useState<MediaStream | null>(null);
    // When autoAccept is off, an incoming stream that the gateway did not
    // auto-accept lands here so we can prompt the user with Accept/Decline.
    const [incomingCall, setIncomingCall] = useState<RtcStream | null>(null);
    // Sent to the gateway at connect time via setMediaPreferences. The gateway
    // echoes its decision back on each stream (RtcStream.autoAccepted).
    const [autoAccept, setAutoAccept] = useState(true);

    const prepBrtcClient= async (reset: boolean) => {
        console.log("Prepping Bandwidth RTC Client")
        if (reset) {
            console.log("Resetting Bandwidth RTC Client")
            setBrtcClientReady(false)
            setReadyMetadata(null)
            setBrtcClient(null)
            setInCall(false)
            setInboundStream(null)
            setIncomingCall(null)
        }
        if (!brtcClient || reset) {
            console.log("Creating Bandwidth RTC Client")
            let brtcClient = new BandwidthRtc('debug')
            // Registered before connect() runs: the subscribing peer connection's
            // ontrack fires once during initial connection setup, before
            // readyMetadata (and therefore MediaPlayer) exists.
            brtcClient.onStreamAvailable((s) => {
                console.log("Stream available:", s);
                // The gateway rides its accept decision on the stream itself. When it
                // auto-accepted, connect straight through; otherwise prompt the user
                // and wait for acceptStream/declineStream before playing any audio.
                if (s.autoAccepted) {
                    setInboundStream(s.mediaStream);
                    setInCall(true);
                } else {
                    setIncomingCall(s);
                }
            })
            brtcClient.onStreamUnavailable((s) => {
                console.log("Stream unavailable:", s);
                // The far side (or gateway) ended/declined the call; reset the UI out
                // of the in-call/ringing state.
                setInboundStream(null);
                setInCall(false);
                setIncomingCall(null);
            })
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

    const resetClient = async () => {
        await prepBrtcClient(true)
    }

    const handleAccept = () => {
        if (!incomingCall) return;
        // Accept is purely client-side: the gateway already bridged the call and
        // the audio is flowing, so accepting just means playing the stream.
        setInboundStream(incomingCall.mediaStream);
        setInCall(true);
        setIncomingCall(null);
    }

    const handleDecline = async () => {
        if (!brtcClient) return;
        // Decline ends the call through the existing hangup path
        await brtcClient.hangupConnection(incomingCall?.from ?? "", EndpointType.CALL_ID);
        setIncomingCall(null);
    }

  // Fetch the WebSocket URL from env
  const gatewayUrl = process.env.REACT_APP_WSS_URL;

  return (
    <div className="App">
        <Navbar />
        {brtcClient && (
            <>
                <EndpointHandler bandwidthRtcClient={brtcClient} resetClient={resetClient} gatewayUrl={gatewayUrl} autoAccept={autoAccept} setAutoAccept={setAutoAccept} />
                <hr />
                {brtcClientReady}
                {incomingCall && (
                    <IncomingCall stream={incomingCall} onAccept={handleAccept} onDecline={handleDecline} />
                )}
                {readyMetadata && (
                    <>
                    <h2>Bandwidth RTC Agent Sample</h2>
                    <div className="app-row">
                        <MediaCapture bandwidthRtcClient={brtcClient} />
                        <MediaPlayer inboundStream={inboundStream} />
                    </div>
                    <div className="app-row">
                        <CallController bandwidthRtcClient={brtcClient} readyMetadata={readyMetadata} inCall={inCall} setInCall={setInCall} connected={inboundStream !== null} />
                    </div>
                    </>
                )}
            </>
        )}
    </div>
  );
}

export default App;
