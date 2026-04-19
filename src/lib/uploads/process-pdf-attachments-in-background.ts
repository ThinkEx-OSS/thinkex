import { toast } from "sonner";
import { buildWorkspaceItemDefinitionsFromAssets } from "@/lib/uploads/uploaded-asset";
import { uploadSelectedFiles } from "@/lib/uploads/upload-selection";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";

interface PdfAttachmentLike {
  file?: File;
}

interface WorkspaceOperationsLike {
  createItems: (
    defs: ReturnType<typeof buildWorkspaceItemDefinitionsFromAssets>,
    options?: { showSuccessToast?: boolean },
  ) => string[];
}

export async function processPdfAttachmentsInBackground(
  pdfAttachments: PdfAttachmentLike[],
  workspaceId: string,
  operations: WorkspaceOperationsLike,
) {
  let files: File[] = [];
  try {
    files = pdfAttachments
      .map((attachment) => attachment.file)
      .filter((file): file is File => !!file);
    const { uploads, failedFiles } = await uploadSelectedFiles(files);

    if (uploads.length > 0) {
      const pdfCardDefinitions = buildWorkspaceItemDefinitionsFromAssets(uploads);
      const createdIds = operations.createItems(pdfCardDefinitions, {
        showSuccessToast: false,
      });

      void startAssetProcessing({
        workspaceId,
        assets: uploads,
        itemIds: createdIds,
        onOcrError: (error) => {
          console.error("Error starting assistant file processing:", error);
        },
      });

      if (failedFiles.length === 0) {
        toast.success(getDocumentUploadSuccessMessage(uploads.length));
      } else {
        toast.warning(
          getDocumentUploadPartialMessage(uploads.length, failedFiles.length),
        );
      }
    } else {
      toast.error(
        getDocumentUploadFailureMessage(failedFiles.length || files.length),
      );
    }
  } catch (error) {
    console.error("Error creating PDF cards in background:", error);
    toast.error(
      getDocumentUploadFailureMessage(files.length || pdfAttachments.length),
    );
  }
}
