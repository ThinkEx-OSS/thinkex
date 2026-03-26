import { describe, expect, it } from "vitest";
import { createUploadedAsset } from "../uploaded-asset";

describe("createUploadedAsset", () => {
  it("preserves the converted PDF content type for office uploads", () => {
    const originalOfficeFile = new File(["dummy"], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const asset = createUploadedAsset({
      fileUrl: "https://example.com/notes.pdf",
      filename: "uploads/notes.pdf",
      displayName: "notes.pdf",
      contentType: "application/pdf",
      originalFile: originalOfficeFile,
    });

    expect(asset.kind).toBe("file");
    expect(asset.contentType).toBe("application/pdf");
    expect(asset.displayName).toBe("notes.pdf");
  });

  it("still falls back to the original file type when no processed content type exists", () => {
    const originalImageFile = new File(["dummy"], "photo.heic", {
      type: "image/heic",
    });

    const asset = createUploadedAsset({
      fileUrl: "https://example.com/photo.jpg",
      filename: "uploads/photo.jpg",
      displayName: "photo.jpg",
      contentType: "",
      originalFile: originalImageFile,
    });

    expect(asset.kind).toBe("image");
    expect(asset.contentType).toBe("image/heic");
  });
});
