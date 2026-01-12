/**
 * Highlight color definitions for text selection highlighting
 * Each color includes light/dark mode variants with semi-transparent backgrounds and solid underlines
 */

export interface HighlightColor {
    id: string;
    name: string;
    className: string; // Full Tailwind classes for the highlight
    previewColor: string; // Hex color for UI preview
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
    {
        id: 'blue',
        name: 'Blue',
        className: '!bg-blue-300/40 dark:!bg-blue-700/40 border-b-2 border-blue-500 dark:border-blue-400',
        previewColor: '#3b82f6',
    },
    {
        id: 'yellow',
        name: 'Yellow',
        className: '!bg-yellow-300/40 dark:!bg-yellow-700/40 border-b-2 border-yellow-500 dark:border-yellow-400',
        previewColor: '#eab308',
    },
    {
        id: 'green',
        name: 'Green',
        className: '!bg-green-300/40 dark:!bg-green-700/40 border-b-2 border-green-500 dark:border-green-400',
        previewColor: '#22c55e',
    },
    {
        id: 'purple',
        name: 'Purple',
        className: '!bg-purple-300/40 dark:!bg-purple-700/40 border-b-2 border-purple-500 dark:border-purple-400',
        previewColor: '#a855f7',
    },
    {
        id: 'pink',
        name: 'Pink',
        className: '!bg-pink-300/40 dark:!bg-pink-700/40 border-b-2 border-pink-500 dark:border-pink-400',
        previewColor: '#ec4899',
    },
    {
        id: 'orange',
        name: 'Orange',
        className: '!bg-orange-300/40 dark:!bg-orange-700/40 border-b-2 border-orange-500 dark:border-orange-400',
        previewColor: '#f97316',
    },
    {
        id: 'red',
        name: 'Red',
        className: '!bg-red-300/40 dark:!bg-red-700/40 border-b-2 border-red-500 dark:border-red-400',
        previewColor: '#ef4444',
    },
    {
        id: 'cyan',
        name: 'Cyan',
        className: '!bg-cyan-300/40 dark:!bg-cyan-700/40 border-b-2 border-cyan-500 dark:border-cyan-400',
        previewColor: '#06b6d4',
    },
    {
        id: 'indigo',
        name: 'Indigo',
        className: '!bg-indigo-300/40 dark:!bg-indigo-700/40 border-b-2 border-indigo-500 dark:border-indigo-400',
        previewColor: '#6366f1',
    },
    {
        id: 'lime',
        name: 'Lime',
        className: '!bg-lime-300/40 dark:!bg-lime-700/40 border-b-2 border-lime-500 dark:border-lime-400',
        previewColor: '#84cc16',
    },
    {
        id: 'teal',
        name: 'Teal',
        className: '!bg-teal-300/40 dark:!bg-teal-700/40 border-b-2 border-teal-500 dark:border-teal-400',
        previewColor: '#14b8a6',
    },
    {
        id: 'rose',
        name: 'Rose',
        className: '!bg-rose-300/40 dark:!bg-rose-700/40 border-b-2 border-rose-500 dark:border-rose-400',
        previewColor: '#f43f5e',
    },
];

/**
 * Get a highlight color by its ID
 * @param id - The color ID
 * @returns The highlight color object, defaults to blue if not found
 */
export const getHighlightColorById = (id: string): HighlightColor => {
    return HIGHLIGHT_COLORS.find(c => c.id === id) || HIGHLIGHT_COLORS[0];
};
