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
    const [publishedMediaStream, setPublishedMediaStream] = useState<MediaStream | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isCapturingMicrophone, setIsCapturingMicrophone] = useState<boolean>(false);
    const [isPublished, setIsPublished] = useState<boolean>(false);
    const [dataArray] = useState<Uint8Array>(new Uint8Array(512));
    const fftSize = 512;

    useEffect(() => {
        // Initialize Web Audio API
        const context = new window.AudioContext();
        const analyserNode = context.createAnalyser();
        analyserNode.fftSize = fftSize;
        setAudioContext(context);
        setAnalyser(analyserNode);
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
            let constraints: MediaStreamConstraints = {audio: true, video: false};
            let microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
            let sourceNode = audioContext.createMediaStreamSource(microphoneStream);
            let mediaStream = await handleMediaPublish(sourceNode)
            setMicrophoneMediaStream(mediaStream)
        }
        setIsCapturingMicrophone(true);
    }

    const releaseMicrophone = async () => {
        await handleMediaUnpublish()
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
