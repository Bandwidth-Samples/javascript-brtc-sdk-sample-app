import React, {useEffect, useState} from "react";
import BandwidthRtc from "bandwidth-rtc";
import {Endpoint} from "../../server/types"
import '../css/EndpointHandler.scss';

function EndpointHandler({bandwidthRtcClient, resetClient, gatewayUrl, autoAccept, setAutoAccept}: {bandwidthRtcClient: BandwidthRtc, resetClient: () => void, gatewayUrl?: string, autoAccept: boolean, setAutoAccept: (autoAccept: boolean) => void }) {
    const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
    const [banner, setBanner] = useState<{ message: string; isError: boolean } | null>(null);

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
                websocketUrl: gatewayUrl,
                autoAccept
            }).then(() => {
                console.log("WebRTC Client Connected");
            }).catch((error) => {
                console.error("Error connecting WebRTC Client:", error);
            });
        }
    }

    const deleteAllEndpoints = async () => {
        try {
            const res = await fetch('/api/endpoints', { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: `Request failed with status ${res.status}` }));
                setBanner({ message: data.error || `Request failed with status ${res.status}`, isError: true });
                return;
            }
            bandwidthRtcClient.disconnect();
            resetClient();
            setEndpoint(null);
            setBanner({ message: 'Endpoints all deleted', isError: false });
            setTimeout(() => setBanner(prev => prev && !prev.isError ? null : prev), 4000);
        } catch (err: any) {
            setBanner({ message: err.message || 'Failed to delete endpoints', isError: true });
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
            {banner && !banner.isError && (
                <div style={{ padding: '8px 12px', marginBottom: 8, background: '#d4edda', color: '#155724', borderRadius: 4 }}>
                    {banner.message}
                </div>
            )}
            {banner && banner.isError && (
                <div style={{ padding: '8px 12px', marginBottom: 8, background: '#f8d7da', color: '#721c24', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{banner.message}</span>
                    <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#721c24' }}>✕</button>
                </div>
            )}
            <div className="endpoint-actions">
                <button onClick={createEndpoint}>Create Endpoint</button>
                <button onClick={deleteEndpoint} disabled={!endpoint}>Disconnect & Delete Endpoint</button>
                <button onClick={deleteAllEndpoints}>Delete All Endpoints</button>
            </div>
            <label className="auto-accept-toggle" title="Set before creating the endpoint. When off, inbound calls prompt with Accept/Decline.">
                <input
                    type="checkbox"
                    checked={autoAccept}
                    disabled={endpoint !== null}
                    onChange={(e) => setAutoAccept(e.target.checked)}
                />
                Auto-accept inbound calls
            </label>
            {endpoint !== null && (
                <p className="endpoint-id">{endpoint.endpointId}</p>
            )}
        </div>
    );
}

export default EndpointHandler;
