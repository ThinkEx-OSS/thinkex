"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import "mathlive";
import "mathlive/fonts.css";

// MathfieldElement interface
interface MathfieldElement extends HTMLElement {
    value: string;
    focus(): void;
    blur(): void;
}

// Context for the shared math edit dialog
interface MathEditContextValue {
    openDialog: (params: {
        initialLatex: string;
        onSave: (latex: string) => void;
        title?: string;
    }) => void;
    closeDialog: () => void;
}

const MathEditContext = createContext<MathEditContextValue | null>(null);

// Hook to access the math edit context
export function useMathEdit() {
    const context = useContext(MathEditContext);
    if (!context) {
        throw new Error("useMathEdit must be used within a MathEditProvider");
    }
    return context;
}

// Provider component that renders a single shared MathEditDialog
export function MathEditProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentLatex, setCurrentLatex] = useState("");
    const [title, setTitle] = useState("Edit Math");
    const onSaveRef = useRef<((latex: string) => void) | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const mathfieldRef = useRef<MathfieldElement | null>(null);

    const openDialog = useCallback(
        (params: { initialLatex: string; onSave: (latex: string) => void; title?: string }) => {
            setCurrentLatex(params.initialLatex);
            onSaveRef.current = params.onSave;
            setTitle(params.title || "Edit Math");
            setIsOpen(true);
        },
        []
    );

    const closeDialog = useCallback(() => {
        setIsOpen(false);
        onSaveRef.current = null;
    }, []);

    const handleSave = useCallback(() => {
        const finalLatex = mathfieldRef.current?.value ?? currentLatex;
        if (onSaveRef.current) {
            onSaveRef.current(finalLatex);
        }
        closeDialog();
    }, [currentLatex, closeDialog]);

    const handleCancel = useCallback(() => {
        closeDialog();
    }, [closeDialog]);

    // Create mathfield when dialog opens
    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        // Clear any existing content
        containerRef.current.innerHTML = "";

        // Create new mathfield
        const mf = document.createElement("math-field") as MathfieldElement;
        mf.value = currentLatex;
        mf.style.display = "block";
        mf.style.width = "100%";
        mf.style.minHeight = "60px";
        mf.style.fontSize = "1.25rem";
        mf.style.padding = "12px";
        mf.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
        mf.style.borderRadius = "8px";
        mf.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        mf.style.color = "white";

        // Enable virtual keyboard
        mf.setAttribute("math-virtual-keyboard-policy", "auto");
        mf.setAttribute("virtual-keyboard-mode", "onfocus");

        containerRef.current.appendChild(mf);
        mathfieldRef.current = mf;

        // Focus after a frame
        requestAnimationFrame(() => {
            mf?.focus();
        });

        // Handle input
        const handleInput = () => {
            setCurrentLatex(mf.value);
        };
        mf.addEventListener("input", handleInput);

        return () => {
            mf.removeEventListener("input", handleInput);
        };
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle keyboard shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
            }
        };

        document.addEventListener("keydown", handleKeyDown, true);
        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [isOpen, handleSave, handleCancel]);

    const contextValue: MathEditContextValue = {
        openDialog,
        closeDialog,
    };

    return (
        <MathEditContext.Provider value={contextValue}>
            {children}

            {/* Single shared dialog instance */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) handleCancel();
                    }}
                >
                    {/* Overlay - clicking closes the dialog */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

                    {/* Dialog */}
                    <div className="relative z-10 w-full max-w-[500px] mx-4 bg-popover text-popover-foreground rounded-lg border shadow-lg p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">{title}</h2>
                            <button
                                onClick={handleCancel}
                                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close</span>
                            </button>
                        </div>

                        {/* Math field container */}
                        <div ref={containerRef} className="min-h-[80px]" />

                        {/* Footer */}
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={handleCancel}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave}>Save</Button>
                        </div>
                    </div>
                </div>
            )}
        </MathEditContext.Provider>
    );
}

// Legacy standalone dialog (for backwards compatibility if needed)
export interface MathEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialLatex: string;
    onSave: (latex: string) => void;
    title?: string;
}

export function MathEditDialog({
    open,
    onOpenChange,
    initialLatex,
    onSave,
    title = "Edit Math",
}: MathEditDialogProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mathfieldRef = useRef<MathfieldElement | null>(null);
    const [currentLatex, setCurrentLatex] = useState(initialLatex);

    // Reset latex when dialog opens with new initial value
    useEffect(() => {
        if (open) {
            setCurrentLatex(initialLatex);
        }
    }, [open, initialLatex]);

    // Create mathfield when dialog opens
    useEffect(() => {
        if (!open || !containerRef.current) return;

        // Clear any existing content
        containerRef.current.innerHTML = "";

        // Create new mathfield
        const mf = document.createElement("math-field") as MathfieldElement;
        mf.value = currentLatex;
        mf.style.display = "block";
        mf.style.width = "100%";
        mf.style.minHeight = "60px";
        mf.style.fontSize = "1.25rem";
        mf.style.padding = "12px";
        mf.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
        mf.style.borderRadius = "8px";
        mf.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        mf.style.color = "white";

        // Enable virtual keyboard
        mf.setAttribute("math-virtual-keyboard-policy", "auto");
        mf.setAttribute("virtual-keyboard-mode", "onfocus");

        containerRef.current.appendChild(mf);
        mathfieldRef.current = mf;

        // Focus after a frame
        requestAnimationFrame(() => {
            mf?.focus();
        });

        // Handle input
        const handleInput = () => {
            setCurrentLatex(mf.value);
        };
        mf.addEventListener("input", handleInput);

        return () => {
            mf.removeEventListener("input", handleInput);
        };
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = useCallback(() => {
        const finalLatex = mathfieldRef.current?.value ?? currentLatex;
        onSave(finalLatex);
        onOpenChange(false);
    }, [currentLatex, onSave, onOpenChange]);

    const handleCancel = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    // Handle keyboard shortcuts
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
            }
        };

        document.addEventListener("keydown", handleKeyDown, true);
        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [open, handleSave, handleCancel]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={(e) => {
                if (e.target === e.currentTarget) handleCancel();
            }}
        >
            {/* Overlay - clicking closes the dialog */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-[500px] mx-4 bg-popover text-popover-foreground rounded-lg border shadow-lg p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button
                        onClick={handleCancel}
                        className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>
                </div>

                {/* Math field container */}
                <div ref={containerRef} className="min-h-[80px]" />

                {/* Footer */}
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>Save</Button>
                </div>
            </div>
        </div>
    );
}
