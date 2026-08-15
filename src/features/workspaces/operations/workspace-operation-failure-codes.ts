import { documentAiEditFailureCodes } from "#/features/workspaces/documents/document-ai-edits";
import { workspaceRelationFailureCodes } from "#/features/workspaces/operations/relations";

// The failure-code vocabulary for each workspace operation. This is a pure leaf
// (no operation impls, no persistence imports) so the model-facing schema + contract layer can
// depend on it without dragging the worker runtime — which also lets these run in
// plain Node evals. Impls import their codes from here rather than owning them.

export const createWorkspaceItemsFailureCodes = [
	"cannot_create_root",
	"invalid_initial_content",
	"widget_script_syntax_error",
	"path_already_exists",
	"path_not_absolute",
	"path_not_folder",
	"path_not_found",
	...workspaceRelationFailureCodes,
] as const;

export const deleteWorkspaceItemsFailureCodes = [
	"cannot_delete_root",
	"path_not_absolute",
	"path_not_found",
] as const;

export const editWorkspaceItemFailureCodes = [
	"cannot_edit_root",
	"path_not_absolute",
	"path_not_found",
	"unsupported_item_type",
	"cannot_delete_last_entry",
	"invalid_entry_content",
	...documentAiEditFailureCodes,
	"content_changed",
	"operation_id_conflict",
] as const;

export const linkWorkspaceItemsFailureCodes = [
	"cannot_link_root",
	"path_not_absolute",
	"path_not_found",
	...workspaceRelationFailureCodes,
] as const;

export const moveWorkspaceItemsFailureCodes = [
	"already_in_destination",
	"cannot_move_into_descendant",
	"cannot_move_root",
	"destination_path_not_absolute",
	"destination_path_not_folder",
	"destination_path_not_found",
	"path_already_exists",
	"path_not_absolute",
	"path_not_found",
] as const;

export const renameWorkspaceItemFailureCodes = [
	"cannot_rename_root",
	"path_already_exists",
	"path_not_absolute",
	"path_not_found",
] as const;
