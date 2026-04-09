import { isAllowedOcrFileUrl } from "@/lib/ocr/url-validation";

/**
 * Validate that a file URL points to an allowed asset host.
 * Delegates to the shared OCR allowlist which covers Supabase, app URL,
 * and localhost in dev -- the same hosts that are valid for any asset.
 */
export function isAllowedAssetUrl(url: string): boolean {
  return isAllowedOcrFileUrl(url);
}
