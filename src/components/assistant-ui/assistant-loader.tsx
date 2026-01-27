"use client";

import { useAuiState } from "@assistant-ui/react";
import { useEffect, useRef } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import Typewriter, { TypewriterClass } from "typewriter-effect";

const thinkingMessages = [
    "Thinking",
    "Planning next moves",
    "Analyzing context",
    "Formulating response",
    "Gathering insights",
    "Almost there",
];

export const AssistantLoader = () => {
    const isRunning = useAuiState(
        ({ message }) => (message as { status?: { type: string } })?.status?.type === "running"
    );

    const isMessageEmpty = useAuiState(({ message }) => {
        const msg = message as any;
        return !msg?.content || (Array.isArray(msg.content) && msg.content.length === 0);
    });

    const typewriterRef = useRef<TypewriterClass | null>(null);

    useEffect(() => {
        if (!isRunning || !isMessageEmpty) {
            if (typewriterRef.current) {
                typewriterRef.current.stop();
                typewriterRef.current.deleteAll(1);
            }
            return;
        }

        // Cleanup on unmount
        return () => {
            if (typewriterRef.current) {
                typewriterRef.current.stop();
            }
        };
    }, [isRunning, isMessageEmpty]);

    if (!isRunning || !isMessageEmpty) return null;

    return (
        <div className="flex items-center gap-3 py-2">
            <DotLottieReact
                src="/logo.lottie"
                loop
                autoplay
                mode="bounce"
                className="w-4 h-4 self-center"
            />
            <div className="text-base text-muted-foreground flex items-center">
                <Typewriter
                    onInit={(typewriter) => {
                        typewriterRef.current = typewriter;
                        
                        const cycleMessages = () => {
                            const start = Math.floor(Math.random() * thinkingMessages.length);
                            const ordered = [
                                ...thinkingMessages.slice(start),
                                ...thinkingMessages.slice(0, start),
                            ];
                            
                            ordered.forEach((message, index) => {
                                if (index === 0) {
                                    typewriter.typeString(message);
                                } else {
                                    const prevLen = ordered[index - 1].length;
                                    typewriter
                                        .pauseFor(2000)
                                        .deleteChars(prevLen)
                                        .typeString(message);
                                }
                            });
                            
                            const lastLen = ordered[ordered.length - 1].length;
                            typewriter
                                .pauseFor(2000)
                                .deleteChars(lastLen)
                                .callFunction(() => {
                                    cycleMessages();
                                });
                        };
                        
                        cycleMessages();
                        typewriter.start();
                    }}
                    options={{
                        delay: 20,
                        deleteSpeed: 5,
                        cursor: "",
                        loop: false,
                    }}
                />
            </div>
        </div>
    );
};
