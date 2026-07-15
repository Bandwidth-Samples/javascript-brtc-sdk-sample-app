import React from "react";
import {RtcStream} from "bandwidth-rtc";
import '../css/IncomingCall.scss';

function IncomingCall({stream, onAccept, onDecline}: {stream: RtcStream, onAccept: () => void, onDecline: () => void}) {
    const caller = stream.from || "Unknown";

    return (
        <div className="incoming-call">
            <div className="incoming-call-info">
                <span className="incoming-call-label">Incoming call</span>
                <span className="incoming-call-from">
                    {caller}{stream.fromType ? ` (${stream.fromType})` : ""}
                </span>
            </div>
            <div className="incoming-call-actions">
                <button className="accept" onClick={onAccept}>Accept</button>
                <button className="decline" onClick={onDecline}>Decline</button>
            </div>
        </div>
    );
}

export default IncomingCall;
