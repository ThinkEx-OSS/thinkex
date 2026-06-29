export const AI_CHAT_ATTACHMENT_ACCEPT =
	"image/*,image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif";
export const AI_CHAT_MAX_FILE_SIZE = 20 * 1024 * 1024;
export const AI_CHAT_MAX_FILES = 8;

export const WORKSPACE_AI_CHAT_ATTACHMENT_POLICY = {
	accept: AI_CHAT_ATTACHMENT_ACCEPT,
	maxFileSize: AI_CHAT_MAX_FILE_SIZE,
	maxFiles: AI_CHAT_MAX_FILES,
} as const;
