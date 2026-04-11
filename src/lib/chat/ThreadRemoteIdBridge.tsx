"use client";

import { useEffect, type MutableRefObject } from "react";
import { useAuiState } from "@assistant-ui/react";

export function ThreadRemoteIdSync({
  remoteIdRef,
}: {
  remoteIdRef: MutableRefObject<string | null>;
}) {
  const remoteId = useAuiState(
    (state) => state.threadListItem.remoteId ?? null,
  );

  useEffect(() => {
    remoteIdRef.current = remoteId;
  }, [remoteId, remoteIdRef]);

  return null;
}
