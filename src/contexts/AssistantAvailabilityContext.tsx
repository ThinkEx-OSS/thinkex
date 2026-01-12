"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Context to indicate whether the AI assistant is available
 * Used by hooks like useCardContextProvider to skip AI-related operations
 * when not inside an AssistantProvider (e.g., in guest mode)
 */
interface AssistantAvailabilityContextType {
    isAssistantAvailable: boolean;
}

const AssistantAvailabilityContext = createContext<AssistantAvailabilityContextType>({
    isAssistantAvailable: false, // Default to false to prevent crashes when provider is missing
});

/**
 * Hook to check if the AI assistant is available
 * Returns false in guest mode, true in authenticated mode
 */
export function useIsAssistantAvailable() {
    const context = useContext(AssistantAvailabilityContext);
    return context.isAssistantAvailable;
}

/**
 * Provider that marks AI assistant as available
 * Wrap the main authenticated app or components that have AssistantRuntimeProvider
 */
export function AssistantAvailableProvider({ children }: { children: ReactNode }) {
    return (
        <AssistantAvailabilityContext.Provider value={{ isAssistantAvailable: true }}>
            {children}
        </AssistantAvailabilityContext.Provider>
    );
}

/**
 * Provider that marks AI assistant as unavailable
 * Wrap components that should not use AI features (e.g., guest preview)
 */
export function NoAssistantProvider({ children }: { children: ReactNode }) {
    return (
        <AssistantAvailabilityContext.Provider value={{ isAssistantAvailable: false }}>
            {children}
        </AssistantAvailabilityContext.Provider>
    );
}
