import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";
import type {
  ChatToolUIRenderArgs,
} from "@/lib/chat/tool-ui-types";

import { renderAddYoutubeVideoToolUI } from "./AddYoutubeVideoToolUI";
import { renderCreateDocumentToolUI } from "./CreateDocumentToolUI";
import { renderCreateFlashcardToolUI } from "./CreateFlashcardToolUI";
import { renderCreateQuizToolUI } from "./CreateQuizToolUI";
import { renderEditItemToolUI } from "./EditItemToolUI";
import { renderExecuteCodeToolUI } from "./ExecuteCodeToolUI";
import { renderReadWorkspaceToolUI } from "./ReadWorkspaceToolUI";
import { renderSearchWorkspaceToolUI } from "./SearchWorkspaceToolUI";
import { renderURLContextToolUI } from "./URLContextToolUI";
import { renderWebSearchToolUI } from "./WebSearchToolUI";
import { renderYouTubeSearchToolUI } from "./YouTubeSearchToolUI";

type ToolRender = (args: ChatToolUIRenderArgs) => React.ReactNode;

/**
 * Map canonical tool name → render function. Lookups go through
 * `LEGACY_CHAT_TOOL_NAMES` upstream so older persisted messages still resolve.
 */
export const TOOL_RENDERERS: Partial<Record<string, ToolRender>> = {
  [CHAT_TOOL.WEB_FETCH]: renderURLContextToolUI as ToolRender,
  [CHAT_TOOL.WEB_SEARCH]: renderWebSearchToolUI as ToolRender,
  [CHAT_TOOL.CODE_EXECUTE]: renderExecuteCodeToolUI as ToolRender,
  [CHAT_TOOL.WORKSPACE_SEARCH]: renderSearchWorkspaceToolUI as ToolRender,
  [CHAT_TOOL.WORKSPACE_READ]: renderReadWorkspaceToolUI as ToolRender,
  [CHAT_TOOL.DOCUMENT_CREATE]: renderCreateDocumentToolUI as ToolRender,
  [CHAT_TOOL.ITEM_EDIT]: renderEditItemToolUI as ToolRender,
  [CHAT_TOOL.FLASHCARDS_CREATE]: renderCreateFlashcardToolUI as ToolRender,
  [CHAT_TOOL.QUIZ_CREATE]: renderCreateQuizToolUI as ToolRender,
  [CHAT_TOOL.YOUTUBE_SEARCH]: renderYouTubeSearchToolUI as ToolRender,
  [CHAT_TOOL.YOUTUBE_ADD]: renderAddYoutubeVideoToolUI as ToolRender,
};
