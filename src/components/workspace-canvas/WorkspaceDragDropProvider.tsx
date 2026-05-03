"use client";

import type { ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";

interface WorkspaceDragDropProviderProps {
  children: ReactNode;
}
/**
 * Wraps workspace shell (header + sidebar + canvas) so grid sortables and future
 * header droppables share one dnd-kit context. Drag handlers live in WorkspaceGrid
 * via useDragDropMonitor.
 */
export function WorkspaceDragDropProvider({
  children,
}: WorkspaceDragDropProviderProps) {
  return (
    <DragDropProvider
      sensors={(defaults) =>
        defaults.map((sensor) =>
          sensor === PointerSensor
            ? PointerSensor.configure({
                activationConstraints(event) {
                  if (event.pointerType === "mouse") {
                    return [
                      new PointerActivationConstraints.Distance({ value: 5 }),
                    ];
                  }
                  return [
                    new PointerActivationConstraints.Delay({
                      value: 200,
                      tolerance: 5,
                    }),
                  ];
                },
              })
            : sensor,
        )
      }
    >
      {children}
    </DragDropProvider>
  );
}
