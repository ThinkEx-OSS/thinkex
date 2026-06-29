const WORKSPACE_TAB_COLLISION_TYPE_HORIZONTAL_CENTER = 3;
const WORKSPACE_TAB_COLLISION_PRIORITY = 6;
const WORKSPACE_TAB_SOURCE_RELEASE_RATIO = 0.58;
const WORKSPACE_TAB_VERTICAL_COLLISION_OVERSCAN = 12;

type WorkspaceTabDragOperationShape = {
	initial?: {
		center: { x: number; y: number };
	};
	current: {
		center: { x: number; y: number };
	};
};

type WorkspaceTabCollisionDragOperation = {
	source?: { id?: unknown } | null;
	shape?: WorkspaceTabDragOperationShape | null;
	position: {
		direction?: "left" | "right" | "up" | "down" | null;
		current: { x: number; y: number } | null;
	};
};

type WorkspaceTabCollisionDroppable = {
	id: string | number;
	shape?: {
		boundingRectangle: {
			left: number;
			right: number;
			top: number;
			bottom: number;
		};
		center: { x: number; y: number };
	} | null;
};

export const horizontalTabCollisionDetector = ({
	dragOperation,
	droppable,
}: {
	dragOperation: WorkspaceTabCollisionDragOperation;
	droppable: WorkspaceTabCollisionDroppable;
}) => {
	if (!droppable.shape) {
		return null;
	}

	const center = dragOperation.shape?.current.center ?? dragOperation.position.current;

	if (!center) {
		return null;
	}

	const { boundingRectangle } = droppable.shape;

	if (isOutsideVerticalTabBand(center.y, boundingRectangle)) {
		return null;
	}

	const direction =
		dragOperation.position.direction ?? getHorizontalDirectionFromShape(dragOperation.shape);
	const width = boundingRectangle.right - boundingRectangle.left;

	if (
		droppable.id === dragOperation.source?.id &&
		(direction === "left" || direction === "right")
	) {
		const sourceReleaseX =
			direction === "right"
				? boundingRectangle.left + width * WORKSPACE_TAB_SOURCE_RELEASE_RATIO
				: boundingRectangle.right - width * WORKSPACE_TAB_SOURCE_RELEASE_RATIO;
		const sourceShouldRelease =
			direction === "right" ? center.x >= sourceReleaseX : center.x <= sourceReleaseX;

		if (sourceShouldRelease) {
			return null;
		}
	}

	return getHorizontalCenterCollision(droppable, center);
};

function getHorizontalCenterCollision(
	droppable: WorkspaceTabCollisionDroppable,
	center: { x: number },
) {
	if (!droppable.shape) {
		return null;
	}

	const distance = Math.abs(droppable.shape.center.x - center.x);

	return {
		id: droppable.id,
		value: distance === 0 ? 1 : 1 / distance,
		type: WORKSPACE_TAB_COLLISION_TYPE_HORIZONTAL_CENTER,
		priority: WORKSPACE_TAB_COLLISION_PRIORITY,
	};
}

function isOutsideVerticalTabBand(centerY: number, bounds: { top: number; bottom: number }) {
	return (
		centerY < bounds.top - WORKSPACE_TAB_VERTICAL_COLLISION_OVERSCAN ||
		centerY > bounds.bottom + WORKSPACE_TAB_VERTICAL_COLLISION_OVERSCAN
	);
}

function getHorizontalDirectionFromShape(
	shape:
		| {
				initial?: { center: { x: number } };
				current: { center: { x: number } };
		  }
		| null
		| undefined,
) {
	if (!shape?.initial) {
		return null;
	}

	const delta = shape.current.center.x - shape.initial.center.x;

	if (!delta) {
		return null;
	}

	return delta > 0 ? "right" : "left";
}
