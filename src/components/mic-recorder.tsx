import * as React from 'react';
import { TranslationBundle } from '@jupyterlab/translation';

export interface IMicRecorderProps {
  /**
   * The active mode: 'voice' to record audio, or 'dictation' for speech-to-text.
   */
  mode: 'voice' | 'dictation';
  /**
   * Callback triggered when speech is transcribed (dictation mode).
   */
  onTranscription?: (text: string) => void;
  /**
   * Callback triggered when audio recording is finalized (voice mode).
   */
  onAudioRecorded?: (blob: Blob) => void;
  /**
   * Callback triggered when user cancels recording.
   */
  onCancel: () => void;
  /**
   * Callback triggered when dictation is done (dictation mode).
   */
  onDone?: () => void;
  /**
   * The translation bundle.
   */
  trans: TranslationBundle;
}

export const MicRecorder: React.FC<IMicRecorderProps> = ({
  mode,
  onTranscription,
  onAudioRecorded,
  onCancel,
  onDone,
  trans
}) => {
  const [seconds, setSeconds] = React.useState(0);

  // Refs for MediaRecorder (Voice Memo Mode)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerIntervalRef = React.useRef<number | null>(null);

  // Refs for SpeechRecognition (Dictation Mode)
  const speechRecognitionRef = React.useRef<any>(null);

  // Helper to format seconds into mm:ss
  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Start recording/dictating when mounted
  React.useEffect(() => {
    startCapture();

    return () => {
      stopAllCapture();
    };
  }, [mode]);

  const isCapturingRef = React.useRef(false);
  const barRefs = React.useRef<HTMLDivElement[]>([]);
  const audioContextRef = React.useRef<AudioContext | null>(null);

  const startCapture = async () => {
    stopAllCapture();
    setSeconds(0);
    isCapturingRef.current = true;

    if (mode === 'voice') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        audioChunksRef.current = [];

        // Set up real-time audio visualizer
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          let lastTimestamp = 0;
          const throttleMs = 100; // 10 FPS
          const updateVisualizer = (timestamp: number) => {
            if (!isCapturingRef.current) {
              return;
            }
            requestAnimationFrame(updateVisualizer);

            if (timestamp - lastTimestamp < throttleMs) {
              return;
            }
            lastTimestamp = timestamp;

            analyser.getByteFrequencyData(dataArray);

            // Animate our 8 bar elements in real-time
            for (let i = 0; i < 8; i++) {
              const bar = barRefs.current[i];
              if (bar) {
                const value = dataArray[i] || 0;
                // Scale value between 15% and 100% height
                const heightPercent = Math.min(Math.max((value / 255) * 100, 15), 100);
                bar.style.height = `${heightPercent}%`;
              }
            }
          };
          requestAnimationFrame(updateVisualizer);
        } catch (visErr) {
          console.warn('Failed to initialize live visualizer:', visErr);
        }

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          if (onAudioRecorded) {
            onAudioRecorded(audioBlob);
          }
        };

        // Start recording
        mediaRecorder.start(250); // Get chunks every 250ms

        // Start timer
        timerIntervalRef.current = window.setInterval(() => {
          setSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        console.error('Failed to capture audio stream:', err);
        alert(trans.__('Microphone access denied or not available.'));
        onCancel();
      }
    } else {
      // Dictation Mode (Speech to Text)
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        alert(trans.__('Speech recognition is not supported in this browser. Please use Chrome or Edge.'));
        onCancel();
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        speechRecognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let text = '';
          for (let i = 0; i < event.results.length; ++i) {
            text += event.results[i][0].transcript;
          }
          if (onTranscription && text.trim()) {
            onTranscription(text);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            alert(trans.__('Microphone access denied.'));
            onCancel();
          }
        };

        recognition.onend = () => {
          // Restart if it terminates automatically but we are still recording
          if (isCapturingRef.current && speechRecognitionRef.current) {
            try {
              speechRecognitionRef.current.start();
            } catch (e) {
              // Ignore already started errors
            }
          }
        };

        recognition.start();

        // Start timer
        timerIntervalRef.current = window.setInterval(() => {
          setSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        onCancel();
      }
    }
  };

  const stopAllCapture = () => {
    isCapturingRef.current = false;

    // Clear timer
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop and close AudioContext
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (e) {
        console.warn('Failed to close AudioContext:', e);
      }
      audioContextRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore inactive errors
      }
      mediaRecorderRef.current = null;
    }

    // Stop all audio stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Stop Speech Recognition
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.onend = null;
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {
        // Ignore errors
      }
      speechRecognitionRef.current = null;
    }
  };

  const handleDone = () => {
    stopAllCapture();
    if (onDone) {
      onDone();
    }
  };

  const handleCancelClick = () => {
    stopAllCapture();
    onCancel();
  };

  return (
    <div className="jp-ai-inline-recorder">
      <div className="jp-ai-recorder-status">
        <button
          className="jp-ai-audio-play-btn jp-ai-mic-pulse"
          style={{ width: '28px', height: '28px', animationDuration: '1.2s' }}
          type="button"
          disabled
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
          </svg>
        </button>
        <span className="jp-ai-recorder-timer">
          {formatTime(seconds)}
        </span>
      </div>

      {/* Modern Waveform Visualizer */}
      <div className="jp-ai-wave-container">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={`jp-ai-wave-bar${mode === 'dictation' ? ' jp-ai-animating' : ''}`}
            ref={(el) => {
              if (el) {
                barRefs.current[i] = el;
              }
            }}
          />
        ))}
      </div>

      {/* Done & Cancel buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className="jp-ai-approval-btn jp-ai-approval-reject"
          onClick={handleCancelClick}
          title={trans.__('Cancel')}
          style={{ padding: '4px 8px', minWidth: '40px', display: 'flex', alignItems: 'center' }}
          type="button"
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', fill: 'currentColor' }}>
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
        <button
          className="jp-ai-approval-btn jp-ai-approval-approve"
          onClick={handleDone}
          title={trans.__('Done')}
          style={{ padding: '4px 8px', minWidth: '40px', display: 'flex', alignItems: 'center' }}
          type="button"
        >
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', fill: 'currentColor' }}>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
