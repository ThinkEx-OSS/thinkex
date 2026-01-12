import { useEffect } from "react";

export interface KeyboardShortcutHandlers {
  onToggleChat?: () => void;
  onToggleSidebar?: () => void;
  onToggleChatMaximize?: () => void;
  onFocusSearch?: () => void;
}

export function useKeyboardShortcuts(
  onToggleChat: () => void,
  handlers?: KeyboardShortcutHandlers
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+J / Ctrl+J - Toggle chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        onToggleChat();
        return;
      }

      // Cmd+K / Ctrl+K - Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handlers?.onFocusSearch?.();
        return;
      }

      // Cmd+Shift+S / Ctrl+Shift+S - Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        handlers?.onToggleSidebar?.();
        return;
      }

      // Cmd+M / Ctrl+M - Maximize/minimize chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        handlers?.onToggleChatMaximize?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleChat, handlers]);
}

