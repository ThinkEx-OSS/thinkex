"use client";

import { Component, ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantRuntime } from "@assistant-ui/react";
import { toast } from "sonner";

interface Props {
    runtime: AssistantRuntime;
    children: ReactNode;
}

interface State {
    hasError: boolean;
    errorCount: number;
    isRecovering: boolean;
}

export class SafeAssistantRuntimeProvider extends Component<Props, State> {
    private recoveryTimeout: NodeJS.Timeout | null = null;

    private static isTransientErrorMessage(errorMessage: string): boolean {
        return (
            errorMessage.includes("tapLookupResources") ||
            errorMessage.includes("Resource not found") ||
            errorMessage.includes("argsText can only be appended") ||
            errorMessage.includes("does not start with")
        );
    }

    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, errorCount: 0, isRecovering: false };
    }

    static getDerivedStateFromError(error: unknown) {
        // Check if this is a known transient error that we can recover from
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTransientError = SafeAssistantRuntimeProvider.isTransientErrorMessage(errorMessage);

        // For transient errors, return NULL to avoid any state change
        // This completely suppresses the error and prevents re-renders that cause focus loss
        if (isTransientError) {
            console.warn("[SafeAssistantRuntimeProvider] Suppressing transient error:",
                errorMessage.substring(0, 100));
            return null; // No state change - error is completely suppressed
        }

        return { hasError: true, isRecovering: false };
    }

    componentDidCatch(error: unknown, errorInfo: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // List of known transient errors that we can safely suppress and recover from
        const isTransientError = SafeAssistantRuntimeProvider.isTransientErrorMessage(errorMessage);

        if (isTransientError) {
            // For transient errors, just log and return - no state changes
            // The error has already been suppressed in getDerivedStateFromError
            console.warn("[SafeAssistantRuntimeProvider] Transient error suppressed, continuing:",
                errorMessage.substring(0, 100));
            return; // Do nothing - error is completely swallowed
        } else {
            console.error("[SafeAssistantRuntimeProvider] Unhandled error:", error, errorInfo);

            // Clear any existing recovery timeout
            if (this.recoveryTimeout) {
                clearTimeout(this.recoveryTimeout);
            }

            // For non-transient errors, still try to recover after a delay
            this.recoveryTimeout = setTimeout(() => {
                if (this.state.hasError) {
                    this.setState((prev) => ({
                        hasError: false,
                        errorCount: prev.errorCount + 1
                    }));
                }
            }, 100);
        }
    }

    componentDidUpdate(prevProps: Props) {
        // If runtime changed, reset all error states
        if (prevProps.runtime !== this.props.runtime) {
            if (this.state.hasError || this.state.isRecovering) {
                this.setState({ hasError: false, isRecovering: false, errorCount: 0 });
            }
        }
    }

    componentWillUnmount() {
        if (this.recoveryTimeout) {
            clearTimeout(this.recoveryTimeout);
        }
    }

    render() {
        // During recovery or minor errors, keep rendering children
        // This prevents the blank screen issue
        if (this.state.isRecovering) {
            // Keep rendering - the recovery timeout will clear this state quickly
            return (
                <AssistantRuntimeProvider runtime={this.props.runtime}>
                    {this.props.children}
                </AssistantRuntimeProvider>
            );
        }

        if (this.state.hasError) {
            // For serious errors, still try to render but with the runtime
            // This is better than returning null which causes blank screen
            if (this.state.errorCount < 3) {
                // Try to render anyway - the componentDidCatch recovery will kick in
                return (
                    <AssistantRuntimeProvider runtime={this.props.runtime}>
                        {this.props.children}
                    </AssistantRuntimeProvider>
                );
            }

            // After 3 failed attempts, show a minimal fallback
            console.error("[SafeAssistantRuntimeProvider] Multiple recovery attempts failed, rendering fallback");
            return (
                <div className="p-4 text-sm text-muted-foreground">
                    Assistant temporarily unavailable. Please reload to try again.
                </div>
            );
        }

        return (
            <AssistantRuntimeProvider runtime={this.props.runtime}>
                {this.props.children}
            </AssistantRuntimeProvider>
        );
    }
}
