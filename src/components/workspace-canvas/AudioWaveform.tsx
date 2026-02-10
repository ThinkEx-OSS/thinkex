"use client";

import { useRef, useEffect } from "react";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Number of bars to render */
  barCount?: number;
  /** Color of the bars (CSS color string) */
  barColor?: string;
  /** Additional className for the canvas */
  className?: string;
}

export function AudioWaveform({
  width = 200,
  height = 60,
  barCount = 32,
  barColor = "currentColor",
  className,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const smoothedRef = useRef<Float32Array | null>(null);
  const analyser = useAudioRecordingStore((s) => s._analyser);
  const isRecording = useAudioRecordingStore((s) => s.isRecording);
  const isPaused = useAudioRecordingStore((s) => s.isPaused);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser || !isRecording) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Initialise smoothed values
    if (!smoothedRef.current || smoothedRef.current.length !== barCount) {
      smoothedRef.current = new Float32Array(barCount);
    }
    const smoothed = smoothedRef.current;
    const smoothing = 0.15; // lower = smoother / slower
    const decay = 0.92; // how quickly bars fall back down

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      if (isPaused) {
        // When paused, draw flat lines
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = canvas.width / barCount;
        const gap = 2;
        ctx.fillStyle = barColor;
        for (let i = 0; i < barCount; i++) {
          const x = i * barWidth;
          const barH = 2;
          const y = (canvas.height - barH) / 2;
          ctx.fillRect(x + gap / 2, y, barWidth - gap, barH);
        }
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / barCount;
      const gap = 2;
      const samplesPerBar = Math.floor(bufferLength / barCount);

      ctx.fillStyle = barColor;

      for (let i = 0; i < barCount; i++) {
        // Average the amplitude of a chunk of samples for this bar
        let sum = 0;
        const start = i * samplesPerBar;
        for (let j = start; j < start + samplesPerBar; j++) {
          const v = (dataArray[j] - 128) / 128; // normalize to -1..1
          sum += Math.abs(v);
        }
        const raw = sum / samplesPerBar;

        // Smooth: rise fast, fall slow
        if (raw > smoothed[i]) {
          smoothed[i] += (raw - smoothed[i]) * smoothing * 3; // rise faster
        } else {
          smoothed[i] *= decay; // gentle decay
        }

        const barH = Math.min(canvas.height, Math.max(2, smoothed[i] * canvas.height * 5));
        const x = i * barWidth;
        const y = (canvas.height - barH) / 2;

        // Rounded bars
        const radius = Math.min((barWidth - gap) / 2, barH / 2, 3);
        ctx.beginPath();
        ctx.roundRect(x + gap / 2, y, barWidth - gap, barH, radius);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyser, isRecording, isPaused, barCount, barColor]);

  // Clear canvas when not recording
  useEffect(() => {
    if (!isRecording) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isRecording]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={cn("pointer-events-none", className)}
      style={{ width, height }}
    />
  );
}
