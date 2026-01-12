import { AgentState, CardType, ItemData, NoteData, PdfData } from "@/lib/workspace-state/types";



export const initialState: AgentState = {
  items: [],
  globalTitle: "",
  globalDescription: "",
  lastAction: "",
  itemsCreated: 0,

};

export function isNonEmptyAgentState(value: unknown): value is AgentState {
  if (value == null || typeof value !== "object") return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0;
}

export function defaultDataFor(type: CardType): ItemData {
  switch (type) {
    case "note":
      return { field1: "" } as NoteData;
    case "pdf":
      return { fileUrl: "", filename: "" } as PdfData;
    default:
      return { field1: "" } as NoteData;
  }
}




