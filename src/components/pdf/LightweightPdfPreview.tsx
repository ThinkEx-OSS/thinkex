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
    const hasRenderedRef = useRef(false);

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

    // Calculate page from saved scroll position
    const estimatedPage = useMemo(() => {
        if (!savedState) return 0;

        const zoom = savedState.zoom || 1.0;
        // Rough estimation: assume ~800px per page at zoom 1.0
        const avgPageHeight = 800 * zoom;
        const page = Math.floor(savedState.scrollTop / avgPageHeight);
        return Math.max(0, Math.min(page, pageCount - 1));
    }, [savedState, pageCount]);

    // Render the pages when ready (prev, current, next)
    useEffect(() => {
        if (!renderCapability || hasRenderedRef.current) return;

        mountedRef.current = true;
        hasRenderedRef.current = true;

        const renderSnapshot = async () => {
            try {
                setIsRendering(true);

                const currentPageIndex = estimatedPage;

                // Set page info for display
                setPageInfo({ current: currentPageIndex + 1, total: pageCount });

                // Get saved zoom or use default (don't cap to preserve user's view)
                // Multiply by device pixel ratio for sharp rendering on retina displays
                const baseScale = savedState?.zoom || 1.0;
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

                // Render all pages and stitch them together
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

                // Render all pages in parallel
                const blobs = await Promise.all(pagesToRender.map(renderPage));

                if (!mountedRef.current) return;

                // Convert blobs to images and stitch them vertically
                const images = await Promise.all(blobs.map(blob => {
                    return new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = URL.createObjectURL(blob);
                    });
                }));

                if (!mountedRef.current) {
                    images.forEach(img => URL.revokeObjectURL(img.src));
                    return;
                }

                // Calculate total canvas size
                const maxWidth = Math.max(...images.map(img => img.width));
                const totalHeight = images.reduce((sum, img) => sum + img.height, 0);
                const gap = 10 * renderDpr; // Small gap between pages

                // Create canvas and stitch images
                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = totalHeight + (images.length - 1) * gap;
                const ctx = canvas.getContext('2d');

                if (ctx) {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    let yOffset = 0;
                    images.forEach((img, i) => {
                        // Center each page horizontally
                        const xOffset = (maxWidth - img.width) / 2;
                        ctx.drawImage(img, xOffset, yOffset);
                        yOffset += img.height + gap;
                    });

                    // Convert to blob
                    canvas.toBlob((blob) => {
                        if (blob && mountedRef.current) {
                            const url = URL.createObjectURL(blob);
                            setImageUrl(url);

                            // Calculate scroll offset - need to account for previous page
                            if (savedState) {
                                const zoom = savedState.zoom || 1.0;
                                const avgPageHeight = 800 * zoom;
                                const pageStartY = currentPageIndex * avgPageHeight;
                                const offsetWithinPage = savedState.scrollTop - pageStartY;

                                // Add height of previous page(s) to offset
                                const prevPagesHeight = currentPageIndex > 0 ? images[0].height + gap : 0;

                                setScrollOffset(prevPagesHeight + Math.max(0, offsetWithinPage * renderDpr));
                            }

                            setIsRendering(false);
                        }
                    }, 'image/webp', 0.92);
                }

                // Cleanup temp image URLs
                images.forEach(img => URL.revokeObjectURL(img.src));

            } catch (e) {
                console.error('[LightweightPdfPreview] Error:', e);
                setIsRendering(false);
            }
        };

        renderSnapshot();

        return () => {
            mountedRef.current = false;
        };
    }, [renderCapability, documentId, estimatedPage, savedState, pageCount]);

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
            initialDocuments: [{ url: pdfSrc }],
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
