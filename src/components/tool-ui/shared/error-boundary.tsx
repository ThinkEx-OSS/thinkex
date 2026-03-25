"use client";

import * as React from "react";
import { capturePosthogException } from "@/lib/posthog-capture-exception";

export interface ToolUIErrorBoundaryProps {
  componentName: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ToolUIErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ToolUIErrorBoundary extends React.Component<
  ToolUIErrorBoundaryProps,
  ToolUIErrorBoundaryState
> {
  constructor(props: ToolUIErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ToolUIErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[${this.props.componentName}] render error:`, error, errorInfo);
    try {
      capturePosthogException(error, {
        error_boundary: "tool_ui",
        component_name: this.props.componentName,
        component_stack: errorInfo.componentStack,
      });
    } catch (telemetryError) {
      console.error(`[${this.props.componentName}] failed to capture PostHog exception:`, telemetryError);
    }
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="my-1 flex w-full items-center overflow-hidden rounded-md border border-border/25 bg-card/50 text-muted-foreground px-2 py-2">
            <span className="text-xs truncate">{this.props.componentName}: {this.state.error?.message}</span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
