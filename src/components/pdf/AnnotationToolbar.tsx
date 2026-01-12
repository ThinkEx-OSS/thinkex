'use client';

import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import {
    Highlighter,
    Pen,
    Square,
    Circle,
    Type,
    Eraser,
    Trash2,
    MousePointer2
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface AnnotationToolbarProps {
    documentId: string;
}

export function AnnotationToolbar({ documentId }: AnnotationToolbarProps) {
    const { provides: annotationApi, state } = useAnnotation(documentId);

    if (!annotationApi) return null;

    const tools = [
        { id: 'highlight', icon: Highlighter, label: 'Highlight' },
        { id: 'ink', icon: Pen, label: 'Pen' },
        { id: 'square', icon: Square, label: 'Square' },
        { id: 'circle', icon: Circle, label: 'Circle' },
        { id: 'freeText', icon: Type, label: 'Text' },
    ];

    const handleDelete = () => {
        const selection = annotationApi.getSelectedAnnotation();
        if (selection) {
            annotationApi.deleteAnnotation(
                selection.object.pageIndex,
                selection.object.id
            );
        }
    };

    return (
        <div className="flex items-center gap-1 p-1 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg animate-in fade-in slide-in-from-top-2">
            {/* Selection/Default Tool */}
            <button
                onClick={() => annotationApi.setActiveTool(null)}
                className={`p-2 rounded-full transition-colors ${!state.activeToolId
                        ? 'bg-white text-black'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                title="Select"
            >
                <MousePointer2 size={16} />
            </button>

            <div className="w-px h-4 bg-white/20 mx-1" />

            {/* Drawing Tools */}
            {tools.map((tool) => {
                const Icon = tool.icon;
                const isActive = state.activeToolId === tool.id;

                return (
                    <button
                        key={tool.id}
                        onClick={() => annotationApi.setActiveTool(isActive ? null : tool.id)}
                        className={`p-2 rounded-full transition-colors ${isActive
                                ? 'bg-white text-black'
                                : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                        title={tool.label}
                    >
                        <Icon size={16} />
                    </button>
                );
            })}

            <div className="w-px h-4 bg-white/20 mx-1" />

            {/* Delete Action (only visible when something is selected) */}
            <button
                onClick={handleDelete}
                disabled={!state.selectedUid}
                className={`p-2 rounded-full transition-colors ${!state.selectedUid
                        ? 'text-white/30 cursor-not-allowed'
                        : 'text-red-400 hover:bg-red-500/20'
                    }`}
                title="Delete Selected"
            >
                <Trash2 size={16} />
            </button>
        </div>
    );
}
