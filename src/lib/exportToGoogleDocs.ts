import { replace as replaceLatexWithUnicode } from "unicodeit";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const MATH_EXPORT_REGEX = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
const BARE_CURRENCY_REGEX =
  /(?<!\$)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:[kKmMbB])?)(?!\$)\b/g;

function preprocessMarkdownForGoogleDocsExport(markdown: string): string {
  if (!markdown) return markdown;

  const codeSpans: string[] = [];
  const protectedMarkdown = markdown.replace(
    /```[\s\S]*?```|`[^`\n]+`/g,
    (match) => {
      codeSpans.push(match);
      return `\u0000CODE_SPAN_${codeSpans.length - 1}\u0000`;
    }
  );
  const currencyStash: string[] = [];
  const protectedContent = protectedMarkdown.replace(
    BARE_CURRENCY_REGEX,
    (match) => {
      currencyStash.push(match);
      return `\u0000CURRENCY_${currencyStash.length - 1}\u0000`;
    }
  );

  const converted = protectedContent.replace(
    MATH_EXPORT_REGEX,
    (_match, blockLatex?: string, inlineLatex?: string) => {
      const latex = (blockLatex ?? inlineLatex ?? "").trim();
      if (!latex) return "";
      return replaceLatexWithUnicode(latex);
    }
  );

  return converted
    .replace(/\u0000CURRENCY_(\d+)\u0000/g, (_match, index) => {
      return currencyStash[Number(index)] ?? "";
    })
    .replace(/\u0000CODE_SPAN_(\d+)\u0000/g, (_match, index) => {
      return codeSpans[Number(index)] ?? "";
    });
}

type GoogleAccessTokenOptions = {
  loginHint?: string | null;
};

type CachedAccessToken = {
  accessToken: string;
  expiresAt: number;
  loginHint?: string;
};

let cachedAccessToken: CachedAccessToken | null = null;

function sanitizeDocTitle(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, " ").trim() || "Untitled";
}

function normalizeLoginHint(loginHint?: string | null): string | undefined {
  const normalized = loginHint?.trim().toLowerCase();
  return normalized || undefined;
}

export function getGoogleOAuthClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || undefined;
}

export function isGoogleIdentityLoaded(): boolean {
  return Boolean(
    typeof window !== "undefined" && window.google?.accounts?.oauth2?.initTokenClient
  );
}

function getCachedAccessToken(loginHint?: string): string | undefined {
  if (!cachedAccessToken) return undefined;
  if (cachedAccessToken.expiresAt <= Date.now() + TOKEN_EXPIRY_SKEW_MS) {
    cachedAccessToken = null;
    return undefined;
  }

  if (
    loginHint &&
    cachedAccessToken.loginHint &&
    cachedAccessToken.loginHint !== loginHint
  ) {
    return undefined;
  }

  return cachedAccessToken.accessToken;
}

function cacheAccessToken(
  accessToken: string,
  expiresInSeconds?: number,
  loginHint?: string
): void {
  if (!expiresInSeconds || expiresInSeconds <= 0) return;
  cachedAccessToken = {
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    loginHint,
  };
}

export function getGoogleAccessToken(
  options: GoogleAccessTokenOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = getGoogleOAuthClientId();
    const loginHint = normalizeLoginHint(options.loginHint);
    if (!clientId) {
      reject(new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID"));
      return;
    }
    if (!isGoogleIdentityLoaded()) {
      reject(new Error("Google Sign-In is still loading. Try again in a moment."));
      return;
    }

    const cachedToken = getCachedAccessToken(loginHint);
    if (cachedToken) {
      resolve(cachedToken);
      return;
    }

    // GIS defaults `prompt` to `select_account`, which forces the account picker on every
    // request. Empty string = prompt only when needed (first consent / re-auth).
    // See: https://developers.google.com/identity/oauth2/web/reference/js-reference#TokenClientConfig
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      prompt: "",
      include_granted_scopes: true,
      login_hint: loginHint,
      error_callback: (error) => {
        reject(
          new Error(
            error.message ||
              (error.type === "popup_closed"
                ? "Google sign-in was cancelled."
                : "Google sign-in failed")
          )
        );
      },
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description || response.error || "Google sign-in failed"
            )
          );
          return;
        }
        if (!response.access_token) {
          reject(new Error("No access token from Google"));
          return;
        }
        cacheAccessToken(response.access_token, response.expires_in, loginHint);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({
      prompt: "",
      include_granted_scopes: true,
      login_hint: loginHint,
    });
  });
}

/**
 * Creates a native Google Doc from markdown and opens it for editing.
 * Media uses `text/markdown` (Google’s Docs export format for Markdown) so Drive
 * imports structure instead of treating `#` etc. as literal plain text.
 * Uses the limited drive.file scope (only files created by this app).
 */
export async function exportMarkdownToGoogleDoc(
  markdown: string,
  filename: string,
  options: GoogleAccessTokenOptions = {}
): Promise<{ url: string }> {
  const accessToken = await getGoogleAccessToken(options);
  const processedMarkdown = preprocessMarkdownForGoogleDocsExport(markdown ?? "");

  const title = sanitizeDocTitle(filename);
  const boundary = `thinkex_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const metadata = {
    name: title,
    mimeType: "application/vnd.google-apps.document",
  };
  const delimiter = `\r\n--${boundary}\r\n`;
  const close = `\r\n--${boundary}--`;
  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: text/markdown; charset=UTF-8\r\n\r\n" +
    processedMarkdown +
    close;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  const file = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      file.error?.message || res.statusText || `Drive upload failed (${res.status})`
    );
  }

  if (!file.id) {
    throw new Error("Drive did not return a file id");
  }

  const url = `https://docs.google.com/document/d/${file.id}/edit`;

  return {
    url,
  };
}
