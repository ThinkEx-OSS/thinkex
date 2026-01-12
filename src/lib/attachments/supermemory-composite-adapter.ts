import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
} from "@assistant-ui/react";
import { extractUrlFromFile, isUrlFile, getMediaTypeFromUrl, getFilenameFromUrl, isVideoUrl } from "./url-utils";

interface SupermemoryCompositeAdapterOptions {
  workspaceId: string;
}

/**
 * Custom attachment adapter that:
 * 1. Shows attachments immediately in composer (status "complete" in add())
 * 2. Uploads to Supabase Storage for persistence
 * 3. Returns content parts for AI SDK (images as base64, text as text)
 */
export class SupermemoryCompositeAdapter implements AttachmentAdapter {
  public accept = "image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json"; // Accept standard file types
  private workspaceId: string;

  constructor(options: SupermemoryCompositeAdapterOptions) {
    this.workspaceId = options.workspaceId;
  }

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    // Return attachment immediately with status "complete" so it shows as ready in composer
    // Similar to SimpleImageAttachmentAdapter and SimpleTextAttachmentAdapter behavior
    const id = crypto.randomUUID();

    // Check if this is a URL file
    const isUrl = isUrlFile(file);
    let url: string | null = null;
    if (isUrl || file.type === 'text/plain') {
      url = await extractUrlFromFile(file);
    }

    // Determine attachment type based on file type or URL
    let type: "image" | "document" | "file" = "file";
    if (url) {
      // URLs are treated as documents
      type = "document";
    } else if (file.type.startsWith("image/")) {
      type = "image";
    } else if (
      file.type.startsWith("text/") ||
      file.type === "application/pdf" ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".csv")
    ) {
      type = "document";
    }

    return {
      id,
      type,
      name: url || file.name,
      contentType: file.type,
      file,
      status: { type: "running", reason: "uploading", progress: 0 },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const file = attachment.file;
    if (!file) {
      throw new Error("File not found in attachment");
    }

    // Check if this is a URL attachment
    const url = await extractUrlFromFile(file);

    if (url) {
      // Handle URL attachment
      return this.handleUrlAttachment(attachment, url);
    }

    // Step 1: Upload to Supabase Storage for persistence
    let supabaseUrl: string | undefined;
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload-file", {
        method: "POST",
        body: formData,
      });

      if (uploadResponse.ok) {
        const uploadData = await uploadResponse.json();
        supabaseUrl = uploadData.url;
      } else {
        // Log error and throw - we strictly require Supabase upload for files now
        console.warn("Failed to upload to Supabase:", await uploadResponse.text());
        throw new Error("Failed to upload file. Please try again.");
      }
    } catch (error) {
      // Log error and throw
      console.warn("Error uploading to Supabase:", error);
      throw new Error("Failed to upload file. Please try again.");
    }

    // Step 2: Convert file to content parts for AI SDK
    // Use consistent approach: send all file URLs as text with marker
    // Server-side will detect marker and convert to appropriate format (image or file)
    const content: Array<{ type: "text"; text: string }> = [];

    // Sanitize filename to prevent breaking the regex parser (remove | and ])
    const sanitizedFilename = file.name.replace(/[|\]]/g, "_");

    // Ensure we have a media type
    const mediaType = file.type || "application/octet-stream";

    if (supabaseUrl) {
      // Send Supabase URL with marker for all files (including images)
      // Server-side will convert to appropriate format based on mediaType
      content.push({
        type: "text",
        text: `[FILE_URL:${supabaseUrl}|mediaType:${mediaType}|filename:${sanitizedFilename}]`,
      });
    } else {
      // Should be unreachable due to error throw above, but just in case
      throw new Error("File upload failed");
    }

    // Step 3: Return content for AI SDK
    return {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: file.type,
      content,
      status: { type: "complete" },
    };
  }

  async remove(attachment: PendingAttachment): Promise<void> {
    // Cleanup if needed (e.g., revoke object URLs)
    // For now, we'll just clear it from the UI
  }

  /**
   * Handle URL attachment - send URL to AI
   */
  private async handleUrlAttachment(
    attachment: PendingAttachment,
    url: string
  ): Promise<CompleteAttachment> {
    // Determine media type and filename based on URL
    const mediaType = getMediaTypeFromUrl(url);
    const filename = getFilenameFromUrl(url);

    // Sanitize filename
    const sanitizedFilename = filename.replace(/[|\]]/g, "_");

    // Step 1: Send URL to AI with appropriate format
    const content: Array<{ type: "text"; text: string }> = [];

    if (isVideoUrl(url)) {
      // For video URLs (YouTube, Vimeo, etc.), use FILE_URL marker with video mediaType
      // This enables direct video processing by AI models that support it
      content.push({
        type: "text",
        text: `[FILE_URL:${url}|mediaType:${mediaType}|filename:${sanitizedFilename}]`,
      });
    } else {
      // For other URLs, use the existing URL_CONTEXT marker for web scraping
      // Note: We don't sanitize URL_CONTEXT URL because it doesn't use | separators in the regex
      content.push({
        type: "text",
        text: `[URL_CONTEXT:${url}]`,
      });
    }

    // Step 2: Return content for AI SDK
    return {
      id: attachment.id,
      type: attachment.type,
      name: filename,
      contentType: mediaType,
      content,
      status: { type: "complete" },
    };
  }
}

