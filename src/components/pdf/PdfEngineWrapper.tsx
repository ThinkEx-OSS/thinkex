'use client';

import { usePdfiumEngine, PdfEngineProvider } from '@embedpdf/engines/react';
import { ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

export function PdfEngineWrapper({ children }: Props) {
    const { engine, isLoading, error } = usePdfiumEngine();

    return (
        <PdfEngineProvider engine={engine} isLoading={isLoading} error={error}>
            {children}
        </PdfEngineProvider>
    );
}

// Export a simpler hook for consuming context if needed, though useEngineContext is available from package
export { useEngineContext } from '@embedpdf/engines/react';
