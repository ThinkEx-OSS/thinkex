"use client";

import { Databuddy } from "@databuddy/sdk/react";

const clientId = process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID;

/** Databuddy web analytics — requires NEXT_PUBLIC_DATABUDDY_CLIENT_ID. */
export function DatabuddyAnalytics() {
  if (!clientId) return null;
  return (
    <Databuddy clientId={clientId} trackWebVitals trackErrors />
  );
}
