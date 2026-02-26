'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { useEngineContext } from '@embedpdf/engines/react';
import { DocumentContent, DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { RenderPluginPackage, useRenderCapability } from '@embedpdf/plugin-render/react';
import { Loader2 } from 'lucide-react';

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
        return { name: error.name, message: error.message, stack: error.stack };
    }
    if (typeof error === 'object' && error !== null) {
        const e = error as Record<string, unknown>;
        return {
            name: typeof e.name === 'string' ? e.name : undefined,
            message: typeof e.message === 'string' ? e.message : undefined,
            code: e.code,
            reason: e.reason,
        };
    }
    return { value: error };
}

/**
 * Internal component that renders the PDF snapshot once document is loaded.
 * Reads the saved currentPage from localStorage and renders prev/current/next pages
 * stitched into a single image, anchored to the top of the current page.
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
    const [pageTopOffset, setPageTopOffset] = useState(0);
    const [displayScale, setDisplayScale] = useState(1);
    const mountedRef = useRef(true);

    // Read saved page (0-indexed) from localStorage
    const savedPageIndex = useMemo(() => {
        try {
            const storageKey = `${PDF_STATE_PREFIX}${encodeURIComponent(pdfSrc)}`;
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const saved = JSON.parse(raw);
                const page = saved.currentPage ?? 1;
                return Math.max(0, Math.min(page - 1, pageCount - 1));
            }
        } catch (e) {
            console.warn('[LightweightPdfPreview] Failed to load saved state:', e);
        }
        return 0;
    }, [pdfSrc, pageCount]);

    const savedPageRef = useRef(savedPageIndex);
    savedPageRef.current = savedPageIndex;

    useEffect(() => {
        if (!renderCapability || pageCount === 0) return;

        mountedRef.current = true;

        const renderSnapshot = async () => {
            try {
                setIsRendering(true);
                const currentPageIndex = savedPageRef.current;
                setPageInfo({ current: currentPageIndex + 1, total: pageCount });

                const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                const renderDpr = Math.min(dpr, 2);
                const scale = 0.5 * renderDpr;
                setDisplayScale(renderDpr);

                const renderScope = renderCapability.forDocument(documentId);
                if (!renderScope) {
                    setIsRendering(false);
                    return;
                }

                const pagesToRender: number[] = [];
                if (currentPageIndex > 0) pagesToRender.push(currentPageIndex - 1);
                pagesToRender.push(currentPageIndex);
                if (currentPageIndex < pageCount - 1) pagesToRender.push(currentPageIndex + 1);

                const renderPage = (pageIdx: number): Promise<Blob> =>
                    new Promise((resolve, reject) => {
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

                const renderedPages: Array<{ pageIdx: number; blob: Blob }> = [];
                for (const pageIdx of pagesToRender) {
                    try {
                        const blob = await renderPage(pageIdx);
                        renderedPages.push({ pageIdx, blob });
                    } catch (error) {
                        console.error('[LightweightPdfPreview] Failed to render page', {
                            pageIdx, error: getErrorDetails(error),
                        });
                    }
                }

                if (renderedPages.length === 0 || !mountedRef.current) {
                    if (mountedRef.current) { setImageUrl(null); setIsRendering(false); }
                    return;
                }

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
                        console.error('[LightweightPdfPreview] Failed to decode page image', {
                            pageIdx, error: getErrorDetails(error),
                        });
                    }
                }

                if (images.length === 0 || !mountedRef.current) {
                    images.forEach(({ image }) => URL.revokeObjectURL(image.src));
                    if (mountedRef.current) { setImageUrl(null); setIsRendering(false); }
                    return;
                }

                const maxWidth = Math.max(...images.map(({ image }) => image.width));
                const totalHeight = images.reduce((sum, { image }) => sum + image.height, 0);
                const gap = 10 * renderDpr;
                const offsetMap = new Map<number, number>();

                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = totalHeight + (images.length - 1) * gap;
                const ctx = canvas.getContext('2d');

                if (ctx) {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    let yOffset = 0;
                    images.forEach(({ pageIdx, image }) => {
                        offsetMap.set(pageIdx, yOffset);
                        const xOffset = (maxWidth - image.width) / 2;
                        ctx.drawImage(image, xOffset, yOffset);
                        yOffset += image.height + gap;
                    });

                    const hasPage = images.some(({ pageIdx }) => pageIdx === currentPageIndex);
                    const displayIdx = hasPage ? currentPageIndex : images[0].pageIdx;

                    canvas.toBlob((blob) => {
                        if (blob && mountedRef.current) {
                            const url = URL.createObjectURL(blob);
                            setImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
                            setPageInfo({ current: displayIdx + 1, total: pageCount });
                            setPageTopOffset(offsetMap.get(displayIdx) ?? 0);
                            setIsRendering(false);
                        } else if (mountedRef.current) {
                            setImageUrl(null);
                            setIsRendering(false);
                        }
                    }, 'image/webp', 0.92);
                }

                images.forEach(({ image }) => URL.revokeObjectURL(image.src));
            } catch (e) {
                console.error('[LightweightPdfPreview] Error:', getErrorDetails(e));
                setIsRendering(false);
            }
        };

        renderSnapshot();
        return () => { mountedRef.current = false; };
    }, [renderCapability, documentId, pageCount]);

    useEffect(() => {
        return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
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
                style={{ transform: `translateY(-${pageTopOffset / displayScale}px)` }}
            >
                <img
                    src={imageUrl}
                    alt="PDF Preview"
                    className="max-w-none"
                    style={{
                        width: 'auto',
                        height: 'auto',
                        transform: `scale(${1 / displayScale})`,
                        transformOrigin: 'top center',
                    }}
                    draggable={false}
                />
            </div>
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
