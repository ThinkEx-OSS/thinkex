'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { useEngineContext } from '@embedpdf/engines/react';
import { DocumentContent, DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { RenderPluginPackage, useRenderCapability } from '@embedpdf/plugin-render/react';
import { Loader2 } from 'lucide-react';

interface PdfSavedState {
    scrollTop: number;
    zoom: number;
    currentPage?: number;
    timestamp: number;
}

const PDF_STATE_PREFIX = 'pdf-state-';

interface LightweightPdfPreviewProps {
    pdfSrc: string;
    className?: string;
}

interface PdfSnapshotRendererProps {
    documentId: string;
    pdfSrc: string;
    className?: string;
    pageCount: number;
}

function getErrorDetails(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    if (typeof error === 'object' && error !== null) {
        const maybeError = error as Record<string, unknown>;
        return {
            name: typeof maybeError.name === 'string' ? maybeError.name : undefined,
            message: typeof maybeError.message === 'string' ? maybeError.message : undefined,
            code: maybeError.code,
            reason: maybeError.reason,
        };
    }

    return { value: error };
}

function hasLikelyStaleCurrentPage(state: PdfSavedState, pageCount: number): boolean {
    if (pageCount <= 1) return false;
    if (typeof state.currentPage !== 'number' || state.currentPage < 1) return false;
    if (state.currentPage > 1) return false;

    const zoom = state.zoom || 1.0;
    const approxFirstPageHeight = 800 * zoom;
    return state.scrollTop > approxFirstPageHeight * 1.25;
}

/**
 * Internal component that renders the PDF snapshot once document is loaded
 */
function PdfSnapshotRenderer({
    documentId,
    pdfSrc,
    className,
    pageCount
}: PdfSnapshotRendererProps) {
    const { provides: renderCapability } = useRenderCapability();

    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(true);
    const [pageInfo, setPageInfo] = useState<{ current: number; total: number } | null>(null);
    const [scrollOffset, setScrollOffset] = useState<number>(0);
    const [displayScale, setDisplayScale] = useState(1); // Track DPR to scale image back down
    const mountedRef = useRef(true);

    // Get saved state from localStorage
    const savedState = useMemo((): PdfSavedState | null => {
        try {
            const storageKey = `${PDF_STATE_PREFIX}${encodeURIComponent(pdfSrc)}`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('[LightweightPdfPreview] Failed to load saved state:', e);
        }
        return null;
    }, [pdfSrc]);

    // Determine which page to display.
    // Prefer the explicitly saved currentPage (1-indexed) over the approximate
    // scrollTop heuristic, which drifts significantly on tall documents.
    const estimatedPage = useMemo(() => {
        if (!savedState) return 0;

        const hasCurrentPage = typeof savedState.currentPage === 'number' && savedState.currentPage >= 1;
        const currentPageLooksStale = hasCurrentPage && hasLikelyStaleCurrentPage(savedState, pageCount);
        const exactCurrentPage = typeof savedState.currentPage === 'number' ? savedState.currentPage : 1;

        if (hasCurrentPage && !currentPageLooksStale) {
            // Use exact saved page (convert 1-indexed → 0-indexed)
            return Math.max(0, Math.min(exactCurrentPage - 1, pageCount - 1));
        }

        // Fallback for old cached states that don't have currentPage (or stale currentPage)
        const zoom = savedState.zoom || 1.0;
        const avgPageHeight = 800 * zoom;
        const page = Math.floor(savedState.scrollTop / avgPageHeight);
        return Math.max(0, Math.min(page, pageCount - 1));
    }, [savedState, pageCount]);

    // Keep refs always pointing at the latest values so the render effect can read
    // them without needing them in its dependency array. This avoids the old race
    // where hasRenderedRef blocked a re-render after estimatedPage settled while
    // renderCapability was already available.
    const estimatedPageRef = useRef(estimatedPage);
    estimatedPageRef.current = estimatedPage;
    const savedStateRef = useRef(savedState);
    savedStateRef.current = savedState;

    // Render the pages when ready (prev, current, next).
    // Depends only on renderCapability and pageCount — the truly async values that
    // determine when we are ready to render. estimatedPage and savedState are read
    // synchronously via refs inside the async callback.
    useEffect(() => {
        if (!renderCapability || pageCount === 0) return;

        mountedRef.current = true;

        const renderSnapshot = async () => {
            try {
                setIsRendering(true);

                // Read latest values via refs so this effect doesn't need to re-run
                // every time estimatedPage or savedState changes.
                const currentPageIndex = estimatedPageRef.current;
                const currentSavedState = savedStateRef.current;

                // Set page info for display
                setPageInfo({ current: currentPageIndex + 1, total: pageCount });

                // Get saved zoom or use default (don't cap to preserve user's view)
                // Multiply by device pixel ratio for sharp rendering on retina displays
                const baseScale = currentSavedState?.zoom || 0.5;
                const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                const renderDpr = Math.min(dpr, 2); // Cap DPR at 2x to avoid huge renders
                const scale = baseScale * renderDpr;

                // Store the DPR used for scaling the image back down in display
                setDisplayScale(renderDpr);

                // Get the render scope for this document
                const renderScope = renderCapability.forDocument(documentId);
                if (!renderScope) {
                    console.warn('[LightweightPdfPreview] No render scope available');
                    setIsRendering(false);
                    return;
                }

                // Determine pages to render (prev, current, next)
                const pagesToRender: number[] = [];
                if (currentPageIndex > 0) pagesToRender.push(currentPageIndex - 1);
                pagesToRender.push(currentPageIndex);
                if (currentPageIndex < pageCount - 1) pagesToRender.push(currentPageIndex + 1);

                // Render pages one-by-one. A failure on one page should not blank the entire preview.
                const renderPage = (pageIdx: number): Promise<Blob> => {
                    return new Promise((resolve, reject) => {
                        const task = renderScope.renderPage({
                            pageIndex: pageIdx,
                            options: {
                                scaleFactor: scale,
                                imageType: 'image/webp',
                                imageQuality: 0.92,
                                withAnnotations: true,
                                withForms: true,
                            }
                        });
                        task.wait(resolve, reject);
                    });
                };

                const renderedPages: Array<{ pageIdx: number; blob: Blob }> = [];
                for (const pageIdx of pagesToRender) {
                    try {
                        const blob = await renderPage(pageIdx);
                        renderedPages.push({ pageIdx, blob });
                    } catch (error) {
                        console.error('[LightweightPdfPreview] Failed to render page', {
                            documentId,
                            pageIdx,
                            pageCount,
                            requestedCurrentPage: currentPageIndex,
                            error: getErrorDetails(error),
                        });
                    }
                }

                if (renderedPages.length === 0) {
                    console.error('[LightweightPdfPreview] No pages rendered for snapshot', {
                        documentId,
                        pageCount,
                        requestedCurrentPage: currentPageIndex,
                    });
                    setImageUrl(null);
                    setIsRendering(false);
                    return;
                }

                if (!mountedRef.current) return;

                // Convert blobs to images and stitch them vertically
                const images: Array<{ pageIdx: number; image: HTMLImageElement }> = [];
                for (const { pageIdx, blob } of renderedPages) {
                    try {
                        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => resolve(img);
                            img.onerror = reject;
                            img.src = URL.createObjectURL(blob);
                        });
                        images.push({ pageIdx, image });
                    } catch (error) {
                        console.error('[LightweightPdfPreview] Failed to decode rendered page image', {
                            documentId,
                            pageIdx,
                            error: getErrorDetails(error),
                        });
                    }
                }

                if (images.length === 0) {
                    console.error('[LightweightPdfPreview] All rendered page images failed to decode', {
                        documentId,
                        pageCount,
                        requestedCurrentPage: currentPageIndex,
                    });
                    setImageUrl(null);
                    setIsRendering(false);
                    return;
                }

                if (!mountedRef.current) {
                    images.forEach(({ image }) => URL.revokeObjectURL(image.src));
                    return;
                }

                // Calculate total canvas size
                const maxWidth = Math.max(...images.map(({ image }) => image.width));
                const totalHeight = images.reduce((sum, { image }) => sum + image.height, 0);
                const gap = 10 * renderDpr; // Small gap between pages
                const pageOffsetMap = new Map<number, number>();
                const hasCurrentPage = images.some(({ pageIdx }) => pageIdx === currentPageIndex);
                const displayPageIndex = hasCurrentPage ? currentPageIndex : images[0].pageIdx;

                // Create canvas and stitch images
                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = totalHeight + (images.length - 1) * gap;
                const ctx = canvas.getContext('2d');

                if (ctx) {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    let yOffset = 0;
                    images.forEach(({ pageIdx, image }) => {
                        pageOffsetMap.set(pageIdx, yOffset);
                        // Center each page horizontally
                        const xOffset = (maxWidth - image.width) / 2;
                        ctx.drawImage(image, xOffset, yOffset);
                        yOffset += image.height + gap;
                    });

                    // Convert to blob
                    canvas.toBlob((blob) => {
                        if (blob && mountedRef.current) {
                            const url = URL.createObjectURL(blob);
                            setImageUrl((prevUrl) => {
                                if (prevUrl) URL.revokeObjectURL(prevUrl);
                                return url;
                            });
                            setPageInfo({ current: displayPageIndex + 1, total: pageCount });

                            // Calculate scroll offset relative to the rendered page used for display.
                            // For modern saved state with exact currentPage, anchor to page top to avoid
                            // drift/overshoot artifacts from approximated per-page heights.
                            const pageTopOffset = pageOffsetMap.get(displayPageIndex) ?? 0;
                            const displayPageImage = images.find(({ pageIdx }) => pageIdx === displayPageIndex)?.image;
                            const displayPageHeight = displayPageImage?.height ?? 0;
                            const hasExactCurrentPage =
                                typeof currentSavedState?.currentPage === 'number' &&
                                currentSavedState.currentPage >= 1 &&
                                !hasLikelyStaleCurrentPage(currentSavedState, pageCount);

                            if (currentSavedState && !hasExactCurrentPage) {
                                // Legacy state fallback: no saved currentPage. Keep old heuristic but
                                // constrain the offset to the active page bounds.
                                const zoom = currentSavedState.zoom || 1.0;
                                const avgPageHeight = 800 * zoom;
                                const pageStartY = displayPageIndex * avgPageHeight;
                                const offsetWithinPage = currentSavedState.scrollTop - pageStartY;
                                const rawOffset = pageTopOffset + Math.max(0, offsetWithinPage * renderDpr);
                                const pageMaxOffset = pageTopOffset + Math.max(0, displayPageHeight - 1);
                                const clampedOffset = Math.min(Math.max(pageTopOffset, rawOffset), pageMaxOffset);
                                setScrollOffset(clampedOffset);
                            } else {
                                // Exact state path (or no state): stable page-top preview.
                                const clampedOffset = Math.min(Math.max(0, pageTopOffset), Math.max(0, canvas.height - 1));
                                setScrollOffset(clampedOffset);
                            }

                            setIsRendering(false);
                        } else if (mountedRef.current) {
                            console.error('[LightweightPdfPreview] Failed to create snapshot blob', {
                                documentId,
                                pageCount,
                                requestedCurrentPage: currentPageIndex,
                            });
                            setImageUrl(null);
                            setIsRendering(false);
                        }
                    }, 'image/webp', 0.92);
                }

                // Cleanup temp image URLs
                images.forEach(({ image }) => URL.revokeObjectURL(image.src));

            } catch (e) {
                console.error('[LightweightPdfPreview] Error:', getErrorDetails(e));
                setIsRendering(false);
            }
        };

        renderSnapshot();

        return () => {
            mountedRef.current = false;
        };
    }, [renderCapability, documentId, pageCount]);

    // Cleanup image URL on unmount
    useEffect(() => {
        return () => {
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    if (isRendering) {
        return (
            <div className={`flex items-center justify-center bg-[#1a1a1a] ${className || ''}`}>
                <div className="flex items-center gap-2 text-white/40">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">Rendering...</span>
                </div>
            </div>
        );
    }

    if (!imageUrl) {
        return (
            <div className={`flex items-center justify-center bg-[#1a1a1a] ${className || ''}`}>
                <div className="text-white/40 text-xs">PDF Preview</div>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden bg-[#1a1a1a] flex justify-center ${className || ''}`}>
            <div
                className="h-full"
                style={{
                    // Position the image to show the same scroll offset (vertical only)
                    // Divide by displayScale since the image is rendered at higher DPR
                    transform: `translateY(-${scrollOffset / displayScale}px)`,
                }}
            >
                <img
                    src={imageUrl}
                    alt="PDF Preview"
                    className="max-w-none"
                    style={{
                        // Scale the image back down by DPR to display at correct visual size
                        // while maintaining high resolution
                        width: 'auto',
                        height: 'auto',
                        transform: `scale(${1 / displayScale})`,
                        transformOrigin: 'top center',
                    }}
                    draggable={false}
                />
            </div>
            {/* Page indicator */}
            {pageInfo && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/70 text-[10px]">
                    Page {pageInfo.current} of {pageInfo.total}
                </div>
            )}
        </div>
    );
}

/**
 * A lightweight PDF preview that renders a static image of the current page.
 * Uses minimal plugins (no interaction layers) for fast rendering.
 */
export function LightweightPdfPreview({ pdfSrc, className }: LightweightPdfPreviewProps) {
    const { engine, isLoading: engineLoading } = useEngineContext();

    // Minimal plugins - just enough to render a page image
    const plugins = useMemo(() => [
        createPluginRegistration(DocumentManagerPluginPackage, {
            // Use full-fetch so renderPage can access deep pages in this minimal, non-scrolling instance.
            initialDocuments: [{ url: pdfSrc, mode: 'full-fetch' }],
        }),
        createPluginRegistration(RenderPluginPackage, {
            withForms: true,
            withAnnotations: true,
        }),
    ], [pdfSrc]);

    if (engineLoading || !engine) {
        return (
            <div className={`flex items-center justify-center bg-[#1a1a1a] ${className || ''}`}>
                <div className="flex items-center gap-2 text-white/40">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <EmbedPDF engine={engine} plugins={plugins}>
            {({ activeDocumentId }) =>
                activeDocumentId ? (
                    <DocumentContent documentId={activeDocumentId}>
                        {({ isLoading, isLoaded, documentState }) => (
                            <>
                                {isLoading && (
                                    <div className={`flex items-center justify-center bg-[#1a1a1a] ${className || ''}`}>
                                        <div className="flex items-center gap-2 text-white/40">
                                            <Loader2 size={16} className="animate-spin" />
                                            <span className="text-xs">Loading PDF...</span>
                                        </div>
                                    </div>
                                )}
                                {isLoaded && documentState?.document && (
                                    <PdfSnapshotRenderer
                                        documentId={activeDocumentId}
                                        pdfSrc={pdfSrc}
                                        className={className}
                                        pageCount={documentState.document.pageCount || 1}
                                    />
                                )}
                            </>
                        )}
                    </DocumentContent>
                ) : (
                    <div className={`flex items-center justify-center bg-[#1a1a1a] ${className || ''}`}>
                        <div className="flex items-center gap-2 text-white/40">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-xs">Initializing...</span>
                        </div>
                    </div>
                )
            }
        </EmbedPDF>
    );
}

export default LightweightPdfPreview;
