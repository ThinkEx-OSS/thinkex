"use client";

import "regenerator-runtime/runtime";
import { Loader2, Mic, MicOff, Paperclip, Square, ArrowUpIcon } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/assistant-ui/ModelPicker";
import { ModelSettingsMenu } from "@/components/assistant-ui/ModelSettingsMenu";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";

interface ComposerToolbarProps {
  onFilesSelected: (files: File[]) => Promise<void>;
  canSend: boolean;
  onSend: () => Promise<void>;
  onStop: () => Promise<void>;
  isRunning: boolean;
  input: string;
  setInput: (value: string) => void;
}

function SpeechToTextButtonV2({ input, setInput }: Pick<ComposerToolbarProps, "input" | "setInput">) {
  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();
  const [originalText, setOriginalText] = useState("");

  useEffect(() => {
    if (listening && transcript) {
      const separator = originalText && !originalText.endsWith(" ") ? " " : "";
      setInput(originalText + separator + transcript);
    }
  }, [listening, originalText, setInput, transcript]);

  if (!browserSupportsSpeechRecognition) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 rounded-full p-1.5"
      onClick={() => {
        if (listening) {
          SpeechRecognition.stopListening();
          return;
        }
        resetTranscript();
        setOriginalText(input);
        SpeechRecognition.startListening({ continuous: true });
      }}
    >
      {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </Button>
  );
}

export function ComposerToolbar({ onFilesSelected, canSend, onSend, onStop, isRunning, input, setInput }: ComposerToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasUploading = useAttachmentUploadStore((state) => state.uploadingIds.size > 0);

  return (
    <div className="relative mb-2 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void onFilesSelected(files);
          }}
        />
        <Button type="button" variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => fileInputRef.current?.click()}>
          <Paperclip className="size-4" />
        </Button>
        <ModelSettingsMenu />
        <ModelPicker />
      </div>
      <div className="flex items-center gap-2">
        <SpeechToTextButtonV2 input={input} setInput={setInput} />
        {isRunning ? (
          <Button type="button" size="icon" className="size-[34px] rounded-full" onClick={() => void onStop()}>
            <Square className="size-3 fill-current" />
          </Button>
        ) : (
          <Button type="button" size="icon" className="size-[34px] rounded-full" disabled={!canSend || hasUploading} onClick={() => void onSend()}>
            {hasUploading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpIcon className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
