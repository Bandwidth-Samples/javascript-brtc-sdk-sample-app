import React, {useEffect, useState} from 'react';
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

    const resetClient = async () => {
        await prepBrtcClient(true)
    }

  // Fetch the WebSocket URL from env
  const gatewayUrl = process.env.REACT_APP_WSS_URL;

  return (
    <div className="App">
        <Navbar />
        {brtcClient && (
            <>
                <EndpointHandler bandwidthRtcClient={brtcClient} resetClient={resetClient} gatewayUrl={gatewayUrl} />
                <hr />
                {brtcClientReady}
                {readyMetadata && (
                    <>
                    <h2>Bandwidth RTC Agent Sample</h2>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <MediaCapture bandwidthRtcClient={brtcClient} />
                        <MediaPlayer bandwidthRtcClient={brtcClient} inCall={inCall} setInCall={setInCall} />
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
