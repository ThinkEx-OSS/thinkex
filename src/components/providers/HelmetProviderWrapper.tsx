"use client";

import { HelmetProvider } from "react-helmet-async";

export function HelmetProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HelmetProvider>{children}</HelmetProvider>;
}

