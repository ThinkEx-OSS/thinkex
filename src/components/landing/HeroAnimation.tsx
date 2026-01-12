"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef } from "react";
import { User, Bot, FileText, Plus, Quote, FileIcon, Move, Hand, MessageSquarePlus, X } from "lucide-react";
import { RiChatHistoryFill } from "react-icons/ri";
import { LuMaximize } from "react-icons/lu";
import { FaArrowsAltV } from "react-icons/fa";

// Card colors from Hero.tsx
const cardColors = [
    "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

const HIGHLIGHT_1_TEXT = "utilizes quantum mechanics to solve complex problems faster";
const HIGHLIGHT_2_TEXT = "includes hardware research and application development";

const CARD_1_CONTENT = {
    title: "Quantum Speedup",
    body: "Quantum computers leverage superposition and entanglement to perform calculations exponentially faster than classical supercomputers for specific problem domains like cryptography, optimization, drug discovery, and machine learning. Current quantum processors from IBM, Google, and others demonstrate quantum advantage in specialized algorithms, with error rates improving through advanced quantum error correction techniques and topological qubits."
};

const CARD_2_CONTENT = {
    title: "R&D Scope",
    body: "The field encompasses both the physical engineering of qubits (superconducting circuits operating at millikelvin temperatures, trapped ions with 99.9% fidelity gates, photonic systems for distributed quantum networks, silicon spin qubits for CMOS integration, and topological qubits for inherent error protection) and the sophisticated software layer for developing quantum algorithms, quantum compilers with circuit optimization, and advanced quantum error correction protocols including surface codes and color codes. Research spans from fundamental quantum mechanics and exotic materials science (Majorana fermions, anyons) to practical applications in portfolio optimization, supply chain logistics, drug molecular simulation, cryptographic security, artificial intelligence acceleration, and climate modeling. Current initiatives involve over $25 billion in global investment from tech giants like IBM, Google, Microsoft, Amazon, and national governments pursuing quantum advantage in the NISQ era while building toward fault-tolerant quantum computing with millions of physical qubits by 2030."
};

const CARD_PDF_CONTENT = {
    title: "Quantum_Basics.pdf",
    body: "Comprehensive research document covering quantum computing fundamentals, including quantum mechanics principles, qubit technologies, gate operations, quantum algorithms (Shor's, Grover's, VQE), error correction codes, and current hardware implementations. Contains detailed analysis of quantum supremacy experiments, NISQ-era applications, and future roadmaps for fault-tolerant quantum computing. • 2.4 MB • 127 pages"
};

function MobilePlaceholder() {
    return (
        <div className="relative aspect-[1/2] w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl bg-gradient-to-br from-background to-muted/50">
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 p-4 rounded-full bg-primary/10">
                    <Bot className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                    Interactive Demo
                </h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    Experience our AI-powered workspace on desktop for the full interactive demonstration
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>Best viewed on larger screens</span>
                </div>
            </div>
            
            {/* Decorative elements */}
            <div className="absolute top-4 left-4 w-16 h-16 rounded-md bg-primary/5 border border-primary/10" />
            <div className="absolute top-4 right-4 w-12 h-12 rounded-md bg-secondary/5 border border-secondary/10" />
            <div className="absolute bottom-4 left-4 w-12 h-12 rounded-md bg-accent/5 border border-accent/10" />
            <div className="absolute bottom-4 right-4 w-16 h-16 rounded-md bg-muted/20 border border-muted-foreground/10" />
        </div>
    );
}

export function HeroAnimation() {
    const [step, setStep] = useState<"idle" | "typing" | "tooltip" | "spawning" | "extracting" | "resizing" | "swapping" | "expanding" | "expanded">("idle");
    const [progress, setProgress] = useState(0);
    const [isInView, setIsInView] = useState(false);
    const [greenCursorFinished, setGreenCursorFinished] = useState(false);
    const [orangeCursorClicking, setOrangeCursorClicking] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Check if device is mobile
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768); // md breakpoint
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.intersectionRatio >= 0.75) {
                    setIsInView(true);
                } else {
                    setIsInView(false);
                }
            },
            {
                threshold: 0.75
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', checkMobile);
        };
    }, []);

    useEffect(() => {
        if (!isInView || isMobile) {
            // Reset animation state when not in view
            setStep("idle");
            setProgress(0);
            setGreenCursorFinished(false);
            setOrangeCursorClicking(false);
            return;
        }
        let timeout: NodeJS.Timeout;

        const runSequence = () => {
            // Reset
            setStep("idle");
            setProgress(0);
            setGreenCursorFinished(false);

            // Start typing immediately
            setStep("typing");
            setProgress(15);

            // Finish typing and start highlighting with tooltip
            timeout = setTimeout(() => {
                setStep("tooltip");
                setProgress(45);

                // Start spawning cards from chat UI
                timeout = setTimeout(() => {
                    setStep("spawning");
                    setProgress(55);

                    // Start extracting (simulate click)
                    timeout = setTimeout(() => {
                        setStep("extracting");
                        setProgress(65);

                        // Resize R&D card after extraction (blue cursor)
                        timeout = setTimeout(() => {
                            setStep("resizing");
                            setProgress(75);

                            // Start swapping cards (green cursor) after blue cursor finishes
                            timeout = setTimeout(() => {
                                setStep("swapping");
                                setProgress(85);

                                // Mark green cursor as finished after its movement
                                setTimeout(() => {
                                    setGreenCursorFinished(true);
                                }, 1500);

                                // Card expansion after swapping
                                timeout = setTimeout(() => {
                                    setStep("expanding");
                                    setProgress(95);

                                    // Show expanded view with chat
                                    timeout = setTimeout(() => {
                                        setStep("expanded");
                                        setProgress(100);

                                        // Restart loop
                                        timeout = setTimeout(() => {
                                            runSequence();
                                        }, 4000);
                                    }, 1000);
                                }, 2000);
                            }, 2000); // Wait for blue cursor to finish (increased from 1500 to 2000)
                        }, 2500);
                    }, 1500); // Spawning duration
                }, 2500);
            }, 1500); // Reduced from 2500ms to 1500ms
        };

        runSequence();

        return () => clearTimeout(timeout);
    }, [isInView, isMobile]);

    const showChat = step === "idle" || step === "typing" || step === "tooltip" || step === "spawning";

    // Hide animation on mobile devices
    if (isMobile) {
        return null;
    }

    return (
        <div 
            ref={containerRef}
            className="relative aspect-[1/2] md:aspect-video w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl"
        >
            <AnimatePresence mode="popLayout">
                {showChat && (
                    <motion.div
                        key="chat-interface"
                        initial={{ opacity: 0, x: 0 }}
                        animate={{ 
                            opacity: step === "spawning" ? 0.7 : 1,
                            x: step === "spawning" ? "100%" : "0%"
                        }}
                        exit={{ opacity: 0, x: "100%" }}
                        transition={{ 
                            duration: step === "spawning" ? 1.5 : 0.6,
                            ease: step === "spawning" ? [0.25, 0.46, 0.45, 0.94] : "easeInOut",
                            delay: step === "spawning" ? 0.3 : 0
                        }}
                        className="absolute inset-0 px-8 py-3 md:px-16 md:py-6 flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border/40 pb-2 md:pb-3 mb-2 md:mb-3">
                            <div className="text-sm md:text-lg font-medium text-foreground truncate">Quantum Computing Research</div>
                            <div className="flex items-center gap-1 md:gap-2">
                                {/* Chat History Button */}
                                <button className="inline-flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                    <RiChatHistoryFill className="h-3 w-3 md:h-4 md:w-4" />
                                </button>
                                
                                {/* Maximize Button */}
                                <button className="inline-flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                    <LuMaximize className="h-3 w-3 md:h-4 md:w-4" />
                                </button>
                                
                                {/* Close Button */}
                                <button className="inline-flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                    <X className="h-3 w-3 md:h-4 md:w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Chat Area */}
                        <div className="flex-1 flex flex-col gap-3 md:gap-6 relative z-10">
                            {/* User Message with PDF */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex gap-2 md:gap-4 items-start max-w-[85%] md:max-w-[80%] ml-auto"
                            >
                                <div className="space-y-1 md:space-y-2">
                                    <div className="bg-primary/10 rounded-md rounded-tr-none px-2 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm">
                                        What is quantum computing?
                                    </div>
                                    {/* PDF Attachment */}
                                    <div className="flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded-md border border-border/50 bg-background/50 max-w-[200px] md:max-w-xs ml-auto">
                                        <div className="h-6 w-6 md:h-8 md:w-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${cardColors[5]}20` }}>
                                            <FileIcon className="h-3 w-3 md:h-4 md:w-4" style={{ color: cardColors[5] }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] md:text-xs font-medium truncate">Quantum_Basics.pdf</div>
                                            <div className="text-[8px] md:text-[10px] text-muted-foreground">2.4 MB</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <User className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                                </div>
                            </motion.div>

                            {/* AI Message */}
                            <AnimatePresence>
                                {step !== "idle" && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-2 md:gap-4 items-start max-w-full"
                                    >
                                        <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <Bot className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 space-y-1 md:space-y-2 text-xs md:text-sm leading-relaxed relative text-left">
                                            <div className="prose prose-xs md:prose-sm dark:prose-invert max-w-none text-left">
                                                <p>
                                                    Quantum computing is a revolutionary multidisciplinary field that comprises aspects of computer science, physics, and mathematics that{" "}
                                                    <HighlightableText
                                                        text={HIGHLIGHT_1_TEXT}
                                                        active={step === "tooltip"}
                                                        extracted={false}
                                                        layoutId="highlight-1"
                                                    />
                                                    {" "}than classical computers for certain computational problems. The field of quantum computing{" "}
                                                    <HighlightableText
                                                        text={HIGHLIGHT_2_TEXT}
                                                        active={step === "tooltip"}
                                                        extracted={false}
                                                        layoutId="highlight-2"
                                                    />
                                                    .
                                                </p>
                                                <p className="mt-2">
                                                    Unlike classical bits that exist in definite states of 0 or 1, quantum bits (qubits) can exist in superposition, allowing them to represent both states simultaneously. This fundamental property, combined with quantum entanglement and interference, enables quantum computers to process vast amounts of information in parallel.
                                                </p>
                                                <p className="mt-2">
                                                    Current applications show promise in cryptography, optimization problems, drug discovery, financial modeling, and artificial intelligence. Major tech companies and research institutions are investing billions in quantum research, with IBM, Google, and others achieving significant milestones in quantum supremacy demonstrations.
                                                </p>
                                            </div>

                                            {/* Tooltip appearing over the first highlight */}
                                            <AnimatePresence>
                                                {step === "tooltip" && (
                                                    <MockTooltip isPulsing={orangeCursorClicking} />
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Message Input */}
                        <div className="mt-2 md:mt-4 px-2 md:px-4 pb-2 md:pb-4">
                            <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-md border border-border/30 bg-background/50">
                                <div className="flex-1 text-xs md:text-sm text-muted-foreground text-left">
                                    Send a message...
                                </div>
                                <div className="h-5 w-5 md:h-6 md:w-6 rounded-md bg-primary/20 flex items-center justify-center">
                                    <svg className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cards Layer - Handles both spawning and extracted states */}
            <div className="absolute inset-0 pointer-events-none z-20">
                <AnimatePresence>
                    {(step === "spawning" || step === "extracting" || step === "resizing" || step === "swapping" || step === "expanding" || step === "expanded") && (
                        <>
                            {/* Card 1 */}
                            <ExtractedCard
                                title={CARD_1_CONTENT.title}
                                body={CARD_1_CONTENT.body}
                                index={0}
                                color={cardColors[1]}
                                gridPos={{ top: "10%", left: "5%", width: "40%", height: "40%" }}
                                finalGridPos={{ top: "55%", left: "5%", width: "40%", height: "40%" }}
                                startPos={{ top: "45%", left: "30%" }}
                                spawnPos={{ top: "32%", left: "35%" }}
                                currentStep={step}
                                shouldResize={step === "swapping"}
                                shouldFade={step === "expanding" || step === "expanded"}
                            />
                            {/* Card 2 */}
                            <ExtractedCard
                                title={CARD_2_CONTENT.title}
                                body={CARD_2_CONTENT.body}
                                index={1}
                                color={cardColors[3]}
                                gridPos={{ top: "10%", left: "50%", width: "45%", height: "40%" }}
                                finalGridPos={{ top: "10%", left: "50%", width: "45%", height: "85%" }}
                                startPos={{ top: "55%", left: "40%" }}
                                spawnPos={{ top: "38%", left: "45%" }}
                                currentStep={step}
                                shouldResize={step === "resizing" || step === "swapping" || step === "expanding"}
                                shouldFade={step === "expanding" || step === "expanded"}
                            />
                            {/* PDF Card */}
                            <ExtractedCard
                                title={CARD_PDF_CONTENT.title}
                                body={CARD_PDF_CONTENT.body}
                                index={2}
                                color={cardColors[5]}
                                gridPos={{ top: "55%", left: "5%", width: "40%", height: "40%" }}
                                finalGridPos={{ top: "10%", left: "5%", width: "40%", height: "40%" }}
                                expandedGridPos={{ top: "5%", left: "5%", width: "65%", height: "90%" }}
                                startPos={{ top: "15%", left: "15%" }}
                                spawnPos={{ top: "15%", left: "85%" }}
                                currentStep={step}
                                shouldResize={step === "swapping"}
                                shouldExpand={step === "expanding" || step === "expanded"}
                                icon={<FileIcon className="h-3 w-3 text-white" />}
                            />
                        </>
                    )}
                </AnimatePresence>
            </div>

            {/* Animated Cursors */}
            <AnimatePresence>
                {(step === "tooltip" || step === "spawning" || step === "extracting" || step === "resizing" || step === "swapping") && (
                    <>
                        {/* Tooltip Click Cursor */}
                        {step === "tooltip" && (
                            <motion.div
                                initial={{ 
                                    opacity: 0, 
                                    scale: 0,
                                    top: "70%",
                                    left: "35%"
                                }}
                                animate={{ 
                                    opacity: 1, 
                                    scale: 1,
                                    top: "32%",
                                    left: "35%"
                                }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ 
                                    opacity: { duration: 0.3, delay: 0.8 },
                                    scale: { duration: 0.3, delay: 0.8 },
                                    top: { duration: 0.6, delay: 1.1, ease: "easeOut" },
                                    left: { duration: 0.6, delay: 1.1, ease: "easeOut" }
                                }}
                                className="absolute z-40 pointer-events-none"
                            >
                                <motion.div
                                    animate={{
                                        scale: [1, 0.9, 1],
                                    }}
                                    transition={{
                                        delay: 1.8,
                                        duration: 0.3,
                                        ease: "easeInOut"
                                    }}
                                    onAnimationStart={() => {
                                        // Trigger pulse when click animation starts
                                        setTimeout(() => setOrangeCursorClicking(true), 1800);
                                    }}
                                    onAnimationComplete={() => {
                                        // End pulse when click animation completes
                                        setTimeout(() => setOrangeCursorClicking(false), 100);
                                    }}
                                    className="relative"
                                >
                                    {/* Normal Cursor */}
                                    <svg width="32" height="40" viewBox="0 0 16 20" className="drop-shadow-lg">
                                        <path d="M0 0L0 16L4 12L6 16L8 15L6 11L10 11L0 0Z" fill="black" stroke="white" strokeWidth="1"/>
                                    </svg>
                                </motion.div>
                            </motion.div>
                        )}

                        {/* Resize Cursor - Blue */}
                        {(step === "extracting" || step === "resizing") && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute z-40 pointer-events-none"
                            style={{
                                top: "50%",
                                left: "70%",
                            }}
                        >
                            <motion.div
                                animate={step === "resizing" ? {
                                    y: [0, 200, 80], // Move down for resize, then up diagonally to drag position
                                    x: [0, 0, -400], // Move much further left diagonally to drag cursor start position
                                } : {
                                    y: [0, -8, 0, -5, 0],
                                    x: [0, 3, 0, -2, 0],
                                }}
                                transition={step === "resizing" ? {
                                    duration: 1.5, // Slightly longer to accommodate the diagonal movement
                                    times: [0, 0.67, 1], // Resize down for first 67%, then move diagonally
                                    ease: "easeInOut"
                                } : {
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                className="relative"
                            >
                                {/* Cursor with Task Icon */}
                                <div className="relative">
                                    {step === "resizing" ? (
                                        // Resize Icon
                                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center border-2 border-white shadow-lg">
                                            <FaArrowsAltV className="h-5 w-5 text-white" />
                                        </div>
                                    ) : (
                                        // Normal Cursor
                                        <svg width="32" height="40" viewBox="0 0 16 20" className="drop-shadow-lg">
                                            <path d="M0 0L0 16L4 12L6 16L8 15L6 11L10 11L0 0Z" fill="black" stroke="white" strokeWidth="1"/>
                                        </svg>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                        )}

                        {/* Swap Cursor - Green */}
                        {step === "swapping" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute z-40 pointer-events-none"
                            style={{
                                top: "65%",
                                left: "25%",
                            }}
                        >
                            <motion.div
                                animate={{
                                    x: 40,
                                    y: -120,
                                }}
                                transition={{
                                    duration: 1.5,
                                    ease: [0.25, 0.46, 0.45, 0.94]
                                }}
                                className="relative"
                            >
                                <motion.div
                                    animate={{
                                        scale: [1, 0.8, 1.1, 1],
                                    }}
                                    transition={{
                                        delay: 1.5,
                                        duration: 0.8,
                                        ease: [0.68, -0.55, 0.265, 1.55]
                                    }}
                                >
                                {/* Cursor with Task Icon */}
                                <div className="relative">
                                    {step === "swapping" && !greenCursorFinished ? (
                                        // Grabbing Hand Icon
                                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center border-2 border-white shadow-lg">
                                            <Hand className="h-5 w-5 text-white" />
                                        </div>
                                    ) : (
                                        // Normal Cursor
                                        <svg width="32" height="40" viewBox="0 0 16 20" className="drop-shadow-lg">
                                            <path d="M0 0L0 16L4 12L6 16L8 15L6 11L10 11L0 0Z" fill="black" stroke="white" strokeWidth="1"/>
                                        </svg>
                                    )}
                                </div>
                                </motion.div>
                            </motion.div>
                        </motion.div>
                        )}
                    </>
                )}
            </AnimatePresence>

            {/* AI Chat Sidebar */}
            <AnimatePresence>
                {(step === "expanding" || step === "expanded") && (
                    <motion.div
                        initial={{ opacity: 0, x: "100%" }}
                        animate={{ opacity: 1, x: "0%" }}
                        exit={{ opacity: 0, x: "100%" }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="absolute top-[3%] md:top-[5%] right-[3%] md:right-[5%] w-[35%] md:w-[25%] h-[94%] md:h-[90%] bg-background/95 backdrop-blur-sm border border-border/50 rounded-md shadow-xl z-30"
                    >
                        <div className="p-2 md:p-4 h-full flex flex-col">
                            {/* Chat Header */}
                            <div className="flex items-center justify-between border-b border-border/40 pb-2 md:pb-3 mb-2 md:mb-3">
                                <div className="text-xs md:text-sm font-medium text-foreground truncate">Quantum Computing Research</div>
                                <div className="flex items-center gap-0.5 md:gap-1">
                                    {/* Chat History Button */}
                                    <button className="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                        <RiChatHistoryFill className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
                                    </button>
                                    
                                    {/* Maximize Button */}
                                    <button className="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                        <LuMaximize className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
                                    </button>
                                    
                                    {/* Close Button */}
                                    <button className="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                        <X className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-1 space-y-2 md:space-y-3 text-[9px] md:text-xs">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="flex gap-1 md:gap-2"
                                >
                                    <div className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <Bot className="h-1.5 w-1.5 md:h-2 md:w-2 text-primary" />
                                    </div>
                                    <div className="bg-muted/50 rounded-md rounded-tl-none px-1.5 py-1 md:px-2 md:py-1.5 text-[8px] md:text-[10px] leading-relaxed text-left">
                                        I can help you understand this quantum computing document. What would you like to know?
                                    </div>
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="flex gap-1 md:gap-2 justify-end"
                                >
                                    <div className="bg-primary/10 rounded-md rounded-tr-none px-1.5 py-1 md:px-2 md:py-1.5 text-[8px] md:text-[10px] max-w-[85%] md:max-w-[80%]">
                                        Explain quantum superposition
                                    </div>
                                    <div className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User className="h-1.5 w-1.5 md:h-2 md:w-2 text-muted-foreground" />
                                    </div>
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.9 }}
                                    className="flex gap-1 md:gap-2"
                                >
                                    <div className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <Bot className="h-1.5 w-1.5 md:h-2 md:w-2 text-primary" />
                                    </div>
                                    <div className="bg-muted/50 rounded-md rounded-tl-none px-1.5 py-1 md:px-2 md:py-1.5 text-[8px] md:text-[10px] leading-relaxed text-left">
                                        Quantum superposition allows particles to exist in multiple states simultaneously until measured...
                                    </div>
                                </motion.div>
                            </div>

                            {/* Input Area */}
                            <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-border/40">
                                <div className="flex items-center gap-1 md:gap-2 p-1.5 md:p-2 rounded-md border border-border/30 bg-background/50">
                                    <div className="flex-1 text-[8px] md:text-[10px] text-muted-foreground text-left">
                                        Send a message...
                                    </div>
                                    <div className="h-3 w-3 md:h-4 md:w-4 rounded-md bg-primary/20 flex items-center justify-center">
                                        <svg className="h-2 w-2 md:h-2.5 md:w-2.5 text-primary/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 md:h-1.5 bg-muted/20 overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-primary/70 via-primary to-primary/90 shadow-sm"
                    initial={{ width: "0%" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ 
                        duration: 0.8, 
                        ease: [0.4, 0, 0.2, 1],
                        type: "tween"
                    }}
                />
                {/* Animated shimmer effect */}
                <motion.div
                    className="absolute top-0 left-0 h-full w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: "-100%" }}
                    animate={{ x: progress > 0 ? "400%" : "-100%" }}
                    transition={{
                        duration: 1.5,
                        ease: "easeInOut",
                        repeat: progress > 0 && progress < 100 ? Infinity : 0,
                        repeatDelay: 2
                    }}
                />
            </div>
        </div>
    );
}

function HighlightableText({
    text,
    active,
    extracted,
    layoutId
}: {
    text: string;
    active: boolean;
    extracted: boolean;
    layoutId: string;
}) {
    const isFirstHighlight = layoutId === "highlight-1";
    const delay = isFirstHighlight ? 0 : 0.8;
    
    // Match highlight colors to card colors
    const highlightColor = isFirstHighlight ? cardColors[1] : cardColors[3]; // Blue for first, Orange for second
    const bgColor = `${highlightColor}33`; // 20% opacity
    const borderColor = `${highlightColor}CC`; // 80% opacity

    return (
        <span className="relative inline-block">
            <span className={extracted ? "opacity-0" : "opacity-100 transition-opacity duration-300"}>
                {text}
            </span>
            {active && !extracted && (
                <motion.span
                    layoutId={`${layoutId}-bg`}
                    className="absolute rounded overflow-hidden"
                    style={{ 
                        left: "-4px", 
                        right: "-120px",
                        top: "0px",
                        bottom: "0px",
                        backgroundColor: bgColor,
                        borderColor: borderColor,
                        borderWidth: "1px",
                        borderStyle: "solid"
                    }}
                    initial={{ width: "0%", opacity: 0 }}
                    animate={{ width: "102%", opacity: 1 }}
                    exit={{ width: "0%", opacity: 0 }}
                    transition={{
                        delay,
                        duration: 0.6,
                        ease: "easeOut"
                    }}
                />
            )}
        </span>
    );
}

function MockTooltip({ isPulsing = false }: { isPulsing?: boolean }) {
    return (
        <motion.div
            initial={{ 
                opacity: 0, 
                scale: 0.8, 
                y: 20
            }}
            animate={{ 
                opacity: 1, 
                scale: isPulsing ? [1, 1.05, 1] : 1,
                y: 0
            }}
            exit={{ 
                opacity: 0, 
                scale: 0.8,
                y: 20
            }}
            transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                mass: 0.8,
                opacity: { duration: 0.4, ease: "easeOut" },
                y: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
                ...(isPulsing && {
                    scale: {
                        duration: 0.3,
                        ease: "easeInOut"
                    }
                })
            }}
            className="absolute left-[20%] top-[-50px] z-50 flex flex-col items-center"
        >
            {/* Tooltip Content */}
            <div className="relative flex items-stretch rounded-md bg-card/95 backdrop-blur-sm shadow-lg overflow-visible" style={{ minWidth: 'fit-content' }}>
                {/* Reply Button */}
                <button
                    className="highlight-tooltip-action flex items-center text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-inset focus:ring-white/50 active:scale-95 bg-blue-600 hover:bg-blue-700 rounded-l-md"
                    style={{
                        height: "32px",
                        width: "32px",
                        padding: "0 8px",
                        justifyContent: "center",
                        zIndex: 10,
                    }}
                    aria-label="Reply"
                >
                    <span className="flex-shrink-0 flex items-center justify-center" style={{ width: "16px", height: "16px" }}>
                        <Quote className="h-4 w-4" />
                    </span>
                </button>
                
                {/* Create Note Button */}
                <button
                    className="highlight-tooltip-action flex items-center text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-inset focus:ring-white/50 active:scale-95 bg-green-600 hover:bg-green-700 border-l border-white/20 rounded-r-md"
                    style={{
                        height: "32px",
                        width: "80px",
                        padding: "0 8px",
                        justifyContent: "flex-start",
                        zIndex: 10,
                    }}
                    aria-label="Note"
                >
                    <span className="flex-shrink-0 flex items-center justify-center" style={{ width: "16px", height: "16px" }}>
                        <FileText className="h-4 w-4" />
                    </span>
                    <span className="overflow-hidden whitespace-nowrap ml-1.5" style={{ display: "inline-block", width: "52px" }}>
                        Note
                    </span>
                </button>
            </div>
            
            {/* Tooltip Arrow */}
            <div 
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 transition-all duration-300"
                style={{
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderTop: '8px solid rgb(22, 163, 74)' // Green color for the note button
                }}
            />
        </motion.div>
    );
}

function ExtractedCard({
    title,
    body,
    index,
    color,
    gridPos,
    finalGridPos,
    expandedGridPos,
    startPos,
    spawnPos,
    currentStep,
    shouldResize,
    shouldExpand,
    shouldFade,
    icon
}: {
    title: string;
    body: string;
    index: number;
    color: string;
    gridPos: { top: string; left: string; width: string; height: string };
    finalGridPos?: { top: string; left: string; width: string; height: string };
    expandedGridPos?: { top: string; left: string; width: string; height: string };
    startPos: { top: string; left: string };
    spawnPos?: { top: string; left: string };
    currentStep: string;
    shouldResize?: boolean;
    shouldExpand?: boolean;
    shouldFade?: boolean;
    icon?: React.ReactNode;
}) {
    const currentGridPos = shouldExpand && expandedGridPos ? expandedGridPos : 
                          shouldResize && finalGridPos ? finalGridPos : gridPos;

    // Determine initial position based on current step
    const getInitialState = () => {
        if (currentStep === "spawning" && spawnPos) {
            return {
                opacity: 0,
                scale: 0.1,
                top: spawnPos.top,
                left: spawnPos.left,
                width: "20px",
                height: "20px",
            };
        }
        return {
            opacity: 0,
            scale: 0.4,
            top: startPos.top,
            left: startPos.left,
            width: gridPos.width,
            height: gridPos.height,
        };
    };

    // Determine animation based on current step
    const getAnimateState = () => {
        if (currentStep === "spawning") {
            return {
                opacity: 1,
                scale: 1,
                top: currentGridPos.top,
                left: currentGridPos.left,
                width: currentGridPos.width,
                height: currentGridPos.height,
                rotate: 0,
            };
        }
        return {
            opacity: shouldFade ? 0 : 1,
            scale: 1,
            top: currentGridPos.top,
            left: currentGridPos.left,
            width: currentGridPos.width,
            height: currentGridPos.height,
            rotate: 0,
        };
    };

    // Determine transition based on current step
    const getTransition = () => {
        if (currentStep === "spawning") {
            return {
                type: "tween" as const,
                duration: 1.5,
                delay: index * 0.2,
                ease: [0.25, 0.46, 0.45, 0.94] as const
            };
        }
        return {
            type: shouldFade ? ("tween" as const) : ("spring" as const),
            stiffness: shouldFade ? undefined : 40,
            damping: shouldFade ? undefined : 15,
            duration: shouldFade ? 0.3 : undefined,
            delay: shouldResize ? 0 : index * 0.1
        };
    };

    return (
        <motion.div
            initial={getInitialState()}
            animate={getAnimateState()}
            transition={getTransition()}
            style={{
                backgroundColor: `${color}40`, // Increased opacity but still subtle
                borderColor: `${color}CC`, // More opaque colorful border
                position: "absolute",
            }}
            className="rounded-md shadow-xl border-2 text-white overflow-hidden bg-gray-900/95"
        >
            {shouldExpand && expandedGridPos ? (
                // Expanded PDF Document View
                <div className="p-4 flex flex-col gap-3 w-full h-full">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-2 pb-2 border-b border-white/20"
                    >
                        <div className="h-5 w-5 rounded bg-white/20 flex items-center justify-center shrink-0">
                            {icon || <FileText className="h-3 w-3 text-white" />}
                        </div>
                        <span className="font-semibold text-base truncate">{title}</span>
                    </motion.div>

                    {/* Document Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                        className="flex-1 bg-white rounded-md p-4 text-gray-800 overflow-hidden"
                    >
                        <div className="space-y-3 text-sm leading-relaxed">
                            <div className="font-semibold text-base text-gray-900 mb-3">
                                Quantum Computing Fundamentals
                            </div>
                            
                            <div className="space-y-2">
                                <div className="h-2 bg-gray-200 rounded w-full" />
                                <div className="h-2 bg-gray-200 rounded w-5/6" />
                                <div className="h-2 bg-gray-200 rounded w-4/5" />
                            </div>

                            <div className="mt-4 space-y-2">
                                <div className="h-2 bg-gray-200 rounded w-full" />
                                <div className="h-2 bg-gray-200 rounded w-3/4" />
                                <div className="h-2 bg-gray-200 rounded w-5/6" />
                                <div className="h-2 bg-gray-200 rounded w-2/3" />
                            </div>

                             <div className="mt-4 space-y-2">
                                 <div className="h-2 bg-gray-200 rounded w-4/5" />
                                 <div className="h-2 bg-gray-200 rounded w-full" />
                                 <div className="h-2 bg-gray-200 rounded w-3/4" />
                             </div>

                             <div className="mt-4 space-y-2">
                                 <div className="h-2 bg-gray-200 rounded w-5/6" />
                                 <div className="h-2 bg-gray-200 rounded w-3/4" />
                                 <div className="h-2 bg-gray-200 rounded w-4/5" />
                                 <div className="h-2 bg-gray-200 rounded w-2/3" />
                             </div>
                        </div>
                    </motion.div>
                </div>
            ) : (
                // Normal Card View
                <div className="p-2 md:p-5 flex flex-col gap-1.5 md:gap-3 w-full h-full min-w-[200px] md:min-w-[300px]">
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-1.5 md:gap-2"
                    >
                        <div className="h-4 w-4 md:h-6 md:w-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                            {icon || <FileText className="h-2 w-2 md:h-3 md:w-3 text-white" />}
                        </div>
                        <span className="font-semibold text-sm md:text-base truncate">{title}</span>
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className={`text-xs md:text-sm leading-relaxed opacity-90 text-left ${
                            shouldResize && finalGridPos 
                                ? "line-clamp-12 md:line-clamp-16" 
                                : "line-clamp-3 md:line-clamp-4"
                        }`}
                    >
                        {body}
                    </motion.p>

                    <div className="flex-1" />
                    <div className="flex gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-white/20" />
                        <div className="h-1.5 w-8 rounded-full bg-white/10" />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
