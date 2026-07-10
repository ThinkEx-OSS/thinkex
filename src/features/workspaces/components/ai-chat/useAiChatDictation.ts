import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

type BrowserSpeechRecognition = {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onend: (() => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onnomatch: (() => void) | null;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onstart: (() => void) | null;
	abort: () => void;
	start: () => void;
	stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type DictationPhase = "idle" | "starting" | "listening" | "stopping";

const subscribeToSpeechRecognition = () => () => {};
const getSpeechRecognitionSupport = () => Boolean(getSpeechRecognitionConstructor());
const getServerSpeechRecognitionSupport = () => false;

const DICTATION_ERROR_MESSAGES: Partial<Record<SpeechRecognitionErrorCode, string>> = {
	"audio-capture": "No microphone was found.",
	"language-not-supported": "Dictation does not support your browser language.",
	network: "Dictation lost its connection. Try again.",
	"no-speech": "No speech was detected. Try again.",
	"not-allowed": "Allow microphone access in your browser to use dictation.",
	"service-not-allowed": "Dictation is unavailable in this browser.",
};

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
	if (typeof window === "undefined") {
		return null;
	}

	const speechWindow = window as Window & {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	};

	return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function appendTranscript(input: string, transcript: string) {
	const spokenText = transcript.trimStart();
	if (!spokenText) {
		return input;
	}

	const separator = input && !/\s$/.test(input) ? " " : "";
	return `${input}${separator}${spokenText}`;
}

function readTranscript(results: SpeechRecognitionResultList) {
	let transcript = "";

	for (let index = 0; index < results.length; index += 1) {
		transcript += results[index]?.[0]?.transcript ?? "";
	}

	return transcript;
}

export function useAiChatDictation({
	input,
	setInput,
}: {
	input: string;
	setInput: (input: string) => void;
}) {
	const [phase, setPhase] = useState<DictationPhase>("idle");
	const [isUnavailable, setIsUnavailable] = useState(false);
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
	const browserSupportsSpeechRecognition = useSyncExternalStore(
		subscribeToSpeechRecognition,
		getSpeechRecognitionSupport,
		getServerSpeechRecognitionSupport,
	);
	const isSupported = browserSupportsSpeechRecognition && !isUnavailable;

	useEffect(() => {
		return () => {
			const recognition = recognitionRef.current;
			recognitionRef.current = null;
			recognition?.abort();
		};
	}, []);

	const cancel = useCallback(() => {
		const recognition = recognitionRef.current;
		recognitionRef.current = null;
		setPhase("idle");
		recognition?.abort();
	}, []);

	const stop = useCallback(() => {
		const recognition = recognitionRef.current;
		if (!recognition) {
			return;
		}

		if (phase !== "listening") {
			cancel();
			return;
		}

		setPhase("stopping");
		recognition.stop();
	}, [cancel, phase]);

	const start = useCallback(() => {
		const Recognition = getSpeechRecognitionConstructor();
		if (!Recognition || recognitionRef.current) {
			return;
		}

		const recognition = new Recognition();
		const inputBeforeDictation = input;
		const finish = () => {
			if (recognitionRef.current !== recognition) {
				return false;
			}

			recognitionRef.current = null;
			setPhase("idle");
			return true;
		};

		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = navigator.language;
		recognition.onstart = () => {
			if (recognitionRef.current === recognition) {
				setPhase("listening");
			}
		};
		recognition.onresult = (event) => {
			if (recognitionRef.current === recognition) {
				setInput(appendTranscript(inputBeforeDictation, readTranscript(event.results)));
			}
		};
		recognition.onnomatch = () => {
			if (recognitionRef.current === recognition) {
				toast.error("Could not recognize that. Try again.");
			}
		};
		recognition.onerror = (event) => {
			if (!finish()) {
				return;
			}

			if (event.error === "language-not-supported" || event.error === "service-not-allowed") {
				setIsUnavailable(true);
			}

			const message = DICTATION_ERROR_MESSAGES[event.error];
			if (message) {
				toast.error(message);
			}
		};
		recognition.onend = () => {
			finish();
		};

		recognitionRef.current = recognition;
		setPhase("starting");

		try {
			recognition.start();
		} catch {
			finish();
			toast.error("Dictation could not start. Try again.");
		}
	}, [input, setInput]);

	const isActive = phase !== "idle";

	return {
		cancel,
		isActive,
		isListening: phase === "listening",
		isSupported,
		toggle: isActive ? stop : start,
	};
}
