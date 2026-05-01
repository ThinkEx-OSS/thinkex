import { toast } from "sonner";
import type { ComposerActions } from "@/lib/stores/composer-actions-store";

export async function rotateCaptureBlob(
  blob: Blob,
  rotation: number,
  type: string,
): Promise<Blob> {
  const r = ((rotation % 4) + 4) % 4;
  if (r === 0) return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    const swap = r === 1 || r === 3;

    const canvas = document.createElement("canvas");
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D canvas context");

    switch (r) {
      case 1:
        ctx.translate(h, 0);
        ctx.rotate(Math.PI / 2);
        break;
      case 2:
        ctx.translate(w, h);
        ctx.rotate(Math.PI);
        break;
      case 3:
        ctx.translate(0, w);
        ctx.rotate(-Math.PI / 2);
        break;
    }
    ctx.drawImage(bitmap, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("Failed to encode rotated capture")),
        type || "image/png",
      );
    });
  } finally {
    bitmap.close();
  }
}

export async function addCaptureToChat(
  blob: Blob,
  filename: string,
  mimeType: string,
  composerActions: ComposerActions | null,
): Promise<void> {
  if (!composerActions) {
    throw new Error("Chat composer not ready");
  }
  const file = new File([blob], filename, { type: mimeType });
  await composerActions.addAttachments([file]);
  toast.success("Screenshot added to chat");
  composerActions.focusInput({ cursorAtEnd: true });
}

export async function extractImageRegion(
  imageSrc: string,
  rect: { x: number; y: number; width: number; height: number },
  rotation: number,
  outputType?: string,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load image for capture"));
    el.src = imageSrc;
  });

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const r = ((rotation % 4) + 4) % 4;

  let sx: number, sy: number, sw: number, sh: number;

  if (r === 0) {
    sx = rect.x;
    sy = rect.y;
    sw = rect.width;
    sh = rect.height;
  } else if (r === 1) {
    sx = rect.y;
    sy = nh - rect.x - rect.width;
    sw = rect.height;
    sh = rect.width;
  } else if (r === 2) {
    sx = nw - rect.x - rect.width;
    sy = nh - rect.y - rect.height;
    sw = rect.width;
    sh = rect.height;
  } else {
    sx = nw - rect.y - rect.height;
    sy = rect.x;
    sw = rect.height;
    sh = rect.width;
  }

  sx = Math.max(0, Math.round(sx));
  sy = Math.max(0, Math.round(sy));
  sw = Math.min(Math.round(sw), nw - sx);
  sh = Math.min(Math.round(sh), nh - sy);

  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D canvas context");

  ctx.save();
  switch (r) {
    case 1:
      ctx.translate(rect.width, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 2:
      ctx.translate(rect.width, rect.height);
      ctx.rotate(Math.PI);
      break;
    case 3:
      ctx.translate(0, rect.height);
      ctx.rotate(-Math.PI / 2);
      break;
  }

  if (r === 0) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, rect.width, rect.height);
  } else if (r === 1 || r === 3) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, rect.height, rect.width);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, rect.width, rect.height);
  }
  ctx.restore();

  const mimeType = outputType || "image/png";
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Failed to encode captured region")),
      mimeType,
    );
  });
}
