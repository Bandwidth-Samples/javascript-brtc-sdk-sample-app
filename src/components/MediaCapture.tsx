import React, {useEffect, useRef, useState} from "react";
import BandwidthRtc from "bandwidth-rtc";

function MediaCapture({bandwidthRtcClient}: {bandwidthRtcClient: BandwidthRtc} ) {
    if (!bandwidthRtcClient) {
        throw new Error("webrtcClient is required");
    }

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [audioSource, setAudioSource] = useState<HTMLAudioElement | null>(null);
    const [audioSourceNode, setAudioSourceNode] = useState<AudioNode | null>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [fileMediaStream, setFileMediaStream] = useState<MediaStream | null>(null);
    const [microphoneMediaStream, setMicrophoneMediaStream] = useState<MediaStream | null>(null);
    const [rawMicrophoneStream, setRawMicrophoneStream] = useState<MediaStream | null>(null);
    const [publishedMediaStream, setPublishedMediaStream] = useState<MediaStream | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isCapturingMicrophone, setIsCapturingMicrophone] = useState<boolean>(false);
    const [isPublished, setIsPublished] = useState<boolean>(false);
    const [dataArray] = useState<Uint8Array>(new Uint8Array(512));
    const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState<string>('');
    const fftSize = 512;

    const loadAudioInputDevices = async () => {
        let devices = await navigator.mediaDevices.enumerateDevices();
        let audioInputs = devices.filter(d => d.kind === 'audioinput');

        // Browsers hide full device list until mic permission is granted.
        // Request temporary access so users can pick their device before capture.
        if (audioInputs.length > 0 && !audioInputs.some(d => d.label)) {
            try {
                const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                tempStream.getTracks().forEach(t => t.stop());
                devices = await navigator.mediaDevices.enumerateDevices();
                audioInputs = devices.filter(d => d.kind === 'audioinput');
            } catch {
                // Permission denied — keep the limited list
            }
        }

        setAudioInputDevices(audioInputs);
    };

    useEffect(() => {
        // Initialize Web Audio API
        const context = new window.AudioContext();
        const analyserNode = context.createAnalyser();
        analyserNode.fftSize = fftSize;
        setAudioContext(context);
        setAnalyser(analyserNode);

        loadAudioInputDevices();
        navigator.mediaDevices.addEventListener('devicechange', loadAudioInputDevices);
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', loadAudioInputDevices);
        };
    }, [fftSize]);

    const drawFFT = () => {
        if (!analyser || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return
        analyser.getByteTimeDomainData(dataArray);

        ctx.fillStyle = "rgb(200 200 200)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgb(0 0 0)";
        ctx.beginPath();

        const sliceWidth = (ctx.canvas.width * 1.0) / dataArray.length;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * ctx.canvas.height) / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }
        ctx.lineTo(ctx.canvas.width, ctx.canvas.height / 2);
        ctx.stroke();
        requestAnimationFrame(drawFFT);
    };

    const handleMediaPublish = async (sourceNode: AudioNode): Promise<MediaStream> => {
        if (!audioContext || !analyser) {
            throw new Error("Audio context or analyser is not initialized");
        }
        if (!publishedMediaStream) {
            let destination = audioContext.createMediaStreamDestination();

            sourceNode.connect(analyser);
            analyser.connect(destination);
            let stream = destination.stream;
            if (!isPublished) {
                await bandwidthRtcClient.publish(stream);
                setIsPublished(true);
                setPublishedMediaStream(stream);
            }
            drawFFT();
            setAudioSourceNode(sourceNode);
            return stream;
        } else {
            return publishedMediaStream;
        }
    }

    const handleMediaUnpublish = async () => {
        if (isPublished) {
            await bandwidthRtcClient.unpublish();
            setIsPublished(false);
            setPublishedMediaStream(null);
        }
        if (audioSourceNode) {
            audioSourceNode.disconnect();
            setAudioSourceNode(null);
        }
    }

    const handlePlayFile = async () => {
        if (!audioContext) {
            throw new Error("Audio context is not initialized");
        }
        let audio
        if (!audioSource) {
            audioContext.resume()

            audio = new Audio("/media/afro-pop.opus");
            audio.muted = false
            let sourceNode = audioContext.createMediaElementSource(audio);
            let mediaStream = await handleMediaPublish(sourceNode)
            setFileMediaStream(mediaStream)
            setAudioSource(audio)
        } else {
            audio = audioSource
        }

        audio.play();
        setIsPlaying(true);
    };

    const handlePauseFile = () => {
        if (audioSource) {
            audioSource.pause();
            setIsPlaying(false);
        }
    };

    const handleStopFile = async () => {
        if (audioSource) {
            audioSource.pause();
            setIsPlaying(false);
            setAudioSource(null);
        }
        if (fileMediaStream) {
            fileMediaStream.getTracks().forEach(track => track.stop());
            setFileMediaStream(null);
        }

        await handleMediaUnpublish()
    };

    const captureMicrophone = async () => {
        if (!audioContext) {
            throw new Error("Audio context is not initialized");
        }
        if (!isCapturingMicrophone) {
            audioContext.resume()
            let constraints: MediaStreamConstraints = {
                audio: selectedAudioInputDeviceId
                    ? { deviceId: { exact: selectedAudioInputDeviceId } }
                    : true,
                video: false
            };
            let microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
            setRawMicrophoneStream(microphoneStream);

            const currentDeviceId = microphoneStream.getAudioTracks()[0]?.getSettings()?.deviceId;
            if (currentDeviceId && !selectedAudioInputDeviceId) {
                setSelectedAudioInputDeviceId(currentDeviceId);
            }

            let sourceNode = audioContext.createMediaStreamSource(microphoneStream);
            let mediaStream = await handleMediaPublish(sourceNode)
            setMicrophoneMediaStream(mediaStream)

            // Refresh device list now that mic permission is granted (labels become available)
            await loadAudioInputDevices();
        }
        setIsCapturingMicrophone(true);
    }

    const handleAudioInputDeviceChange = async (deviceId: string) => {
        setSelectedAudioInputDeviceId(deviceId);
        if (!isCapturingMicrophone || !audioContext || !analyser) return;

        const constraints: MediaStreamConstraints = {
            audio: { deviceId: { exact: deviceId } },
            video: false
        };
        const newMicStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Disconnect old source node from the audio graph
        if (audioSourceNode) {
            audioSourceNode.disconnect();
        }

        // Stop old raw microphone tracks
        if (rawMicrophoneStream) {
            rawMicrophoneStream.getTracks().forEach(track => track.stop());
        }

        // Create new source and connect it to the existing analyser → destination pipeline
        const newSourceNode = audioContext.createMediaStreamSource(newMicStream);
        newSourceNode.connect(analyser);

        setAudioSourceNode(newSourceNode);
        setRawMicrophoneStream(newMicStream);
    }

    const releaseMicrophone = async () => {
        await handleMediaUnpublish()
        if (rawMicrophoneStream) {
            rawMicrophoneStream.getTracks().forEach(track => track.stop());
            setRawMicrophoneStream(null);
        }
        if (microphoneMediaStream) {
            microphoneMediaStream.getTracks().forEach(track => track.stop());
            setMicrophoneMediaStream(null);
        }
        setIsCapturingMicrophone(false);
    };

    return (
        <div>
            <div>
                <audio ref={audioRef} />
                <canvas ref={canvasRef} width={400} height={200} style={{ border: "1px solid black" }} />
                <div>
                    <select
                        value={selectedAudioInputDeviceId}
                        onChange={(e) => handleAudioInputDeviceChange(e.target.value)}
                        disabled={audioInputDevices.length === 0}
                    >
                        {audioInputDevices.length === 0 && <option value="">No devices found</option>}
                        {audioInputDevices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone (${device.deviceId.slice(0, 8)})`}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <button onClick={captureMicrophone} disabled={isCapturingMicrophone || isPlaying}>Capture Microphone</button>
                    <button onClick={releaseMicrophone} disabled={!isCapturingMicrophone || isPlaying}>Release Microphone</button>
                </div>
                <div>
                    <button onClick={handlePlayFile} disabled={isPlaying || isCapturingMicrophone}>Play</button>
                    <button onClick={handlePauseFile} disabled={!isPlaying || isCapturingMicrophone}>Pause</button>
                    <button onClick={handleStopFile} disabled={!isPublished || isCapturingMicrophone}>Stop</button>
                </div>
            </div>
        </div>
    );
}

export default MediaCapture;
