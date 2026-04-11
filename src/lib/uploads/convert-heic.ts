/**
 * Client-side HEIC/HEIF → JPEG conversion for browser compatibility.
 * Safari displays HEIC natively; Chrome/Firefox do not.
 * Converting before upload ensures images work everywhere.
 *
 * Uses `heic-to` (libheif 1.21.2) which supports modern iOS 18+ HEIC
 * variants and detects HEIC via magic bytes, not just MIME type.
 */

const HEIC_TYPES = ["image/heic", "image/heif"];
const HEIC_EXTS = /\.(heic|heif)$/i;

/**
 * Quick synchronous check based on MIME type and file extension.
 * Used by callers that need a fast, non-async gate (e.g. accept lists).
 */
export function isHeicFile(file: File): boolean {
  return HEIC_TYPES.includes(file.type) || HEIC_EXTS.test(file.name);
}

/**
 * Converts HEIC/HEIF to JPEG in the browser. Returns the original file
 * if not HEIC or if conversion fails. Uses heic-to (browser-only).
 *
 * Detection uses `isHeic()` from heic-to which reads the file's magic
 * bytes — this catches files some browsers label as application/octet-stream.
 */
export async function convertHeicToJpegIfNeeded(file: File): Promise<File> {
  if (typeof window === "undefined") return file;

  // Fast sync gate — skip obviously non-HEIC files
  if (!isHeicFile(file)) {
    // Only fall through for ambiguous MIME types that might actually be HEIC
    const isAmbiguousMime = file.type === "" || file.type === "application/octet-stream";
    if (!isAmbiguousMime) return file;
  }

  try {
    // Dynamic import keeps heic-to (~200KB WASM) out of the main bundle
    const { isHeic, heicTo } = await import("heic-to");
    const heic = await isHeic(file);
    if (!heic) return file;

    const jpegBlob = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.9,
    });
    const name = HEIC_EXTS.test(file.name)
      ? file.name.replace(HEIC_EXTS, ".jpg")
      : file.name.replace(/(\.[^.]+)?$/, ".jpg");

    return new File([jpegBlob], name, { type: "image/jpeg" });
  } catch (err) {
    console.warn("HEIC conversion failed, uploading original:", err);
    return file;
  }
}
