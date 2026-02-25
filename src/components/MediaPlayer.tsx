import React, {useEffect, useRef, useState} from "react";
import BandwidthRtc, {RtcStream} from "bandwidth-rtc";

function MediaPlayer({bandwidthRtcClient, inCall, setInCall}: {bandwidthRtcClient: BandwidthRtc, inCall: boolean, setInCall: (inCall: boolean) => void} ) {
    if (!bandwidthRtcClient) {
        throw new Error("webrtcClient is required");
    }
    if (!setInCall) {
        throw new Error("setInCall is required");
    }

    // Register inbound media handler
    bandwidthRtcClient.onStreamAvailable(async (s) => {
        console.log("Stream available:", s)
        setInCall(true);
        await handleMediaSubscribe(s)
    });
    bandwidthRtcClient.onStreamUnavailable(async (s) => {
        console.log("Stream unavailable:", s)
        setInCall(false);
        await handleMediaUnsubscribe(s)
    })

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [audioSource, setAudioSource] = useState<HTMLAudioElement | null>(null);
    const [audioSourceNode, setAudioSourceNode] = useState<AudioNode | null>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
    const [dataArray, setDataArray] = useState<Uint8Array>(new Uint8Array(512));
    const [fftSize, setFftSize] = useState<number>(512);
    const [directMediaStream, setDirectMediaStream] = useState<MediaStream | null>(null);
    const [localOutputAudioNode, setLocalOutputAudioNode] = useState<AudioNode | undefined>(undefined);
    const [outputStreamSourceNode, setOutputStreamSourceNode] = useState<AudioNode | undefined>(undefined);

    useEffect(() => {
        // Initialize Web Audio API
        const context = new window.AudioContext();
        const analyserNode = context.createAnalyser();
        analyserNode.fftSize = fftSize;
        setAudioContext(context);
        setAnalyser(analyserNode);
    }, []);

    const drawFFT = () => {
        if (!analyser || !canvasRef.current) return;
        let bgColor = "rgb(200 200 200)";
        let lineColor = "rgb(0 0 0)";
        let drawFft = false;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] != 128) {
                drawFft = true;
                break;
            }
        }
        if (!drawFft) {
            // Clear the FFT
            bgColor = "rgb(200 200 200)";
            lineColor = "rgb(200 200 200)";
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return
        analyser.getByteTimeDomainData(dataArray);

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = lineColor;
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

    const handleMediaSubscribe = async (rtcStream: RtcStream): Promise<MediaStream> => {
        if (!audioContext || !analyser) {
            throw new Error("Audio context or analyser is not initialized");
        }
        if (!audioRef.current) {
            throw new Error("Audio element is not initialized");
        }
        if (!isSubscribed) {
            let sourceNode = audioContext.createMediaStreamSource(rtcStream.mediaStream);
            let destination = audioContext.createMediaStreamDestination();

            sourceNode.connect(analyser);
            analyser.connect(destination);
            let stream = destination.stream;
            drawFFT();
            audioRef.current.srcObject = rtcStream.mediaStream;
            setAudioSourceNode(sourceNode);
            setIsSubscribed(true);
            await audioContext.resume()
            setDirectMediaStream(stream)
            return stream;
        } else {
            throw new Error("Already subscribed to media");
        }
    }

    const handleMediaUnsubscribe = async (s: RtcStream) => {
        console.log("Unsubscribing from stream:", s.mediaStream.id);
        // Stop playing if we are
        if (isPlaying) {
            await handlePlay()
        }
        if (isSubscribed) {
            setIsSubscribed(false);
            setAudioSourceNode(null);
            setDirectMediaStream(null);
        }
    }

    const handlePlay = async () => {
        console.log("handlePlay")
        let sourceNode = audioSourceNode;
        if (!sourceNode) {
            console.log("sourceNode is null")
            return
        }
        if (!audioContext) {
            throw new Error("Audio context is not initialized");
            return
        }
        if (!directMediaStream) {
            console.log("directMediaStream is null")
            return
        }
        if (!sourceNode) {
            sourceNode = audioContext.createMediaStreamSource(directMediaStream)
            // audioRef.current.srcObject = mediaStream;
            setOutputStreamSourceNode(sourceNode)
        }
        if (!localOutputAudioNode) {
            setLocalOutputAudioNode(sourceNode.connect(audioContext.destination))
            setIsPlaying(true)
        } else {
            if (localOutputAudioNode) {
                sourceNode.disconnect(audioContext.destination);
                setLocalOutputAudioNode(undefined)
                setIsPlaying(false)
            }
        }
    };

    return (
        <div>
            <div>
                <audio ref={audioRef} />
                <canvas ref={canvasRef} width={400} height={200} style={{ border: "1px solid black" }} />
                <div>
                    <button onClick={handlePlay}>{isPlaying ? "Mute" : "Unmute"}</button>
                </div>
            </div>
        </div>
    );
}

export default MediaPlayer;
