import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, Check } from 'lucide-react';

interface AudioRecorderProps {
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

const MAX_RECORDING_TIME = 30; // 30 seconds

export function AudioRecorder({ onSave, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Stop recording automatically when reaching MAX_RECORDING_TIME
  useEffect(() => {
    if (isRecording && recordingTime >= MAX_RECORDING_TIME) {
      stopRecording();
    }
  }, [recordingTime, isRecording]);

  // Clean up
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      // Use frequency data for vertical bars instead of an oscilloscope line
      analyser.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = 'rgb(250, 250, 250)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        canvasCtx.fillStyle = 'rgb(220, 38, 38)'; // Red color for recording
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up AudioContext for visualizer
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256; // Smaller fftSize for fewer, wider frequency bars

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'audio/mp4'; 
        const audioBlob = new Blob(audioChunksRef.current, { type });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
        
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
      };

      mediaRecorder.start(200); 
      setIsRecording(true);
      setRecordingTime(0);
      setPlaybackTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      drawVisualizer();
    } catch (err) {
      console.error('Error accessing microphone', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setPlaybackTime(Math.floor(audioRef.current.currentTime));
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setPlaybackTime(0);
  };

  const handleSave = () => {
    if (audioBlob) {
      onSave(audioBlob);
    }
  };

  const handleDiscard = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setPlaybackTime(0);
    audioChunksRef.current = [];
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (Math.floor(seconds % 60)).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 border border-border bg-bg/20">
      {!audioBlob ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {isRecording ? 'Recording...' : 'Ready to record'}
            </span>
            <span className={`text-xs font-bold font-mono ${isRecording ? 'text-red-500' : 'text-foreground'}`}>
              {formatTime(recordingTime)} / {formatTime(MAX_RECORDING_TIME)}
            </span>
          </div>
          
          <div className="h-16 w-full bg-white border border-border overflow-hidden rounded relative flex items-center justify-center">
            {isRecording ? (
              <>
                <canvas ref={canvasRef} width="400" height="64" className="w-full h-full object-cover" />
                <div 
                  className="absolute top-0 bottom-0 left-0 bg-red-500/10 border-r-2 border-red-500 transition-all duration-1000 ease-linear pointer-events-none"
                  style={{ width: `${(recordingTime / MAX_RECORDING_TIME) * 100}%` }}
                />
              </>
            ) : (
              <div className="text-muted-foreground opacity-30">
                <Mic className="w-6 h-6" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="py-2 px-4 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all flex items-center gap-2 shadow"
              >
                <Mic className="w-3.5 h-3.5" /> Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="py-2 px-4 bg-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-black/80 transition-all flex items-center gap-2 shadow animate-pulse"
              >
                <Square className="w-3.5 h-3.5" /> Stop Recording
              </button>
            )}
            <button
              onClick={onCancel}
              className="text-[10px] uppercase font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={togglePlayback}
              className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow hover:bg-accent/90 shrink-0"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-1" />}
            </button>
            
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-foreground opacity-70">
                  Preview Voice Note
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatTime(playbackTime)} / {formatTime(recordingTime)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-100 ease-linear" 
                  style={{ width: `${recordingTime > 0 ? (playbackTime / recordingTime) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl!}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              className="hidden"
              controls={false}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSave}
              className="py-2 px-4 bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all flex items-center gap-2 shadow"
            >
              <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button
              onClick={handleDiscard}
              className="py-2 px-4 border border-border text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
