import React, {useEffect, useRef, useState} from "react";


function MediaPlayer({inboundStream}: {inboundStream: MediaStream | null}) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [audioSourceNode, setAudioSourceNode] = useState<AudioNode | null>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
    const [dataArray] = useState<Uint8Array>(new Uint8Array(512));
    const [directMediaStream, setDirectMediaStream] = useState<MediaStream | null>(null);
    const [localOutputAudioNode, setLocalOutputAudioNode] = useState<AudioNode | undefined>(undefined);

    useEffect(() => {
        const context = new window.AudioContext();
        const analyserNode = context.createAnalyser();
        analyserNode.fftSize = 512;
        setAudioContext(context);
        setAnalyser(analyserNode);
    }, []);

    useEffect(() => {
        if (inboundStream && audioContext && analyser && audioRef.current && !isSubscribed) {
            const sourceNode = audioContext.createMediaStreamSource(inboundStream);
            const destination = audioContext.createMediaStreamDestination();
            sourceNode.connect(analyser);
            analyser.connect(destination);
            drawFFT();
            audioRef.current.srcObject = inboundStream;
            setAudioSourceNode(sourceNode);
            setIsSubscribed(true);
            audioContext.resume();
            setDirectMediaStream(destination.stream);
        } else if (!inboundStream && isSubscribed) {
            if (audioRef.current) {
                audioRef.current.srcObject = null;
            }
            setIsSubscribed(false);
            setAudioSourceNode(null);
            setDirectMediaStream(null);
        }
    }, [inboundStream, audioContext, analyser]);

    const drawFFT = () => {
        if (!analyser || !canvasRef.current) return;
        let bgColor = "rgb(200 200 200)";
        let lineColor = "rgb(0 0 0)";
        let drawFft = false;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] !== 128) {
                drawFft = true;
                break;
            }
        }
        if (!drawFft) {
            bgColor = "rgb(200 200 200)";
            lineColor = "rgb(200 200 200)";
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
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


    const handlePlay = async () => {
        const sourceNode = audioSourceNode;
        if (!sourceNode || !audioContext || !directMediaStream) return;
        await audioContext.resume();
        if (!localOutputAudioNode) {
            setLocalOutputAudioNode(sourceNode.connect(audioContext.destination));
            setIsPlaying(true);
        } else {
            sourceNode.disconnect(audioContext.destination);
            setLocalOutputAudioNode(undefined);
            setIsPlaying(false);
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
