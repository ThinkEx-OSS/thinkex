"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { useIconPicker } from "@/hooks/use-icon-picker";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value?: string | null;
  onSelect: (icon: string | null) => void;
  children: React.ReactNode;
  className?: string;
}

export function IconPicker({
  value,
  onSelect,
  children,
  className,
}: IconPickerProps) {
  const [open, setOpen] = React.useState(false);
  const { search, setSearch, icons } = useIconPicker();

  const handleSelect = (iconName: string) => {
    // If clicking the same icon, clear it
    if (value === iconName) {
      onSelect(null);
    } else {
      onSelect(iconName);
    }
    setOpen(false);
  };

  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        onClick: (e: React.MouseEvent) => {
          const originalOnClick = (children as React.ReactElement<any>).props
            .onClick as ((e: React.MouseEvent) => void) | undefined;

          if (typeof originalOnClick === "function") {
            originalOnClick(e);
          }

          if (!e.defaultPrevented) {
            setOpen(true);
          }
        },
      })
    : children;

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "w-auto max-w-fit p-6 border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Choose an Icon</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput
              placeholder="Search icons..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No icons found.</CommandEmpty>
            </CommandList>
            <div className="mt-2 max-h-[360px] overflow-y-auto">
              <div className="grid grid-cols-8 gap-1">
                {icons.map((icon) => {
                  const IconComponent = icon.Component;
                  const isSelected = value === icon.name;
                  return (
                    <button
                      key={icon.name}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(icon.name);
                      }}
                      className={cn(
                        "flex items-center justify-center aspect-square p-2 cursor-pointer rounded-md transition-colors border",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-accent border-transparent"
                      )}
                      title={icon.friendly_name}
                    >
                      <IconComponent className="size-5" />
                    </button>
                  );
                })}
              </div>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
