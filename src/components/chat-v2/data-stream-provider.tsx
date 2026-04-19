"use client";

import type { DataUIPart } from "ai";
import type React from "react";
import { createContext, useContext, useMemo, useState } from "react";

type ChatV2DataTypes = Record<string, never>;

type DataStreamContextValue = {
  dataStream: DataUIPart<ChatV2DataTypes>[];
  setDataStream: React.Dispatch<React.SetStateAction<DataUIPart<ChatV2DataTypes>[]>>;
};

const DataStreamContext = createContext<DataStreamContextValue | null>(null);

export function DataStreamProvider({ children }: { children: React.ReactNode }) {
  const [dataStream, setDataStream] = useState<DataUIPart<ChatV2DataTypes>[]>([]);
  const value = useMemo(() => ({ dataStream, setDataStream }), [dataStream]);

  return <DataStreamContext.Provider value={value}>{children}</DataStreamContext.Provider>;
}

export function useDataStream() {
  const context = useContext(DataStreamContext);

  if (!context) {
    throw new Error("useDataStream must be used within a DataStreamProvider");
  }

  return context;
}
