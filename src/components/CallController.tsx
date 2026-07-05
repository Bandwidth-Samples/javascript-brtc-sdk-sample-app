import React, {ChangeEventHandler, useState} from "react";

import '../css/DigitGrid.scss';
import '../css/CallControlButton.scss';
import '../css/NumberInput.scss';
import '../css/CallController.scss';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ShortcutOutlinedIcon from '@mui/icons-material/ShortcutOutlined';
import BandwidthRtc, {EndpointType, ReadyMetadata} from "bandwidth-rtc";
import DigitGrid from "./DigitGrid";
import TextField from '@mui/material/TextField';
import {InputAdornment} from '@mui/material';


function CallControlButton({type, onClick, disabled, Icon, iconColor='$white', fontSize='large'}: {type: string, onClick: () => void, disabled: boolean, Icon: any, iconColor?: string, fontSize?: string}) {
    const color = disabled ? 'var(--grey65)' : iconColor;
    return (
        <button className={`${type}-button`} onClick={onClick} disabled={disabled}>
            <Icon sx={{ color: color }} fontSize={fontSize}/>
        </button>
    );
}

function NumberInput ({ onChange, value }: {onChange: ChangeEventHandler, value: string}) {
    const phoneNumberNote = 'Enter phone number in E.164 format.';
    const phoneNumberInputStyle = {
        width: '100%',
        '.MuiOutlinedInput-root': { height: '45px', border: '2px solid var(--grey20)', marginTop: '-1px' },
        '.MuiInputBase-input': { lineHeight: '12px', fontFamily: 'var(--overpass)' },
        '& fieldset': { border: 'none' },
        '.MuiInputBase-input::placeholder': { color: 'var(--grey55)', opacity: '1' }
    };

    const formatNumber = (number: string): string => {
        // Remove all non-digit and non-plus characters
        let cleaned = number.replace(/[^\d+]/g, '');

        // Remove '+' if present (InputAdornment shows it)
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.slice(1);
        }

        // Format with hyphens for display: 1-XXX-XXX-XXXX (US example)
        // For simplicity, only format US numbers (1) with hyphens
        if (cleaned.startsWith('1') && cleaned.length === 11) {
            return `${cleaned.slice(0,1)}-${cleaned.slice(1,4)}-${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
        }

        // For other countries, just return cleaned digits
        return cleaned;
    }

    return (
        <div className='number-input'>
            <TextField
                onChange={onChange}
                value={formatNumber(value)}
                sx={phoneNumberInputStyle}
                label=''
                placeholder='Phone Number'
                InputProps={{ startAdornment: <InputAdornment position="start">+</InputAdornment> }}
            />
            <div className='number-note'>{phoneNumberNote}</div>
        </div>
    );
}


function isDestinationValid(destination: string): boolean {
    return true
}

function CallController({bandwidthRtcClient, readyMetadata, inCall, setInCall}: {bandwidthRtcClient: BandwidthRtc, readyMetadata: ReadyMetadata, inCall: boolean, setInCall: (inCall: boolean) => void} ) {
    if (!bandwidthRtcClient) {
        throw new Error("webrtcClient is required");
    }
    if (!setInCall) {
        throw new Error("setInCall is required");
    }

    const [destNumber, setDestNumber] = useState<string>('');
    const [callStatus, setCallStatus] = useState('Select Connection Target');
    const [endpointTarget, setEndpointTarget] = useState('');
    const [endpointType, setEndpointType] = useState<EndpointType>(EndpointType.PHONE_NUMBER);
    const [dtmfDuration, setDtmfDuration] = useState<number>(300);
    const [dtmfSequence, setDtmfSequence] = useState<string>('');

    const handleSendDtmfSequence = () => {
        console.log(`Sending DTMF sequence: ${dtmfSequence}, duration: ${dtmfDuration}ms`);
        try {
            bandwidthRtcClient.sendDtmf(dtmfSequence, undefined, dtmfDuration);
        } catch (err) {
            console.error('sendDtmf sequence failed:', err);
        }
        setDtmfSequence('');
    };


    const handleBackspaceClick = () => {
        setDestNumber((destNumber) => destNumber.slice(0, -1));
    };
    const handleDialPhone = async () => {
        setCallStatus('Calling...');
        // Ensure E.164 format: clean digits and add '+'
        const e164Number = '+' + destNumber.replace(/[^\d]/g, '');
        let result = await bandwidthRtcClient.requestOutboundConnection(e164Number, EndpointType.PHONE_NUMBER)
        if (result.accepted) {
            setCallStatus('Ringing');
            setInCall(true);
        } else {
            setCallStatus('Declined');
        }
    }
    const handleHangUp = async () => {
        setCallStatus('Hanging Up...');
        // Ensure E.164 format: clean digits and add '+'
        const e164Number = '+' + destNumber.replace(/[^\d]/g, '');
        let result = await bandwidthRtcClient.hangupConnection(e164Number, EndpointType.PHONE_NUMBER)
        setCallStatus(result.result)
        setInCall(false);
    }

    const handleDigitClick = (value: string) => {
        if (inCall) {
            console.log(`Sending DTMF: ${value}, duration: ${dtmfDuration}ms`);
            try {
                bandwidthRtcClient.sendDtmf(value, undefined, dtmfDuration);
            } catch (err) {
                console.error('sendDtmf failed:', err);
            }
        } else {
            setDestNumber((destNumber) => destNumber.concat(value));
        }
    }
    const handlePhoneNumber = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDestNumber((destNumber) => event.target.value);
    }

    const handleDialEndpoint = async () => {
        await bandwidthRtcClient.requestOutboundConnection(endpointTarget, EndpointType.ENDPOINT)
    }

    const handleDial = async () => {
        if (endpointType === EndpointType.PHONE_NUMBER) {
            await handleDialPhone()
        } else if (endpointType === EndpointType.ENDPOINT) {
            await handleDialEndpoint()
        }
    }


    const endCallButtonProps = {
        type: 'end-call',
        onClick: handleHangUp,
        disabled: !inCall,
        Icon: CallEndIcon
    };

    const startCallButtonProps = {
        type: 'start-call',
        onClick: handleDial,
        disabled: !isDestinationValid(destNumber) || inCall,
        Icon: CallIcon
    };

    const backspaceButtonProps = {
        type: 'backspace',
        onClick: handleBackspaceClick,
        disabled: inCall,
        Icon: ShortcutOutlinedIcon,
        iconColor: '$blue65',
        fontSize: 'small'
    };

    const numberInputProps = {
        onChange: handlePhoneNumber,
        value: destNumber
    };

    return (
        <div className='outbound-caller'>
            <select
                disabled={inCall}
                value={endpointType}
                onChange={e => setEndpointType(e.target.value as EndpointType)}
                style={{ marginBottom: '10px' }}
            >
                {Object.values(EndpointType).map(type => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>

            <h2>{!inCall && callStatus}{inCall && "In Call"}</h2>

            {endpointType == EndpointType.ENDPOINT && (
                <>
                <input type="text" disabled={inCall} onChange={(value) => setEndpointTarget(value.target.value)} />
                </>
            )}
            {endpointType == EndpointType.CALL_ID && (
                <>
                    TODO
                </>
            )}
            {endpointType == EndpointType.PHONE_NUMBER && (
                <>
                    {!inCall ? <NumberInput {...numberInputProps} /> : <div className='dialed-number'>+{destNumber.replace(/[^\d]/g, '')}</div>}
                    <div className='call-controls'>
                        <CallControlButton {...backspaceButtonProps} />
                    </div>
                    {inCall && (
                        <div className='dtmf-duration-control'>
                            <label htmlFor='dtmf-duration'>Tone Duration (ms)</label>
                            <input
                                id='dtmf-duration'
                                type='number'
                                min={40}
                                max={6000}
                                value={dtmfDuration}
                                onChange={e => setDtmfDuration(Number(e.target.value))}
                            />
                        </div>
                    )}
                    {inCall && (
                        <div className='dtmf-sequence-control'>
                            <input
                                type='text'
                                placeholder='e.g. 1234#'
                                value={dtmfSequence}
                                onChange={e => setDtmfSequence(e.target.value.replace(/[^0-9a-dA-D#*]/g, ''))}
                                onKeyDown={e => e.key === 'Enter' && handleSendDtmfSequence()}
                            />
                            <button onClick={handleSendDtmfSequence} disabled={!dtmfSequence}>Send DTMF</button>
                        </div>
                    )}
                    <DigitGrid onClick={handleDigitClick} />
                </>
            )}
            <div className='call-start-end'>
                {!inCall ? <CallControlButton {...startCallButtonProps} /> : <CallControlButton {...endCallButtonProps} />}
            </div>

        </div>
    );
}

export default CallController;
