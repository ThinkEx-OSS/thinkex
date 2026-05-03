const PDF_THUMBNAIL_WIDTH = 720;

interface GeneratedPdfThumbnail {
  file: File;
  width: number;
  height: number;
}

function getThumbnailFilename(filename: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, "");
  return `${baseName}-thumb.jpg`;
}

async function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error("Failed to encode PDF thumbnail"));
      },
      "image/jpeg",
      0.86,
    );
  });

  return new File([blob], filename, { type: "image/jpeg" });
}

export async function generatePdfThumbnail(params: {
  filename: string;
  file?: File;
  url?: string;
}): Promise<GeneratedPdfThumbnail> {
  if (!params.file && !params.url) {
    throw new Error("A PDF file or URL is required to generate a thumbnail");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({
    ...(params.file
      ? { data: new Uint8Array(await params.file.arrayBuffer()) }
      : { url: params.url }),
    isEvalSupported: false,
    useSystemFonts: true,
  } as any);

  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = PDF_THUMBNAIL_WIDTH / Math.max(1, baseViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to get canvas context for PDF thumbnail");
    }

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const file = await canvasToJpegFile(
      canvas,
      getThumbnailFilename(params.filename),
    );

    return {
      file,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    await loadingTask.destroy();
  }
}
