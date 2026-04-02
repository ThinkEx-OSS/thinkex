"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useTheme } from "next-themes";
import "mathlive";
import "mathlive/fonts.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MathfieldElement extends HTMLElement {
    value: string;
    focus(): void;
    blur(): void;
}

export interface MathEditContextValue {
    openDialog: (params: {
        initialLatex: string;
        onSave: (latex: string) => void;
        title?: string;
    }) => void;
    closeDialog: () => void;
}

// ---------------------------------------------------------------------------
// Shared MathLive dialog UI (single implementation, used by both consumers)
// ---------------------------------------------------------------------------

interface MathDialogUIProps {
    open: boolean;
    title: string;
    initialLatex: string;
    onSave: (latex: string) => void;
    onClose: () => void;
}

function MathDialogUI({ open, title, initialLatex, onSave, onClose }: MathDialogUIProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mathfieldRef = useRef<MathfieldElement | null>(null);
    const { resolvedTheme } = useTheme();

    // Ref to always read the freshest MathLive value on save
    const onSaveRef = useRef(onSave);
    useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

    // Create / tear-down the <math-field> when the dialog opens
    useEffect(() => {
        if (!open || !containerRef.current) return;

        containerRef.current.innerHTML = "";

        const mf = document.createElement("math-field") as MathfieldElement;
        mf.value = initialLatex;
        mf.style.display = "block";
        mf.style.width = "100%";
        mf.style.minHeight = "60px";
        mf.style.fontSize = "1.25rem";
        mf.style.padding = "12px";
        mf.style.borderRadius = "8px";

        const isDark = resolvedTheme === "dark";
        mf.style.color = isDark ? "white" : "black";
        mf.style.backgroundColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
        mf.style.border = isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)";
        mf.style.setProperty("--latex-color", isDark ? "white" : "black");

        mf.setAttribute("math-virtual-keyboard-policy", "auto");
        mf.setAttribute("virtual-keyboard-mode", "onfocus");

        containerRef.current.appendChild(mf);
        mathfieldRef.current = mf;

        requestAnimationFrame(() => mf?.focus());

        return () => { mathfieldRef.current = null; };
    }, [open, initialLatex, resolvedTheme]);

    const handleSave = useCallback(() => {
        const latex = mathfieldRef.current?.value ?? initialLatex;
        onSaveRef.current(latex);
        onClose();
    }, [initialLatex, onClose]);

    // Keyboard shortcuts
    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
        };

        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [open, handleSave, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-[500px] mx-4 bg-popover text-popover-foreground rounded-lg border shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button onClick={onClose} className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>
                </div>
                <div ref={containerRef} className="min-h-[80px]" />
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save</Button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Context + Provider for shared math editing UI
// ---------------------------------------------------------------------------

export const MathEditContext = createContext<MathEditContextValue | null>(null);

export function useMathEdit() {
    const ctx = useContext(MathEditContext);
    if (!ctx) throw new Error("useMathEdit must be used within a MathEditProvider");
    return ctx;
}

// Hook to auto-open math dialog when a new empty math element is created
export function useAutoOpenMathDialog(
    latex: string,
    isReadOnly: boolean,
    onSave: (latex: string) => void,
    title: string
) {
    const dialogOpenedRef = useRef(false);
    const onSaveRef = useRef(onSave);
    const mathEdit = useContext(MathEditContext);

    useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        if (!isReadOnly && mathEdit && !latex.trim() && !dialogOpenedRef.current) {
            dialogOpenedRef.current = true;
            timeoutId = setTimeout(() => {
                mathEdit.openDialog({ initialLatex: "", onSave: onSaveRef.current, title });
            }, 0);
        }

        return () => { if (timeoutId) clearTimeout(timeoutId); };
    }, [isReadOnly, mathEdit, latex, title]);
}

export function MathEditProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<{
        open: boolean;
        latex: string;
        title: string;
    }>({ open: false, latex: "", title: "Edit Math" });
    const onSaveRef = useRef<((latex: string) => void) | null>(null);

    const openDialog = useCallback(
        (params: { initialLatex: string; onSave: (latex: string) => void; title?: string }) => {
            onSaveRef.current = params.onSave;
            setState({ open: true, latex: params.initialLatex, title: params.title || "Edit Math" });
        },
        []
    );

    const closeDialog = useCallback(() => {
        setState((s) => ({ ...s, open: false }));
        onSaveRef.current = null;
    }, []);

    const handleSave = useCallback((latex: string) => {
        onSaveRef.current?.(latex);
        closeDialog();
    }, [closeDialog]);

    const contextValue: MathEditContextValue = { openDialog, closeDialog };

    return (
        <MathEditContext.Provider value={contextValue}>
            {children}
            <MathDialogUI
                open={state.open}
                title={state.title}
                initialLatex={state.latex}
                onSave={handleSave}
                onClose={closeDialog}
            />
        </MathEditContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Standalone dialog (used by the TipTap document editor via props, no context needed)
// ---------------------------------------------------------------------------

export interface MathEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialLatex: string;
    onSave: (latex: string) => void;
    title?: string;
}

export function MathEditDialog({ open, onOpenChange, initialLatex, onSave, title = "Edit Math" }: MathEditDialogProps) {
    const handleSave = useCallback(
        (latex: string) => { onSave(latex); onOpenChange(false); },
        [onSave, onOpenChange]
    );

    const handleClose = useCallback(
        () => onOpenChange(false),
        [onOpenChange]
    );

    return (
        <MathDialogUI
            open={open}
            title={title}
            initialLatex={initialLatex}
            onSave={handleSave}
            onClose={handleClose}
        />
    );
}
