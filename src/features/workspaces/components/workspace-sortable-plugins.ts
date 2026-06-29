import { Feedback } from "@dnd-kit/dom";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import type { UseSortableInput } from "@dnd-kit/react/sortable";
import { WorkspaceOptimisticSortingPlugin } from "#/features/workspaces/components/workspace-optimistic-sorting-plugin";
import type { WorkspaceDragData } from "#/features/workspaces/model/drag";

type WorkspaceSortablePlugins = NonNullable<UseSortableInput<WorkspaceDragData>["plugins"]>;
type WorkspaceSortablePluginResolver = Exclude<WorkspaceSortablePlugins, readonly unknown[]>;

export const workspaceControlledSortablePlugins: WorkspaceSortablePluginResolver = (defaults) =>
	defaults.map((plugin) =>
		plugin === OptimisticSortingPlugin ? WorkspaceOptimisticSortingPlugin : plugin,
	);

export const workspaceItemSortablePlugins: WorkspaceSortablePluginResolver = (defaults) => [
	...workspaceControlledSortablePlugins(defaults),
	Feedback.configure({ feedback: "clone", dropAnimation: null }),
];
