import { useEffect, useState, useCallback } from 'react';

/**
 * Mock mode for development - returns a static PDF without loading WASM
 * Set to false when SwiftLaTeX WASM is integrated
 */
const MOCK_MODE = true;

interface UseLatexCompilerReturn {
    compile: (source: string) => Promise<void>;
    isCompiling: boolean;
    logs: string;
    pdfUrl: string | null;
    error: string | null;
}

/**
 * Hook for compiling LaTeX to PDF using SwiftLaTeX WASM
 * 
 * Phase 1: Mock implementation for testing UI
 * Phase 2: Will integrate actual SwiftLaTeX engine
 */
export function useLatexCompiler(): UseLatexCompilerReturn {
    const [isCompiling, setIsCompiling] = useState(false);
    const [logs, setLogs] = useState('');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!pdfUrl || !pdfUrl.startsWith('blob:')) return;
        return () => {
            URL.revokeObjectURL(pdfUrl);
        };
    }, [pdfUrl]);

    const compile = useCallback(async (source: string) => {
        setIsCompiling(true);
        setError(null);
        setLogs('');
        setPdfUrl(null);

        try {
            if (MOCK_MODE) {
                // Simulate compilation delay
                await new Promise(resolve => setTimeout(resolve, 1000));

                setLogs(`[MOCK MODE] Compilation started...
[MOCK MODE] Processing ${source.length} characters
[MOCK MODE] Loading packages...
[MOCK MODE] Building document structure...
[MOCK MODE] Compilation successful!
[MOCK MODE] Output: 1 page, 0 errors, 0 warnings`);

                // Create a simple mock PDF blob
                const mockPdfData = await fetch('/api/latex/mock-pdf').then(r => r.blob());
                const url = URL.createObjectURL(mockPdfData);
                setPdfUrl(url);
            } else {
                // TODO: Integrate actual SwiftLaTeX WASM engine
                // const engine = await loadSwiftLaTeX();
                // const result = await engine.compile(source);
                // setPdfUrl(result.pdfUrl);
                // setLogs(result.logs);
                throw new Error('SwiftLaTeX integration not yet implemented');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            setLogs(`[ERROR] Compilation failed: ${errorMessage}`);
        } finally {
            setIsCompiling(false);
        }
    }, []);

    return {
        compile,
        isCompiling,
        logs,
        pdfUrl,
        error,
    };
}
