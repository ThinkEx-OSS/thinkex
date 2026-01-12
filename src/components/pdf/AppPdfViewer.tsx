'use client';

import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { useEngineContext } from '@embedpdf/engines/react';
import { ViewportPluginPackage, Viewport, useViewportCapability } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, Scroller, useScroll } from '@embedpdf/plugin-scroll/react';
import { DocumentContent, DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ZoomPluginPackage, ZoomMode, ZoomGestureWrapper, useZoom } from '@embedpdf/plugin-zoom/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { SearchPluginPackage, SearchLayer } from '@embedpdf/plugin-search/react';
import { SelectionPluginPackage, SelectionLayer, useSelectionCapability, SelectionSelectionMenuProps } from '@embedpdf/plugin-selection/react';
import { RotatePluginPackage, Rotate } from '@embedpdf/plugin-rotate/react';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/react';
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { TilingPluginPackage, TilingLayer } from '@embedpdf/plugin-tiling/react';
import { ThumbnailPluginPackage, ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/react';
import { AnnotationPluginPackage, AnnotationLayer, useAnnotationCapability, AnnotationSelectionMenuProps } from '@embedpdf/plugin-annotation/react';
import { CapturePluginPackage, MarqueeCapture, useCapture } from '@embedpdf/plugin-capture/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';

import { Loader2, ChevronLeft, ChevronRight, Copy, Sparkles, Check, Trash2 } from 'lucide-react';
import { useUIStore } from "@/lib/stores/ui-store";
import { toast } from "sonner";
import { useMemo, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { AnnotationToolbar } from './AnnotationToolbar';
import { PdfPasswordPrompt } from './PdfPasswordPrompt';

// ─────────────────────────────────────────────────────────
// PDF State Persistence
// ─────────────────────────────────────────────────────────

interface PdfSavedState {
  scrollTop: number;
  scrollLeft: number;
  zoom: number;
  timestamp: number;
}

const PDF_STATE_PREFIX = 'pdf-state-';

// Module-level tracking to survive StrictMode double-mounts
const restoredDocuments = new Set<string>();
// Track which documents have completed restoration (not just started)
const restoreCompleted = new Set<string>();

/**
 * Persists and restores PDF scroll position and zoom level to localStorage.
 */
const PdfStatePersister = ({ documentId, pdfSrc }: { documentId: string; pdfSrc: string }) => {
  const { provides: viewportCapability } = useViewportCapability();
  const { state: zoomState, provides: zoomScope } = useZoom(documentId);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSavedRef = useRef<string>('');

  const storageKey = `${PDF_STATE_PREFIX}${encodeURIComponent(pdfSrc)}`;
  const restoreKey = `${documentId}-${pdfSrc}`;

  // Check if restore is complete before allowing saves
  const canSave = useCallback(() => {
    return restoreCompleted.has(restoreKey);
  }, [restoreKey]);

  // Helper to save current state
  const saveCurrentState = useCallback(() => {
    if (!viewportCapability) return;
    if (!canSave()) {
      return;
    }

    try {
      const viewport = viewportCapability.forDocument(documentId);
      const metrics = viewport?.getMetrics();

      if (metrics && zoomState.currentZoomLevel > 0) {
        const state: PdfSavedState = {
          scrollTop: metrics.scrollTop,
          scrollLeft: metrics.scrollLeft,
          zoom: zoomState.currentZoomLevel,
          timestamp: Date.now(),
        };
        const stateStr = JSON.stringify(state);

        // Only save if state actually changed
        if (stateStr !== lastSavedRef.current) {
          localStorage.setItem(storageKey, stateStr);
          lastSavedRef.current = stateStr;
        }
      }
    } catch (e) {
      console.warn('[PdfStatePersister] Failed to save state:', e);
    }
  }, [viewportCapability, zoomState.currentZoomLevel, documentId, storageKey, canSave]);

  // Restore state on mount (only once per document)
  useEffect(() => {
    if (restoredDocuments.has(restoreKey)) {
      return;
    }

    if (!viewportCapability || !zoomScope) {
      return;
    }

    restoredDocuments.add(restoreKey);

    try {
      const saved = localStorage.getItem(storageKey);

      if (saved) {
        const state: PdfSavedState = JSON.parse(saved);

        // Delay restoration to ensure it runs AFTER the plugin's default zoom is applied
        // The plugin applies defaultZoomLevel: ZoomMode.FitWidth after document loads
        setTimeout(() => {
          // Restore zoom
          if (typeof state.zoom === 'number' && state.zoom > 0) {
            zoomScope.requestZoom(state.zoom);
          }

          // Restore scroll after zoom settles
          setTimeout(() => {
            const viewport = viewportCapability.forDocument(documentId);
            if (viewport) {
              viewport.scrollTo({ x: state.scrollLeft, y: state.scrollTop, behavior: 'instant' });
            }
            // Mark restore as complete AFTER scroll is applied
            setTimeout(() => {
              restoreCompleted.add(restoreKey);
            }, 100);
          }, 200);
        }, 300); // Wait for default zoom to be applied first
      } else {
        // No saved state, enable saving immediately
        restoreCompleted.add(restoreKey);
      }
    } catch (e) {
      console.warn('[PdfStatePersister] Restore failed:', e);
      restoreCompleted.add(restoreKey); // Enable saving even if restore fails
    }

    // Cleanup on unmount
    return () => {
      saveCurrentState();
    };
  }, [viewportCapability, zoomScope, documentId, pdfSrc, storageKey, restoreKey, saveCurrentState]);

  // Save on zoom changes (debounced)
  useEffect(() => {
    if (!viewportCapability || zoomState.currentZoomLevel === 0) return;
    if (!canSave()) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(saveCurrentState, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [zoomState.currentZoomLevel, saveCurrentState, viewportCapability, canSave]);

  // Save on scroll changes
  useEffect(() => {
    if (!viewportCapability) return;

    const unsub = viewportCapability.onScrollChange((event) => {
      if (event.documentId !== documentId) return;
      if (!canSave()) return;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(saveCurrentState, 300);
    });

    return unsub;
  }, [viewportCapability, documentId, saveCurrentState, canSave]);

  // Save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (canSave()) {
        saveCurrentState();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveCurrentState]);

  return null;
};

interface Props {
  pdfSrc: string;
  /** Whether to show the thumbnail sidebar */
  showThumbnails?: boolean;
  /** Render prop for custom header - receives documentId for PDF plugin hooks */
  renderHeader?: (documentId: string, annotationControls?: { showAnnotations: boolean, toggleAnnotations: () => void }) => ReactNode;
  itemName?: string;
  isMaximized?: boolean;
  /** Initial visibility of the annotation toolbar */
  initialShowAnnotations?: boolean;
}

// Thumbnail Sidebar component
interface ThumbnailSidebarProps {
  documentId: string;
}

// Custom Annotation Selection Menu
const CaptureOverlay = ({ documentId }: { documentId: string }) => {
  const { state: captureState } = useCapture(documentId);

  if (!captureState?.isMarqueeCaptureActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-50 ring-4 ring-inset ring-blue-500/50 animate-pulse transition-all duration-300" />
  );
};

const AnnotationSelectionMenu = ({
  selected,
  context,
  // documentId, // Note: documentId comes from props spread in render, but explicit prop also works
  menuWrapperProps,
  rect,
}: AnnotationSelectionMenuProps & { documentId: string }) => {
  const { provides: annotationCapability } = useAnnotationCapability();
  const documentId = (context.annotation.object as any).documentId || (menuWrapperProps as any).documentId;

  const handleDelete = () => {
    // If we have access to documentId via closure or prop, use it
    const { pageIndex, id } = context.annotation.object;
    // We need the documentId to get the scope. 
    // In this specific integration, we pass documentId explicitly.
  };

  // Since we need documentId to delete, we'll implement a simpler inline delete in the toolbar for now,
  // OR we can rely on the passed-in "documentId" prop if we wrap it correctly.

  // Let's rely on the toolbar for deletion to keep this clean, or render a simple visual indicator.
  // Actually, standard practice is to pass documentId.
  return null;
};

// ... (TextSelectionMenu and PageControls remain unchanged)
const TextSelectionMenu = ({
  rect,
  menuWrapperProps,
  placement,
  documentId
}: SelectionSelectionMenuProps & { documentId: string }) => {
  const { provides: selectionCapability } = useSelectionCapability();
  const addReplySelection = useUIStore((state) => state.addReplySelection);
  const [copied, setCopied] = useState(false);

  // Copy handler
  const handleCopy = useCallback(async () => {
    const scope = selectionCapability?.forDocument(documentId);
    if (!scope) return;

    await scope.copyToClipboard();
    scope.clear();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectionCapability, documentId]);

  // Ask AI handler
  const handleAskAI = useCallback(() => {
    const scope = selectionCapability?.forDocument(documentId);
    if (!scope) return;

    try {
      // scope.getSelectedText() returns a proprietary Task object that works best with .wait()
      const textTask = scope.getSelectedText();

      // Use the .wait(successCb, errorCb) pattern
      // Casting to any to avoid strict TS issues if the type definition is slightly off for 'wait'
      (textTask as any).wait((lines: string[]) => {
        const text = lines.join('\n');

        if (text && text.trim().length > 0) {
          addReplySelection({
            text: text.trim(),
          });
          scope.clear();
          toast.success("Added to context");
        } else {
          console.warn("Ask AI: No text extracted");
        }
      }, (err: any) => {
        console.error("Ask AI extraction failed:", err);
        toast.error("Failed to extract text");
      });

    } catch (err) {
      console.error("Ask AI Error:", err);
      toast.error("Failed to add context");
    }
  }, [selectionCapability, documentId, addReplySelection]);

  // Position logic (fallback if placement util is quirky, but using standard pattern)
  const top = placement.suggestTop ? -36 : rect.size.height + 6;

  return (
    <div {...menuWrapperProps}>
      <div
        style={{ position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', cursor: 'default' }}
        className="flex items-center gap-0.5 bg-black/80 backdrop-blur-md rounded-full p-0.5 shadow-lg border border-white/10 text-white z-50 scale-90 origin-bottom"
      >
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-white/10 transition-colors text-[10px] font-medium"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <div className="w-px h-2.5 bg-white/20" />
        <button
          onClick={handleAskAI}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-white/10 transition-colors text-[10px] font-medium text-blue-400 hover:text-blue-300"
        >
          <Sparkles size={12} />
          Ask AI
        </button>
      </div>
    </div>
  );
};

const PageControls = ({ documentId, itemName, isMaximized, isVisible }: { documentId: string; itemName?: string; isMaximized?: boolean; isVisible: boolean }) => {
  const { provides: scroll, state } = useScroll(documentId);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handlePageSubmit = () => {
    const page = parseInt(editValue, 10);
    if (!isNaN(page) && page >= 1 && state && page <= state.totalPages) {
      scroll?.scrollToPage({ pageNumber: page });
    }
    setIsEditing(false);
  };

  if (!state || !scroll) return null;

  return (
    <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center bg-black/75 backdrop-blur-md rounded-2xl p-1 shadow-lg border border-white/10 transition-all duration-300 pointer-events-auto scale-90 origin-bottom ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>

      {/* Controls Row */}
      <div className="flex items-center gap-1 px-1 py-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); scroll?.scrollToPreviousPage(); }}
          className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
          disabled={state.currentPage <= 1}
        >
          <ChevronLeft size={14} />
        </button>

        {/* Interactive Page Number */}
        <div
          className="min-w-[50px] text-center font-mono text-[10px] select-none text-white/90 flex items-center justify-center cursor-pointer hover:bg-white/10 rounded px-1 transition-colors h-5"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
            setEditValue(state.currentPage.toString());
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation(); // Prevent viewer keyboard shortcuts
                if (e.key === 'Enter') handlePageSubmit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              onBlur={handlePageSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-6 bg-transparent text-center outline-none border-b border-white/50 focus:border-white p-0 m-0 text-[10px]"
            />
          ) : (
            <span>{state.currentPage}</span>
          )}
          <span className="mx-0.5 opacity-50">/</span>
          <span>{state.totalPages}</span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); scroll?.scrollToNextPage(); }}
          className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-30 transition-colors"
          disabled={state.currentPage >= state.totalPages}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Document Name - Stacked below controls within the same pill */}
      {!isMaximized && itemName && (
        <div className="max-w-[160px] px-1.5 pb-0.5 text-white/50 text-[9px] font-medium truncate select-none text-center">
          {itemName}
        </div>
      )}
    </div>
  );
};

const ThumbnailSidebar = ({ documentId }: ThumbnailSidebarProps) => {
  const { provides: scroll, state } = useScroll(documentId);

  return (
    <div className="w-[130px] flex-shrink-0 bg-black/30 border-r border-white/10 flex flex-col overflow-hidden">
      {/* Thumbnails */}
      <div className="flex-1 relative overflow-hidden">
        <ThumbnailsPane documentId={documentId}>
          {(m) => (
            <div
              key={m.pageIndex}
              style={{
                position: 'absolute',
                top: m.top,
                height: m.wrapperHeight,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '4px 8px',
              }}
            >
              <button
                onClick={() => scroll?.scrollToPage({ pageNumber: m.pageIndex + 1 })}
                className={`rounded-sm overflow-hidden transition-all ${state?.currentPage === m.pageIndex + 1
                  ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-transparent'
                  : 'hover:ring-1 hover:ring-white/30'
                  }`}
                style={{ width: m.width, height: m.height }}
              >
                <ThumbImg documentId={documentId} meta={m} />
              </button>
              <span className={`text-xs mt-1 ${state?.currentPage === m.pageIndex + 1 ? 'text-blue-400' : 'text-white/50'
                }`}>
                {m.pageIndex + 1}
              </span>
            </div>
          )}
        </ThumbnailsPane>
      </div>
    </div>
  );
};

const AppPdfViewer = ({ pdfSrc, showThumbnails = false, renderHeader, itemName, isMaximized, initialShowAnnotations = false }: Props) => {
  // Use the shared Pdfium engine from context
  const { engine, isLoading } = useEngineContext();

  // Visibility state managed at parent level to catch all container events
  const [controlsVisible, setControlsVisible] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Annotation state
  const [showAnnotations, setShowAnnotations] = useState(initialShowAnnotations);

  // Update state if prop changes (for external control if needed)
  useEffect(() => {
    if (initialShowAnnotations !== undefined) {
      setShowAnnotations(initialShowAnnotations);
    }
  }, [initialShowAnnotations]);


  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 2000);
  }, []);

  // Initial show
  useEffect(() => {
    showControls();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [showControls]);

  // Create plugins with the dynamic PDF URL - memoized to prevent re-creation
  const plugins = useMemo(() => [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: pdfSrc }],
    }),
    createPluginRegistration(ViewportPluginPackage, {
      viewportGap: 10,
    }),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage, {
      tileSize: 768,
      overlapPx: 2.5,
      extraRings: 0,
    }),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitWidth,
    }),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(PanPluginPackage),
    createPluginRegistration(RotatePluginPackage),
    createPluginRegistration(FullscreenPluginPackage),
    createPluginRegistration(SearchPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    // Dependencies first for Annotations
    createPluginRegistration(HistoryPluginPackage),
    createPluginRegistration(AnnotationPluginPackage, {
      // You can add configuration here like author name if we had user profiles
      annotationAuthor: "User",
    }),
    createPluginRegistration(ThumbnailPluginPackage, {
      width: 90,
      gap: 8,
      autoScroll: true,
    }),
    createPluginRegistration(CapturePluginPackage, {
      scale: 2.0,
      imageType: 'image/png',
      withAnnotations: true,
    }),
  ], [pdfSrc]);

  if (isLoading || !engine) {
    return (
      <div
        className="flex items-center justify-center w-full h-full bg-black/20"
        style={{ minHeight: '300px' }}
      >
        <div className="flex items-center gap-2 text-white/60">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading PDF Engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col relative"
      style={{ minHeight: '400px' }}
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onClick={showControls}
      onWheel={showControls} // Capture scroll wheel events too
    >
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId && (
            <DocumentContent documentId={activeDocumentId}>
              {({ documentState, isLoading: docLoading, isError, isLoaded }) => (
                <>
                  {/* Loading state */}
                  {docLoading && (
                    <div className="flex items-center justify-center w-full h-full" style={{ minHeight: '300px' }}>
                      <div className="flex items-center gap-2 text-white/60">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="text-sm">Loading document...</span>
                      </div>
                    </div>
                  )}

                  {/* Error state (including password required) */}
                  {isError && (
                    <div className="w-full h-full" style={{ minHeight: '300px', backgroundColor: '#1a1a1a' }}>
                      <PdfPasswordPrompt documentState={documentState} pdfSrc={pdfSrc} />
                    </div>
                  )}

                  {/* Loaded state */}
                  {isLoaded && (
                    <div className="flex flex-col h-full relative">
                      {/* PDF State Persistence */}
                      <PdfStatePersister documentId={activeDocumentId} pdfSrc={pdfSrc} />

                      {/* Custom Header (if provided), passing the annotation toggles */}
                      {renderHeader && renderHeader(
                        activeDocumentId,
                        { showAnnotations, toggleAnnotations: () => setShowAnnotations(!showAnnotations) }
                      )}

                      {/* Main content with optional sidebar */}
                      <div className="flex-1 flex overflow-hidden relative">
                        {/* Thumbnail Sidebar */}
                        {showThumbnails && (
                          <ThumbnailSidebar documentId={activeDocumentId} />
                        )}

                        {/* Annotation Toolbar (Floating) - Only show if enabled and document loaded */}
                        {showAnnotations && (
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                            <AnnotationToolbar documentId={activeDocumentId} />
                          </div>
                        )}


                        {/* Viewport */}
                        <div className="flex-1 overflow-hidden relative">
                          <CaptureOverlay documentId={activeDocumentId} />
                          <Viewport
                            documentId={activeDocumentId}
                            className="w-full h-full"
                            style={{ backgroundColor: '#1a1a1a' }}
                          >
                            <ZoomGestureWrapper documentId={activeDocumentId}>
                              <Scroller
                                documentId={activeDocumentId}
                                renderPage={({ pageIndex }) => (
                                  <Rotate
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                    style={{ backgroundColor: '#fff' }}
                                  >
                                    <PagePointerProvider documentId={activeDocumentId} pageIndex={pageIndex}>
                                      {/* Render layer for page content */}
                                      <RenderLayer
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                        scale={1}
                                        style={{ pointerEvents: 'none' }}
                                      />
                                      {/* Tiling layer for large documents */}
                                      <TilingLayer
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                        style={{ pointerEvents: 'none' }}
                                      />
                                      {/* Search highlight layer */}
                                      <SearchLayer
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                      />
                                      {/* Selection layer for text selection - Rendered below annotation layer but allows text selection */}
                                      <SelectionLayer
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                        selectionMenu={(props) => (
                                          <TextSelectionMenu {...props} documentId={activeDocumentId} />
                                        )}
                                      />
                                      {/* Annotation Layer - Renders annotations and handles annotation interactions */}
                                      {/* Even if the toolbar is hidden, we might want to render annotations, just not edit them. 
                                          But typically AnnotationLayer is needed to SEE them too. */}
                                      <AnnotationLayer
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                      />
                                      <MarqueeCapture
                                        documentId={activeDocumentId}
                                        pageIndex={pageIndex}
                                      />
                                    </PagePointerProvider>
                                  </Rotate>
                                )}
                              />
                            </ZoomGestureWrapper>
                          </Viewport>

                          {/* Page Controls overlay */}
                          <PageControls
                            documentId={activeDocumentId}
                            itemName={itemName}
                            isMaximized={isMaximized}
                            isVisible={controlsVisible}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </DocumentContent>
          )
        }
      </EmbedPDF>
    </div>
  );
};

export default AppPdfViewer;