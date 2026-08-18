import type { Editor } from "@tiptap/react";

import { WorkspaceFindBar } from "#/features/workspaces/components/WorkspaceFindBar";
import { useDocumentFindEngine } from "#/features/workspaces/find/use-document-find-engine";
import { useWorkspaceFind } from "#/features/workspaces/find/use-workspace-find";

/** A leaf so typing in the find bar re-renders the bar, not the whole editor. */
export function DocumentFindBar({ editor }: { editor: Editor | null }) {
	const find = useWorkspaceFind();
	const engine = useDocumentFindEngine(editor, find.query, find.caseSensitive);

	return <WorkspaceFindBar engine={engine} find={find} label="Find in document" />;
}
