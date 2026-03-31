---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: loads after hydration
tags: bundle, third-party, analytics, defer
---

## Defer Non-Critical Third-Party Libraries

Analytics, logging, and error tracking don't block user interaction. Load them after hydration.

**Incorrect (blocks initial bundle):**

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**Correct (loads after hydration):**

Extract the deferred import into a Client Component — `dynamic` with `{ ssr: false }` requires a client context and cannot be used directly in a Server Component like `RootLayout`.

```tsx
// AnalyticsClient.tsx
'use client'
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)

export function AnalyticsClient() {
  return <Analytics />
}
```

```tsx
// layout.tsx (Server Component)
import { AnalyticsClient } from './AnalyticsClient'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <AnalyticsClient />
      </body>
    </html>
  )
}
```
