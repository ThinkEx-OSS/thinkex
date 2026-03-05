/**
 * Client-side HEIC/HEIF → JPEG conversion for browser compatibility.
 * Safari displays HEIC natively; Chrome/Firefox do not.
 * Converting before upload ensures images work everywhere.
 */

const HEIC_TYPES = ["image/heic", "image/heif"];
const HEIC_EXTS = /\.(heic|heif)$/i;

export function isHeicFile(file: File): boolean {
  return (
    HEIC_TYPES.includes(file.type) || HEIC_EXTS.test(file.name)
  );
}

/**
 * Converts HEIC/HEIF to JPEG in the browser. Returns the original file
 * if not HEIC or if conversion fails. Uses heic2any (browser-only).
 */
export async function convertHeicToJpegIfNeeded(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!isHeicFile(file)) return file;

  try {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    const jpegBlob = Array.isArray(result) ? result[0] : result;
    const name = file.name.replace(HEIC_EXTS, ".jpg");
    return new File([jpegBlob], name, { type: "image/jpeg" });
  } catch (err) {
    console.warn("HEIC conversion failed, uploading original:", err);
    return file;
  }
}
