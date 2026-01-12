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
}

export class SafeAssistantRuntimeProvider extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: unknown) {
        return { hasError: true };
    }

    componentDidCatch(error: unknown, errorInfo: unknown) {
        // Only suppress the known tapLookupResources error which is transient
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("tapLookupResources") || errorMessage.includes("Resource not found")) {
            console.warn("[SafeAssistantRuntimeProvider] Caught transient runtime error, attempting graceful recovery:", error);
            // Attempt to recover by resetting error state after a short delay
            // This allows the tree to re-mount, hopefully after the race condition passes
            setTimeout(() => {
                if (this.state.hasError) {
                    this.setState({ hasError: false });
                }
            }, 50);
        } else {
            console.error("[SafeAssistantRuntimeProvider] Unhandled error:", error, errorInfo);
        }
    }

    componentDidUpdate(prevProps: Props) {
        // If runtime changed, try to recover from error state
        if (prevProps.runtime !== this.props.runtime && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            // Return null to unmount the failed tree.
            // The componentDidCatch timeout will trigger a re-mount.
            return null;
        }

        return (
            <AssistantRuntimeProvider runtime={this.props.runtime}>
                {this.props.children}
            </AssistantRuntimeProvider>
        );
    }
}
