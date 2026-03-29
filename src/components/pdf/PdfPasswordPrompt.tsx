'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, AlertCircle, Eye, EyeOff, FileText } from 'lucide-react';
import { DocumentState } from '@embedpdf/core';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { cn } from '@/lib/utils';

// Password error code from PDFium (value 4 = FPDF_ERR_PASSWORD)
const PDF_ERROR_PASSWORD = 4;

const PDF_PASSWORD_PREFIX = 'pdf-password-';

interface PdfPasswordPromptProps {
    documentState: DocumentState;
    pdfSrc: string;
}

/**
 * Get cached password from localStorage for a PDF URL
 */
export function getCachedPassword(pdfSrc: string): string | null {
    try {
        const key = `${PDF_PASSWORD_PREFIX}${encodeURIComponent(pdfSrc)}`;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

/**
 * Save password to localStorage for a PDF URL
 */
export function cachePassword(pdfSrc: string, password: string): void {
    try {
        const key = `${PDF_PASSWORD_PREFIX}${encodeURIComponent(pdfSrc)}`;
        localStorage.setItem(key, password);
    } catch (e) {
        console.warn('[PdfPasswordPrompt] Failed to cache password:', e);
    }
}

/**
 * Clear cached password for a PDF URL
 */
export function clearCachedPassword(pdfSrc: string): void {
    try {
        const key = `${PDF_PASSWORD_PREFIX}${encodeURIComponent(pdfSrc)}`;
        localStorage.removeItem(key);
    } catch {
        // Ignore errors
    }
}

export function PdfPasswordPrompt({ documentState, pdfSrc }: PdfPasswordPromptProps) {
    const { provides } = useDocumentManagerCapability();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [rememberPassword, setRememberPassword] = useState(true);
    const [triedCached, setTriedCached] = useState(false);

    if (!documentState) return null;

    const { name, errorCode, passwordProvided } = documentState;

    const isPasswordError = errorCode === PDF_ERROR_PASSWORD;
    const isPasswordRequired = isPasswordError && !passwordProvided;
    const isPasswordIncorrect = isPasswordError && passwordProvided;

    // Try cached password automatically on mount
    useEffect(() => {
        if (triedCached || !provides || !isPasswordRequired) return;

        const cached = getCachedPassword(pdfSrc);
        if (cached) {
            setTriedCached(true);
            setIsRetrying(true);

            const task = provides.retryDocument(documentState.id, { password: cached });
            task.wait(
                () => {
                    setIsRetrying(false);
                },
                () => {
                    // Cached password was wrong, clear it
                    clearCachedPassword(pdfSrc);
                    setIsRetrying(false);
                }
            );
        } else {
            setTriedCached(true);
        }
    }, [provides, isPasswordRequired, pdfSrc, documentState.id, triedCached]);

    // Generic error state (not password-related)
    if (!isPasswordError) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="w-full max-w-sm text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-sidebar-foreground">
                        Error loading document
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {documentState.error || 'An unknown error occurred'}
                    </p>
                    {errorCode && (
                        <p className="mt-1 text-xs text-muted-foreground/70">
                            Error code: {errorCode}
                        </p>
                    )}
                    <button
                        onClick={() => provides?.closeDocument(documentState.id)}
                        className="mt-4 inline-flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-4 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80"
                    >
                        Close Document
                    </button>
                </div>
            </div>
        );
    }

    const handleRetry = useCallback(() => {
        if (!provides || !password.trim()) return;
        setIsRetrying(true);

        const task = provides.retryDocument(documentState.id, { password });
        task.wait(
            () => {
                // Success - cache password if remember is checked
                if (rememberPassword) {
                    cachePassword(pdfSrc, password);
                }
                setPassword('');
                setIsRetrying(false);
            },
            (error) => {
                console.error('[PdfPasswordPrompt] Retry failed:', error);
                setIsRetrying(false);
            }
        );
    }, [provides, password, documentState.id, rememberPassword, pdfSrc]);

    // Show loading if trying cached password
    if (isRetrying && !password && triedCached) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm">Unlocking document...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-sm overflow-hidden rounded-xl border border-sidebar-border bg-sidebar shadow-lg">
                {/* Header */}
                <div className="flex items-start gap-4 border-b border-sidebar-border p-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                        <Lock className="h-5 w-5 text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-sidebar-foreground">
                            Password Required
                        </h3>
                        {name && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <FileText size={12} />
                                {name}
                            </p>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-4">
                    <p className="text-sm text-muted-foreground">
                        {isPasswordRequired && 'This document is protected. Enter the password to view it.'}
                        {isPasswordIncorrect && 'Incorrect password. Please try again.'}
                    </p>

                    {/* Password Input */}
                    <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-medium text-sidebar-foreground/70">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !isRetrying && password.trim() && handleRetry()}
                                disabled={isRetrying}
                                placeholder="Enter password"
                                autoFocus
                                className={cn(
                                    "block w-full rounded-lg border bg-sidebar-accent px-3 py-2.5 pr-10 text-sm text-sidebar-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
                                    isPasswordIncorrect ? 'border-destructive/50' : 'border-sidebar-border'
                                )}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-sidebar-foreground transition-colors"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Error message */}
                    {isPasswordIncorrect && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                            <AlertCircle size={14} />
                            <span>The password you entered is incorrect</span>
                        </div>
                    )}

                    {/* Remember checkbox */}
                    <label className="mt-4 flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rememberPassword}
                            onChange={(e) => setRememberPassword(e.target.checked)}
                            className="h-4 w-4 rounded border-sidebar-border bg-sidebar-accent text-primary focus:ring-primary focus:ring-offset-0"
                        />
                        <span className="text-xs text-muted-foreground">Remember password for this document</span>
                    </label>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 border-t border-sidebar-border bg-sidebar-accent/50 px-4 py-3">
                    <button
                        onClick={() => provides?.closeDocument(documentState.id)}
                        disabled={isRetrying}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRetry}
                        disabled={isRetrying || !password.trim()}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isRetrying ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Unlocking...
                            </>
                        ) : (
                            'Unlock'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
