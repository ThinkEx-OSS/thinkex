'use client';

import { type PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";

function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}

export default AppProviders;