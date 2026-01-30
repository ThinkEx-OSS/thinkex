"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type React from "react";

export function ItemHeader(props: {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  onNameChange: (value: string) => void;
  onSubtitleChange: (value: string) => void;
  onNameCommit?: (value: string) => void;
  onDescriptionCommit?: (value: string) => void;
  readOnly?: boolean;
  noMargin?: boolean;
  onTitleFocus?: () => void;
  onTitleBlur?: () => void;
  textSize?: "xs" | "lg" | "2xl";
  fontWeight?: "normal" | "medium" | "semibold" | "bold";
  fullWidth?: boolean;
  allowWrap?: boolean; // Allow text to wrap and fill height
  autoFocus?: boolean; // Auto-focus the title input when true
}) {
  const { name, onNameChange, onNameCommit, readOnly = false, noMargin = false, onTitleFocus, onTitleBlur, textSize = "lg", fontWeight = "medium", fullWidth = false, allowWrap = false, autoFocus = false } = props;

  // Use local state to prevent cursor jumping
  const [localName, setLocalName] = useState(name);
  const isUserTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  // Sync external changes to local state only when user is not actively typing
  useEffect(() => {
    if (!isUserTypingRef.current) {
      setLocalName(name);
    }
  }, [name]);

  // Function to calculate and set textarea width based on content
  const updateTextareaWidth = useCallback(() => {
    if (!textareaRef.current) return;

    // In constrained layouts (e.g., modal header), just fill the available space
    if (fullWidth) {
      textareaRef.current.style.width = '100%';
      textareaRef.current.style.maxWidth = '100%';
      textareaRef.current.style.overflowX = 'hidden';
      return;
    }

    // Use a hidden span to measure text width with same styling
    if (measureRef.current && textareaRef.current) {
      // Get computed styles from textarea to match font
      const textareaStyles = window.getComputedStyle(textareaRef.current);
      const textToMeasure = textareaRef.current.value || textareaRef.current.placeholder || 'Item title';

      // Apply same font styles to measurement span
      measureRef.current.textContent = textToMeasure;
      measureRef.current.style.fontSize = textareaStyles.fontSize;
      measureRef.current.style.fontFamily = textareaStyles.fontFamily;
      measureRef.current.style.fontWeight = textareaStyles.fontWeight;
      measureRef.current.style.letterSpacing = textareaStyles.letterSpacing;
      measureRef.current.style.fontStyle = textareaStyles.fontStyle;
      measureRef.current.style.whiteSpace = textareaStyles.whiteSpace;

      // Account for padding/border so the textarea never needs to scroll horizontally
      const paddingLeft = parseFloat(textareaStyles.paddingLeft || '0');
      const paddingRight = parseFloat(textareaStyles.paddingRight || '0');
      const borderLeft = parseFloat(textareaStyles.borderLeftWidth || '0');
      const borderRight = parseFloat(textareaStyles.borderRightWidth || '0');

      const textWidth = measureRef.current.getBoundingClientRect().width;
      const extraWidth = paddingLeft + paddingRight + borderLeft + borderRight;

      // Add a small buffer and enforce a sensible minimum
      const minWidth = 60;
      const newWidth = Math.max(textWidth + extraWidth + 6, minWidth);

      textareaRef.current.style.width = `${newWidth}px`;
      textareaRef.current.style.maxWidth = '100%';
      textareaRef.current.style.overflowX = 'hidden';
    } else if (textareaRef.current) {
      // Fallback: use scrollWidth (less accurate but works)
      const minWidth = 60;
      const scrollWidth = textareaRef.current.scrollWidth;
      textareaRef.current.style.width = `${Math.max(scrollWidth, minWidth)}px`;
      textareaRef.current.style.maxWidth = '100%';
      textareaRef.current.style.overflowX = 'hidden';
    }
  }, []);

  // Update width when localName changes
  useEffect(() => {
    if (!readOnly && textareaRef.current) {
      updateTextareaWidth();
    }
  }, [localName, readOnly, updateTextareaWidth]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalName(value);
    isUserTypingRef.current = true;
    // Update width as user types
    setTimeout(() => updateTextareaWidth(), 0);
    // Don't call onNameChange while typing - only update local state
  };

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    isUserTypingRef.current = false;
    const value = e.target.value.trim();
    setLocalName(value);
    // Save on blur if value changed (including trimming whitespace)
    // Use onNameCommit if provided (explicit save), otherwise fall back to onNameChange
    if (value !== name) {
      if (onNameCommit) {
        onNameCommit(value);
      } else {
        onNameChange(value);
      }
    }
    onTitleBlur?.();
  };

  const handleNameFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onTitleFocus?.();
  };

  // Auto-resize when localName changes from external source (only when not wrapping)
  useEffect(() => {
    if (!readOnly && !isUserTypingRef.current && textareaRef.current && !allowWrap) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localName, readOnly, allowWrap]);

  // Auto-focus when autoFocus prop is true
  useEffect(() => {
    if (autoFocus && textareaRef.current && !readOnly) {
      // Use setTimeout to ensure the element is fully rendered
      const timeoutId = setTimeout(() => {
        textareaRef.current?.focus();
        // Place cursor at the end and select all text
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(0, textareaRef.current.value.length);
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocus, readOnly]);

  const textSizeClass = textSize === "xs" ? "text-xs" : (textSize === "lg" ? "text-base" : "text-2xl");
  const fontWeightClass = `font-${fontWeight}`;

  if (readOnly) {
    return (
      <div className={`${noMargin ? "" : "mb-4"} select-none ${allowWrap ? "flex-1 flex flex-col" : ""}`}>
        <div
          style={{ color: '#ffffff' }}
          className={`w-full ${textSizeClass} ${fontWeightClass} ${allowWrap ? "flex-1" : ""}`}
        >
          {name || <span className="text-gray-400">Item title</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`${noMargin ? (allowWrap ? "flex-1 flex flex-col min-h-0" : "flex items-center") : "mb-4"} min-w-0 relative ${allowWrap ? "flex-1 flex flex-col" : ""} ${fullWidth ? "flex-1" : ""}`}>
      {/* Hidden span to measure text width - only when not wrapping */}
      {!allowWrap && (
        <span
          ref={measureRef}
          className={`absolute invisible whitespace-pre ${textSizeClass} ${fontWeightClass} pointer-events-none leading-tight`}
          style={{ color: '#ffffff', top: 0, left: 0 }}
          aria-hidden="true"
        />
      )}

      <textarea
        ref={textareaRef}
        value={localName}
        onChange={handleNameChange}
        onBlur={(e) => {
          e.stopPropagation();
          handleNameBlur(e);
          if (!allowWrap) {
            updateTextareaWidth(); // Update width on blur only when not wrapping
          }
        }}
        onFocus={(e) => {
          e.stopPropagation();
          handleNameFocus(e);
          if (!allowWrap) {
            updateTextareaWidth(); // Update width on focus only when not wrapping
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!allowWrap) {
            updateTextareaWidth(); // Update width on click only when not wrapping
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Blur on Enter instead of creating a new line
          if (e.key === 'Enter' && !allowWrap) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          if (allowWrap) {
            // When wrapping, don't auto-resize - let it fill container and scroll
            // The height is controlled by flex-1
          } else {
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
            updateTextareaWidth(); // Update width on input only when not wrapping
          }
        }}
        placeholder="Item title"
        style={{
          color: '#ffffff',
          width: (fullWidth || allowWrap) ? '100%' : undefined
        }}
        className={`appearance-none ${textSizeClass} ${fontWeightClass} outline-none placeholder:text-gray-400 transition-all focus:text-accent focus:placeholder:text-accent/65 bg-transparent resize-none ${allowWrap ? "flex-1 w-full overflow-auto whitespace-normal leading-normal" : "inline-block overflow-hidden leading-tight whitespace-nowrap"} ${fullWidth ? 'w-full' : ''}`}
        rows={allowWrap ? undefined : 1}
      />
    </div>
  );
}

export default ItemHeader;


