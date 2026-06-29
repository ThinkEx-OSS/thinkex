import type { WorkspaceItemSummary, WorkspaceSummary } from "#/features/workspaces/contracts";
import { workspaceRoleLabels } from "#/features/workspaces/contracts";
import {
	workspaceColorOptions,
	workspaceColors,
} from "#/features/workspaces/model/workspace-colors";
import {
	filterWorkspaceIconOptions,
	workspaceIconOptions,
	workspaceIcons,
} from "#/features/workspaces/model/workspace-icons";

const workspaceRecencyTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});
const workspaceRecencyDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});
const workspaceRecencyDateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

export { filterWorkspaceIconOptions, workspaceColorOptions, workspaceColors, workspaceIconOptions };

export function getWorkspaceDisplay(workspace: WorkspaceSummary) {
	const icon = workspace.icon ?? "compass";
	const color = workspace.color ?? "sky";
	const colorDefinition = workspaceColors[color];

	return {
		Icon: workspaceIcons[icon],
		color: {
			bg: colorDefinition.chromeClassName,
			text: colorDefinition.iconClassName,
		},
	};
}

export function getWorkspaceRecencyLabel(workspace: WorkspaceSummary) {
	if (!workspace.lastOpenedAt) {
		return null;
	}

	return `Opened ${formatWorkspaceRecency(workspace.lastOpenedAt)}`;
}

export function getWorkspaceCardRoleLabel(workspace: WorkspaceSummary) {
	return workspaceRoleLabels[workspace.membershipRole];
}

export function getWorkspaceItemRecencyLabel(
	item: Pick<WorkspaceItemSummary, "createdAt" | "updatedAt">,
	now = new Date(),
) {
	const createdAt = Date.parse(item.createdAt);
	const updatedAt = Date.parse(item.updatedAt);
	const isCreatedState =
		!Number.isNaN(createdAt) && !Number.isNaN(updatedAt) && updatedAt <= createdAt;
	const prefix = isCreatedState ? "Created" : "Edited";
	const timestamp = isCreatedState ? item.createdAt : item.updatedAt;

	return `${prefix} ${formatWorkspaceRecency(timestamp, now)}`;
}

export function formatWorkspaceRecency(timestamp: string, now = new Date()) {
	const date = new Date(timestamp);

	if (Number.isNaN(date.getTime())) {
		return "recently";
	}

	if (isSameLocalDay(date, now)) {
		return workspaceRecencyTimeFormatter.format(date);
	}

	const dayDelta = getLocalDayDelta(date, now);

	if (dayDelta > 0) {
		return `${dayDelta} ${dayDelta === 1 ? "day" : "days"} ago`;
	}

	return date.getFullYear() === now.getFullYear()
		? workspaceRecencyDateFormatter.format(date)
		: workspaceRecencyDateWithYearFormatter.format(date);
}

function isSameLocalDay(left: Date, right: Date) {
	return (
		left.getFullYear() === right.getFullYear() &&
		left.getMonth() === right.getMonth() &&
		left.getDate() === right.getDate()
	);
}

function getLocalDayDelta(date: Date, now: Date) {
	const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

	return Math.floor((nowDay - dateDay) / 86_400_000);
}
