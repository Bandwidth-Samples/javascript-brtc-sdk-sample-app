import React, {useEffect, useState} from "react";
import BandwidthRtc from "bandwidth-rtc";
import {Endpoint} from "../../server/types"

function EndpointHandler({bandwidthRtcClient, resetClient, gatewayUrl}: {bandwidthRtcClient: BandwidthRtc, resetClient: () => void, gatewayUrl?: string }) {
    const [endpoint, setEndpoint] = useState<Endpoint | null>(null);

    const createEndpoint = async () => {
        if (!endpoint) {
            let endpointData = await fetch("/token")
                .then(res => res.json())
                .then(data => data as Endpoint)
                .catch((err) => {
                    console.error(err);
                    return null;
                }) as Endpoint | null;
            if (!endpointData) {
                throw new Error("Failed to create endpoint")
            }
            setEndpoint(endpointData)
            await bandwidthRtcClient.connect({
                endpointToken: endpointData.token
            }, {
                websocketUrl: gatewayUrl
            }).then(() => {
                console.log("WebRTC Client Connected");
            }).catch((error) => {
                console.error("Error connecting WebRTC Client:", error);
            });
        }
    }

    const deleteEndpoint = async () => {
        if (endpoint) {
            bandwidthRtcClient.disconnect();
            resetClient(); // Reset for now until reconnection logic is fixed (init rebinding in bandwidthRtcClient.connect(...))
            let endpointData = await fetch(`/api/endpoint/${endpoint.endpointId}`, { method: "DELETE" })
                .then(res => res.json())
                .then(data => data as Endpoint)
                .catch((err) => {
                    console.error(err);
                    return null;
                }) as Endpoint | null;
            setEndpoint(null)
        }
    }

    useEffect(() => {

    }, []);

    return (
        <div>
            <h2>Bandwidth RTC Endpoint</h2>
            <button onClick={createEndpoint}>Create Endpoint</button>
            <button onClick={deleteEndpoint} disabled={!endpoint} >Disconnect & Delete Endpoint</button>
            {endpoint !== null && (
                <p>{endpoint.endpointId}</p>
            )}
        </div>
    );
}

export default EndpointHandler;
