---
title: Prevent Hydration Mismatch Without Flickering
impact: MEDIUM
impactDescription: avoids visual flicker and hydration errors
tags: rendering, ssr, hydration, localStorage, flicker
---

## Prevent Hydration Mismatch Without Flickering

When rendering content that depends on client-side storage (localStorage, cookies), avoid both SSR breakage and post-hydration flickering by injecting a synchronous script that updates the DOM before React hydrates.

**Incorrect (breaks SSR):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage is not available on server - throws error
  const theme = localStorage.getItem('theme') || 'light'
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

Server-side rendering will fail because `localStorage` is undefined.

**Incorrect (visual flickering):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')
  
  useEffect(() => {
    // Runs after hydration - causes visible flash
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored)
    }
  }, [])
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

Component first renders with default value (`light`), then updates after hydration, causing a visible flash of incorrect content.

**Incorrect (hydration mismatch):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="theme-wrapper">
        {children}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                var el = document.getElementById('theme-wrapper');
                if (el) el.className = theme;
              } catch (e) {}
            })();
          `,
        }}
      />
    </>
  )
}
```

The script mutates `#theme-wrapper`'s `className` before React hydrates, so the live DOM no longer matches the server-rendered HTML. React logs a hydration mismatch warning and may overwrite the class.

**Correct (no flicker, no hydration mismatch):**

Place a blocking script in the `<head>` of the root layout so it runs on `document.documentElement` before React mounts. Apply the theme class via CSS that targets the `<html>` element. Add `suppressHydrationWarning` on `<html>` so React ignores the class difference between server and client.

```tsx
// app/layout.tsx (Server Component)
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'light';
                  document.documentElement.classList.add(theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

```tsx
// ThemeWrapper — no script needed; reads theme from <html> via CSS
function ThemeWrapper({ children }: { children: ReactNode }) {
  return <div className="theme-wrapper">{children}</div>
}
```

The script executes synchronously before the browser paints and before React hydrates. `suppressHydrationWarning` on `<html>` tells React to accept the class added by the script without logging a mismatch. `ThemeWrapper` remains a pure Server Component with no client-side mutations.

This pattern is especially useful for theme toggles, user preferences, and any client-only data that should render immediately without flashing default values.
