import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { DocumentAskSelectionMenu } from "#/features/workspaces/components/document-editor/DocumentAskSelectionMenu";
import { DocumentWordCount } from "#/features/workspaces/components/document-editor/DocumentWordCount";
import { useDocumentEditorToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { useWorkspacePaneRuntime } from "#/features/workspaces/components/WorkspacePaneRuntime";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import {
	getTiptapDocumentBaseExtensions,
	tiptapDocumentYjsField,
} from "#/features/workspaces/documents/tiptap-extensions";
import {
	type DocumentCollaborationSession,
	useDocumentCollaborationSession,
} from "#/features/workspaces/documents/use-document-collaboration-session";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { DEFAULT_COLLABORATION_COLOR } from "#/lib/design-system-colors";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

export function DocumentEditorSurface({
	item,
	toolbarSlotId,
	workspaceId,
}: {
	item: WorkspaceItem;
	toolbarSlotId?: string;
	workspaceId: string;
}) {
	const { data: session } = useQuery(getAuthSessionQueryOptions());
	const sessionUser = session?.user;
	const collaborationSession = useDocumentCollaborationSession({
		workspaceId,
		itemId: item.id,
		userId: sessionUser?.id ?? null,
		userImage: sessionUser?.image ?? null,
		userName: sessionUser ? sessionUser.name || sessionUser.email || "User" : null,
	});

	if (!collaborationSession) {
		return <DocumentEditorSkeleton />;
	}

	return (
		<DocumentEditorInstance
			collaborationSession={collaborationSession}
			item={item}
			toolbarSlotId={toolbarSlotId}
			workspaceId={workspaceId}
		/>
	);
}

function DocumentEditorInstance({
	collaborationSession,
	item,
	toolbarSlotId,
	workspaceId,
}: {
	collaborationSession: DocumentCollaborationSession;
	item: WorkspaceItem;
	toolbarSlotId?: string;
	workspaceId: string;
}) {
	const { capabilities } = useWorkspaceMutationAccess();
	const paneRuntime = useWorkspacePaneRuntime();
	const [scrollTarget, setScrollTarget] = useState<HTMLDivElement | null>(null);
	const editor = useEditor({
		immediatelyRender: false,
		autofocus: capabilities.canMutateContent ? "start" : false,
		editable: capabilities.canMutateContent,
		enableContentCheck: true,
		onContentError: ({ disableCollaboration }) => {
			disableCollaboration();
		},
		extensions: getDocumentEditorExtensions(collaborationSession),
		editorProps: {
			attributes: {
				"aria-label": capabilities.canMutateContent
					? `${item.name} editor`
					: `${item.name} document`,
				class: "workspace-document-prose min-h-full p-4 outline-none",
			},
			handleKeyDown: (_view, event) => {
				if (event.key !== "Escape" || !paneRuntime?.onCloseItemView) {
					return false;
				}

				event.preventDefault();
				event.stopPropagation();
				paneRuntime.onCloseItemView();
				return true;
			},
		},
	});

	useDocumentEditorToolbar(toolbarSlotId ?? item.id, capabilities.canMutateContent ? editor : null);

	return (
		<section className="relative flex h-full min-h-0 flex-col bg-background">
			<div data-scroll-root ref={setScrollTarget} className="min-h-0 flex-1 overflow-y-auto">
				<div className="min-h-full w-full pb-8">
					<DocumentAskSelectionMenu
						editor={editor}
						itemId={item.id}
						scrollTarget={scrollTarget}
						workspaceId={workspaceId}
					/>
					<EditorContent className="min-h-full" editor={editor} />
				</div>
			</div>
			<DocumentWordCount editor={editor} />
		</section>
	);
}

function getDocumentEditorExtensions(collaborationSession: DocumentCollaborationSession) {
	const baseExtensions = getTiptapDocumentBaseExtensions();

	return [
		...baseExtensions,
		Collaboration.configure({
			document: collaborationSession.ydoc,
			field: tiptapDocumentYjsField,
		}),
		CollaborationCaret.configure({
			provider: collaborationSession.provider,
			user: collaborationSession.provider.awareness.getLocalState()?.user ?? {},
			render: renderCollaborationCaret,
			selectionRender: renderCollaborationSelection,
		}),
	];
}

function renderCollaborationCaret(user: Record<string, unknown>) {
	const color = getCollaborationUserColor(user);
	const cursor = document.createElement("span");
	const label = document.createElement("span");

	cursor.style.borderLeft = `2px solid ${color}`;
	cursor.style.borderRight = `2px solid ${color}`;
	cursor.style.marginLeft = "-1px";
	cursor.style.marginRight = "-1px";
	cursor.style.pointerEvents = "none";
	cursor.style.position = "relative";

	label.textContent = getCollaborationUserName(user);
	label.style.backgroundColor = color;
	label.style.borderRadius = "4px";
	label.style.bottom = "100%";
	label.style.color = "white";
	label.style.fontSize = "11px";
	label.style.fontWeight = "500";
	label.style.left = "-1px";
	label.style.lineHeight = "1";
	label.style.padding = "3px 5px";
	label.style.position = "absolute";
	label.style.whiteSpace = "nowrap";

	cursor.appendChild(label);

	return cursor;
}

function renderCollaborationSelection(user: Record<string, unknown>) {
	return {
		nodeName: "span",
		style: `background-color: ${getCollaborationUserColor(user)}33`,
	};
}

function getCollaborationUserColor(user: Record<string, unknown>) {
	return typeof user.color === "string" ? user.color : DEFAULT_COLLABORATION_COLOR;
}

function getCollaborationUserName(user: Record<string, unknown>) {
	return typeof user.name === "string" && user.name.trim() ? user.name : "User";
}

function DocumentEditorSkeleton() {
	return (
		<section className="relative flex h-full min-h-0 flex-col bg-background">
			<div className="min-h-0 flex-1 overflow-hidden p-4">
				<div className="max-w-3xl space-y-5">
					<Skeleton className="h-8 w-2/3 rounded-sm bg-muted/55" />
					<div className="space-y-2.5">
						<Skeleton className="h-4 w-full rounded-sm bg-muted/45" />
						<Skeleton className="h-4 w-11/12 rounded-sm bg-muted/45" />
						<Skeleton className="h-4 w-4/5 rounded-sm bg-muted/45" />
					</div>
					<div className="space-y-2.5">
						<Skeleton className="h-4 w-full rounded-sm bg-muted/45" />
						<Skeleton className="h-4 w-10/12 rounded-sm bg-muted/45" />
						<Skeleton className="h-4 w-7/12 rounded-sm bg-muted/45" />
					</div>
				</div>
			</div>
			<Skeleton className="absolute right-3 bottom-3 h-6 w-16 rounded-full bg-muted/45" />
		</section>
	);
}
