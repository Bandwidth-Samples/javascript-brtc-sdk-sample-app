import React, { useEffect, useRef, useState } from "react";

function MediaPlayer({ inboundStream }: { inboundStream: MediaStream | null }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const contextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const dataArrayRef = useRef(new Uint8Array(512));
    const speakersConnectedRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        contextRef.current = context;
        analyserRef.current = analyser;
    }, []);

    useEffect(() => {
        const context = contextRef.current;
        const analyser = analyserRef.current;
        if (!inboundStream || !context || !analyser || !audioRef.current) {
            if (audioRef.current) {
                audioRef.current.srcObject = null;
            }
            if (sourceRef.current) {
                sourceRef.current.disconnect();
                sourceRef.current = null;
            }
            speakersConnectedRef.current = false;
            setIsPlaying(false);
            return;
        }
        const source = context.createMediaStreamSource(inboundStream);
        source.connect(analyser);
        analyser.connect(context.createMediaStreamDestination());
        audioRef.current.srcObject = inboundStream;
        sourceRef.current = source;
        context.resume();
        drawFFT();
    }, [inboundStream]);

    const drawFFT = () => {
        const analyser = analyserRef.current;
        const canvas = canvasRef.current;
        if (!analyser || !canvas) { return; }
        const ctx = canvas.getContext("2d");
        if (!ctx) { return; }
        const data = dataArrayRef.current;
        analyser.getByteTimeDomainData(data);
        const active = data.some(v => v !== 128);
        ctx.fillStyle = "rgb(200 200 200)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = active ? "rgb(0 0 0)" : "rgb(200 200 200)";
        ctx.beginPath();
        const sliceWidth = ctx.canvas.width / data.length;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0;
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
        const context = contextRef.current;
        const source = sourceRef.current;
        if (!context || !source) { return; }
        await context.resume();
        if (speakersConnectedRef.current) {
            source.disconnect(context.destination);
            speakersConnectedRef.current = false;
            setIsPlaying(false);
        } else {
            source.connect(context.destination);
            speakersConnectedRef.current = true;
            setIsPlaying(true);
        }
    };

    return (
        <div>
            <audio ref={audioRef} />
            <canvas ref={canvasRef} width={400} height={200} style={{ border: "1px solid black" }} />
            <div>
                <button onClick={handlePlay}>{isPlaying ? "Mute" : "Unmute"}</button>
            </div>
        </div>
    );
}

export default MediaPlayer;
