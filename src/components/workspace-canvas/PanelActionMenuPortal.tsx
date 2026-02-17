"use client";

import { useEffect, useRef } from "react";
import { PanelRight, SplitSquareHorizontal } from "lucide-react";

/** Portal-rendered menu at exact cursor position (avoids transform-containing-block offset) */
export function PanelActionMenuPortal({
  x,
  y,
  onReplace,
  onDoublePanel,
  onClose,
}: {
  x: number;
  y: number;
  onReplace: () => void;
  onDoublePanel: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    const id = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("scroll", handleScroll, { capture: true });
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      data-slot="popover-content"
      className="bg-popover text-popover-foreground z-50 w-40 rounded-md border p-1 shadow-md"
      style={{
        position: "fixed",
        left: x - 24,
        top: y - 24,
      }}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
        onClick={onReplace}
      >
        <PanelRight className="h-4 w-4" />
        <span>Replace</span>
      </button>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
        onClick={onDoublePanel}
      >
        <SplitSquareHorizontal className="h-4 w-4" />
        <span>Double Panel</span>
      </button>
    </div>
  );
}
