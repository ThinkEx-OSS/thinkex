import "regenerator-runtime/runtime";
import { Mic, MicOff } from "lucide-react";
import { FC, useEffect, useState } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useAssistantApi } from "@assistant-ui/react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

export const SpeechToTextButton: FC = () => {
    const api = useAssistantApi();
    const {
        transcript,
        listening,
        resetTranscript,
        browserSupportsSpeechRecognition
    } = useSpeechRecognition();

    const [originalText, setOriginalText] = useState("");

    // When transcript changes, update composer text
    useEffect(() => {
        if (listening && transcript) {
            // We append the transcript to the original text
            // Ideally we would insert at cursor, but appending is safer for now
            const separator = originalText && !originalText.endsWith(' ') ? ' ' : '';
            api.composer().setText(originalText + separator + transcript);
        }
    }, [transcript, listening, originalText, api]);

    const handleStartListening = () => {
        // Reset transcript before starting a new session
        resetTranscript();

        // Capture current text before starting
        const currentText = api.composer().getState().text;
        setOriginalText(currentText);

        SpeechRecognition.startListening({ continuous: true });
    };

    const handleStopListening = () => {
        SpeechRecognition.stopListening();
    };

    const toggleListening = () => {
        if (listening) {
            handleStopListening();
        } else {
            handleStartListening();
        }
    };

    if (!browserSupportsSpeechRecognition) {
        return null; // Or render a disabled button with tooltip
    }

    return (
        <TooltipIconButton
            type="button"
            tooltip={listening ? "Stop listening" : "Speak to type"}
            side="top"
            variant="ghost"
            onClick={toggleListening}
            className={cn(
                "size-8 p-1.5 rounded-full transition-colors",
                listening && "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50",
                !listening && "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
        >
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </TooltipIconButton>
    );
};
