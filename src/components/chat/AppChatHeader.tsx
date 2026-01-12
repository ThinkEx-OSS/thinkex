"use client";

import { X, ChevronDown, Trash2, Edit2, Check, MessageSquarePlus } from "lucide-react";
import { RiChatHistoryLine } from "react-icons/ri";
import { LuMaximize, LuMinimize, LuPanelRightClose } from "react-icons/lu";
import { useAssistantApi, useThreadListItem } from "@assistant-ui/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { toast } from "sonner";
import { ThreadListDropdown } from "@/components/assistant-ui/thread-list-dropdown";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useUIStore } from "@/lib/stores/ui-store";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export function AppChatHeader({
  onClose,
  onCollapse,
  isMaximized,
  onToggleMaximize,
  activeConversationId,
  activeConversationTitle: _activeConversationTitle,
  conversations,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onNewConversation,
}: {
  onClose?: () => void;
  onCollapse?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  activeConversationId?: string | null;
  activeConversationTitle?: string;
  conversations?: Conversation[];
  onSelectConversation?: (conversationId: string) => void;
  onRenameConversation?: (conversationId: string, newTitle: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isEditingCurrentTitle, setIsEditingCurrentTitle] = useState(false);
  const [currentTitleEditValue, setCurrentTitleEditValue] = useState("");
  const currentTitleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const api = useAssistantApi();

  // Get UI store state for sidebar behavior
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const maximizedItemId = useUIStore((state) => state.maximizedItemId);
  const closeAllPanels = useUIStore((state) => state.closeAllPanels);
  const isItemPanelOpen = openPanelIds.length > 0 && !maximizedItemId;

  // Get current thread title and state from assistant-ui
  // Using safe hook to handle race condition during thread switching (GitHub issue #2722)
  const threadListItem = useThreadListItem();
  const currentThreadTitle = threadListItem?.title || "New Chat";
  const isThreadInitialized = !!threadListItem?.remoteId;

  // Update edit value when title changes (but not while editing)
  useEffect(() => {
    if (!isEditingCurrentTitle) {
      setCurrentTitleEditValue(currentThreadTitle);
    }
  }, [currentThreadTitle, isEditingCurrentTitle]);

  // Focus textarea when entering edit mode and auto-resize
  useEffect(() => {
    if (isEditingCurrentTitle && currentTitleTextareaRef.current) {
      currentTitleTextareaRef.current.focus();
      // Place cursor at the end instead of selecting all
      const length = currentTitleTextareaRef.current.value.length;
      currentTitleTextareaRef.current.setSelectionRange(length, length);
      // Auto-resize
      currentTitleTextareaRef.current.style.height = 'auto';
      currentTitleTextareaRef.current.style.height = currentTitleTextareaRef.current.scrollHeight + 'px';
    }
  }, [isEditingCurrentTitle]);

  // Auto-resize textarea on input
  const handleTitleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = target.scrollHeight + 'px';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return "Today";
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else if (diffInHours < 168) {
      return `${Math.floor(diffInHours / 24)} days ago`;
    } else {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  };

  const handleStartEdit = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveEdit = async (conversationId: string) => {
    if (editTitle.trim()) {
      onRenameConversation?.(conversationId, editTitle.trim());
      setEditingId(null);
      setEditTitle("");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleStartEditCurrentTitle = () => {
    // Only allow editing if thread is initialized
    if (!isThreadInitialized) {
      toast.error("Please start a conversation before renaming");
      return;
    }
    setIsEditingCurrentTitle(true);
    setCurrentTitleEditValue(currentThreadTitle);
  };

  const handleSaveCurrentTitle = async () => {
    const trimmedValue = currentTitleEditValue.trim();

    // Check if thread is initialized before trying to rename
    if (!isThreadInitialized) {
      toast.error("Please start a conversation before renaming");
      setCurrentTitleEditValue(currentThreadTitle);
      setIsEditingCurrentTitle(false);
      return;
    }

    if (trimmedValue && trimmedValue !== currentThreadTitle) {
      try {
        await api?.threadListItem().rename(trimmedValue);
        toast.success("Title updated");
      } catch (error) {
        console.error("Failed to rename thread:", error);
        toast.error("Failed to update title");
        // Revert to original title on error
        setCurrentTitleEditValue(currentThreadTitle);
      }
    } else if (!trimmedValue) {
      // If empty, revert to original title
      setCurrentTitleEditValue(currentThreadTitle);
    }
    setIsEditingCurrentTitle(false);
  };

  const handleCancelCurrentTitleEdit = () => {
    setCurrentTitleEditValue(currentThreadTitle);
    setIsEditingCurrentTitle(false);
  };

  const handleCurrentTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur(); // Blur will trigger save
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelCurrentTitleEdit();
    }
  };

  const handleDelete = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this conversation? This action cannot be undone.")) {
      onDeleteConversation?.(conversationId);
    }
  };


  return (
    <div className="bg-sidebar">
      {/* Conversation Switcher and Controls */}
      <div className="flex items-center justify-between py-2 px-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Sidebar Trigger (only when maximized) */}
          {isMaximized && (
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger
                  onClick={() => {
                    // When item panel is open (minimized mode), close it before opening sidebar
                    if (isItemPanelOpen) {
                      closeAllPanels();
                    }
                  }}
                  className="shrink-0"
                />
              </TooltipTrigger>
              <TooltipContent side="right">
                Toggle Sidebar <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('S', true)}</kbd>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Current Thread Title */}
          {conversations && conversations.length > 0 ? (
            <>
              <div className="flex items-center min-w-0">
                {isEditingCurrentTitle ? (
                  <textarea
                    ref={currentTitleTextareaRef}
                    value={currentTitleEditValue}
                    onChange={(e) => setCurrentTitleEditValue(e.target.value)}
                    onBlur={handleSaveCurrentTitle}
                    onKeyDown={handleCurrentTitleKeyDown}
                    onInput={handleTitleInput}
                    className="text-sm font-medium bg-transparent border-none outline-none resize-none overflow-hidden min-w-0 text-sidebar-foreground placeholder:text-sidebar-foreground/60 focus:text-sidebar-foreground cursor-text"
                    style={{ height: 'auto' }}
                    rows={1}
                  />
                ) : (
                  <span
                    className="text-sm font-medium text-sidebar-foreground whitespace-nowrap truncate cursor-text hover:text-sidebar-foreground/80 transition-colors"
                    onClick={handleStartEditCurrentTitle}
                  >
                    {currentThreadTitle}
                  </span>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground/80 transition-colors flex-shrink-0 p-1 rounded hover:bg-sidebar-accent"
                    aria-label="Show conversation history"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80 bg-sidebar border-sidebar-border">
                  <DropdownMenuLabel className="text-sidebar-foreground/60">Recent Conversations</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-sidebar-border" />
                  <div className="max-h-[400px] overflow-y-auto">
                    {conversations.map((conversation) => (
                      <DropdownMenuItem
                        key={conversation.id}
                        onSelect={() => {
                          if (editingId !== conversation.id) {
                            onSelectConversation?.(conversation.id);
                          }
                        }}
                        className={`group flex items-center justify-between gap-2 cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent focus:bg-sidebar-accent ${activeConversationId === conversation.id ? 'bg-sidebar-accent' : ''
                          }`}
                      >
                        {editingId === conversation.id ? (
                          <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveEdit(conversation.id);
                                } else if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                              className="h-7 text-xs flex-1"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEdit(conversation.id)}
                              className="p-1 hover:bg-sidebar-accent rounded cursor-pointer"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 hover:bg-sidebar-accent rounded cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                              <span className="font-medium truncate max-w-full">{conversation.title}</span>
                              <span className="text-xs text-sidebar-foreground/60">{formatDate(conversation.updated_at)}</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => handleStartEdit(conversation, e)}
                                className="p-1 hover:bg-sidebar-accent rounded cursor-pointer"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(conversation.id, e)}
                                className="p-1 hover:bg-destructive/20 hover:text-destructive rounded cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center min-w-0">
              {isEditingCurrentTitle ? (
                <textarea
                  ref={currentTitleTextareaRef}
                  value={currentTitleEditValue}
                  onChange={(e) => setCurrentTitleEditValue(e.target.value)}
                  onBlur={handleSaveCurrentTitle}
                  onKeyDown={handleCurrentTitleKeyDown}
                  onInput={handleTitleInput}
                  className="text-sm font-medium bg-transparent border-none outline-none resize-none overflow-hidden min-w-0 text-sidebar-foreground placeholder:text-sidebar-foreground/60 focus:text-sidebar-foreground cursor-text"
                  style={{ height: 'auto' }}
                  rows={1}
                />
              ) : (
                <h2
                  className="text-sm font-medium text-sidebar-foreground whitespace-nowrap truncate cursor-text hover:text-sidebar-foreground/80 transition-colors"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleStartEditCurrentTitle();
                  }}
                >
                  {currentThreadTitle}
                </h2>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* New Conversation Button */}
          {typeof onNewConversation === "function" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="New conversation"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  onClick={onNewConversation}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                New conversation
              </TooltipContent>
            </Tooltip>
          )}

          {/* Thread List Dropdown */}
          <ThreadListDropdown
            trigger={
              <button
                type="button"
                aria-label="Past chats"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              >
                <RiChatHistoryLine className="h-4 w-4" />
              </button>
            }
          />

          {/* Maximize/Minimize button */}
          {typeof onToggleMaximize === "function" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isMaximized ? "Minimize chat" : "Maximize chat"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  onClick={() => onToggleMaximize?.()}
                >
                  {isMaximized ? (
                    <LuMinimize className="h-4 w-4" />
                  ) : (
                    <LuMaximize className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isMaximized ? "Minimize chat" : "Maximize chat"} <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('M')}</kbd>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Collapse/Close buttons - Hide collapse when maximized */}
          {typeof onCollapse === "function" && !isMaximized && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Toggle chat (${formatKeyboardShortcut('J')})`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  onClick={() => onCollapse?.()}
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Toggle chat <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('J')}</kbd>
              </TooltipContent>
            </Tooltip>
          )}
          {typeof onClose === "function" && (
            <button
              type="button"
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              onClick={() => onClose?.()}
            >
              <LuPanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PopupHeaderProps {
  onClose?: () => void;
}

export function PopupHeader({ onClose }: PopupHeaderProps) {
  return <AppChatHeader onClose={onClose} />;
}

export default AppChatHeader;




