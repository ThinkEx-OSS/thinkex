import { create } from "zustand";

export interface AudioRecordingState {
  // Recording state
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // seconds
  audioBlob: Blob | null;
  error: string | null;

  // Internals (not reactive, but stored for access)
  _mediaRecorder: MediaRecorder | null;
  _stream: MediaStream | null;
  _chunks: Blob[];
  _timerId: ReturnType<typeof setInterval> | null;

  // Dialog visibility (recording continues regardless)
  isDialogOpen: boolean;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  openDialog: () => void;
  closeDialog: () => void;
  setDuration: (d: number) => void;
}

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

export const useAudioRecordingStore = create<AudioRecordingState>((set, get) => ({
  isRecording: false,
  isPaused: false,
  duration: 0,
  audioBlob: null,
  error: null,
  _mediaRecorder: null,
  _stream: null,
  _chunks: [],
  _timerId: null,
  isDialogOpen: false,

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  setDuration: (d) => set({ duration: d }),

  startRecording: async () => {
    const state = get();
    // Clean up any previous recording
    if (state._timerId) clearInterval(state._timerId);
    if (state._mediaRecorder && state._mediaRecorder.state !== "inactive") {
      state._mediaRecorder.stop();
    }
    if (state._stream) {
      state._stream.getTracks().forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const s = get();
        if (s._timerId) clearInterval(s._timerId);
        if (s._stream) {
          s._stream.getTracks().forEach((t) => t.stop());
        }
        set({
          audioBlob: blob,
          isRecording: false,
          isPaused: false,
          _mediaRecorder: null,
          _stream: null,
          _chunks: [],
          _timerId: null,
          // Auto-open dialog when recording stops so user can review
          isDialogOpen: true,
        });
      };

      recorder.onerror = () => {
        set({ error: "Recording failed. Please try again.", isRecording: false });
        const s = get();
        if (s._timerId) clearInterval(s._timerId);
      };

      recorder.start(1000);

      const timerId = setInterval(() => {
        set((s) => ({ duration: s.duration + 1 }));
      }, 1000);

      set({
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioBlob: null,
        error: null,
        _mediaRecorder: recorder,
        _stream: stream,
        _chunks: chunks,
        _timerId: timerId,
      });
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        set({ error: "Microphone access denied. Please allow microphone access." });
      } else if (err.name === "NotFoundError") {
        set({ error: "No microphone found. Please connect a microphone." });
      } else {
        set({ error: err.message || "Failed to start recording." });
      }
    }
  },

  stopRecording: () => {
    const state = get();
    if (state._mediaRecorder && state._mediaRecorder.state !== "inactive") {
      state._mediaRecorder.stop(); // triggers onstop which updates state
    }
  },

  pauseRecording: () => {
    const state = get();
    if (state._mediaRecorder && state._mediaRecorder.state === "recording") {
      state._mediaRecorder.pause();
      if (state._timerId) clearInterval(state._timerId);
      set({ isPaused: true, _timerId: null });
    }
  },

  resumeRecording: () => {
    const state = get();
    if (state._mediaRecorder && state._mediaRecorder.state === "paused") {
      state._mediaRecorder.resume();
      const timerId = setInterval(() => {
        set((s) => ({ duration: s.duration + 1 }));
      }, 1000);
      set({ isPaused: false, _timerId: timerId });
    }
  },

  resetRecording: () => {
    const state = get();
    if (state._timerId) clearInterval(state._timerId);
    if (state._mediaRecorder && state._mediaRecorder.state !== "inactive") {
      state._mediaRecorder.stop();
    }
    if (state._stream) {
      state._stream.getTracks().forEach((t) => t.stop());
    }
    set({
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioBlob: null,
      error: null,
      _mediaRecorder: null,
      _stream: null,
      _chunks: [],
      _timerId: null,
    });
  },
}));
