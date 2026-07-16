import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type Matter from "matter-js";

import { cn } from "#/lib/utils";

type GravityProps = {
	children: ReactNode;
	className?: string;
	gravity?: { x: number; y: number };
	topBoundaryOffset?: number;
};

type MatterBodyProps = {
	children: ReactNode;
	className?: string;
	isDraggable?: boolean;
	matterBodyOptions?: Matter.IChamferableBodyDefinition;
	x?: number | string;
	y?: number | string;
	angle?: number;
};

type MatterBodyPhysicsOptions = Pick<
	MatterBodyProps,
	"angle" | "isDraggable" | "matterBodyOptions" | "x" | "y"
>;

type RegisteredBody = {
	body: Matter.Body;
	element: HTMLElement;
};

type ScrollCapturingMatterMouse = Matter.Mouse & {
	mousewheel: EventListener;
};

type MatterRuntime = typeof Matter;

const GravityContext = createContext<{
	registerElement: (id: string, element: HTMLElement, options: MatterBodyPhysicsOptions) => void;
	unregisterElement: (id: string) => void;
} | null>(null);

export function MatterBody({
	children,
	className,
	isDraggable = true,
	matterBodyOptions,
	x = "50%",
	y = "50%",
	angle = 0,
}: MatterBodyProps) {
	const elementRef = useRef<HTMLDivElement | null>(null);
	const id = useId();
	const context = useContext(GravityContext);

	useEffect(() => {
		if (!context || !elementRef.current) {
			return;
		}

		context.registerElement(id, elementRef.current, {
			isDraggable,
			matterBodyOptions,
			x,
			y,
			angle,
		});

		return () => context.unregisterElement(id);
	}, [angle, context, id, isDraggable, matterBodyOptions, x, y]);

	return (
		<div
			ref={elementRef}
			className={cn(
				"absolute top-0 left-0 will-change-transform",
				isDraggable && "pointer-events-none",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function Gravity({
	children,
	className,
	gravity = { x: 0, y: 1 },
	topBoundaryOffset = 0,
}: GravityProps) {
	const sceneRef = useRef<HTMLDivElement | null>(null);
	const engineRef = useRef<Matter.Engine | null>(null);
	const matterRef = useRef<typeof Matter | null>(null);
	const frameRef = useRef<number | null>(null);
	const bodiesRef = useRef(new Map<string, RegisteredBody>());
	const [isReady, setIsReady] = useState(false);
	const [isNearViewport, setIsNearViewport] = useState(false);

	const registerElement = useCallback(
		(id: string, element: HTMLElement, options: MatterBodyPhysicsOptions) => {
			const scene = sceneRef.current;
			const engine = engineRef.current;
			const Matter = matterRef.current;

			if (!scene || !engine || !Matter) {
				return;
			}

			const width = element.offsetWidth;
			const height = element.offsetHeight;
			const body = Matter.Bodies.rectangle(
				calculatePosition(options.x, scene.offsetWidth),
				calculatePosition(options.y, scene.offsetHeight),
				width,
				height,
				{
					...options.matterBodyOptions,
					angle: ((options.angle ?? 0) * Math.PI) / 180,
					render: { visible: false },
				},
			);

			Matter.Composite.add(engine.world, body);
			bodiesRef.current.set(id, { body, element });
		},
		[],
	);

	const unregisterElement = useCallback((id: string) => {
		const engine = engineRef.current;
		const Matter = matterRef.current;
		const registeredBody = bodiesRef.current.get(id);

		if (Matter && engine && registeredBody) {
			Matter.Composite.remove(engine.world, registeredBody.body);
		}

		bodiesRef.current.delete(id);
	}, []);

	useEffect(() => {
		const scene = sceneRef.current;

		if (!scene) {
			return;
		}

		if (typeof window.IntersectionObserver === "undefined") {
			const frame = window.requestAnimationFrame(() => setIsNearViewport(true));
			return () => window.cancelAnimationFrame(frame);
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsNearViewport(entry?.isIntersecting ?? false);
			},
			{
				root: scene.closest("[data-scroll-root]"),
				rootMargin: "240px",
			},
		);

		observer.observe(scene);

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!isNearViewport) {
			return;
		}

		const scene = sceneRef.current;

		if (!scene) {
			return;
		}

		const sceneElement = scene;
		let cancelled = false;
		let cleanupScene: (() => void) | undefined;

		async function startScene() {
			const Matter = (await import("matter-js")).default;

			if (cancelled) {
				return;
			}

			matterRef.current = Matter;

			const width = sceneElement.offsetWidth;
			const height = sceneElement.offsetHeight;
			const engine = Matter.Engine.create();
			engine.gravity.x = gravity.x;
			engine.gravity.y = gravity.y;

			const render = Matter.Render.create({
				element: sceneElement,
				engine,
				options: {
					background: "transparent",
					height,
					pixelRatio: Math.min(window.devicePixelRatio, 2),
					wireframes: false,
					width,
				},
			});
			render.canvas.style.position = "absolute";
			render.canvas.style.inset = "0";
			render.canvas.style.height = "100%";
			render.canvas.style.opacity = "0";
			render.canvas.style.width = "100%";

			const mouse = Matter.Mouse.create(render.canvas) as ScrollCapturingMatterMouse;
			render.canvas.removeEventListener("wheel", mouse.mousewheel);
			const mouseConstraint = Matter.MouseConstraint.create(engine, {
				mouse,
				constraint: {
					render: { visible: false },
					stiffness: 0.2,
				},
			});
			const walls = createWalls(Matter, width, height, topBoundaryOffset);

			Matter.Composite.add(engine.world, [...walls, mouseConstraint]);

			const runner = Matter.Runner.create({ delta: 1000 / 60 });
			Matter.Render.run(render);
			Matter.Runner.run(runner, engine);

			engineRef.current = engine;
			const bodies = bodiesRef.current;

			function updateElements() {
				for (const { body, element } of bodies.values()) {
					element.style.transform = `translate3d(${body.position.x - element.offsetWidth / 2}px, ${
						body.position.y - element.offsetHeight / 2
					}px, 0) rotate(${body.angle}rad)`;
				}

				frameRef.current = window.requestAnimationFrame(updateElements);
			}

			frameRef.current = window.requestAnimationFrame(updateElements);
			setIsReady(true);

			function releaseMouse() {
				mouse.button = -1;
			}

			window.addEventListener("mouseup", releaseMouse);
			window.addEventListener("touchend", releaseMouse);

			cleanupScene = () => {
				window.removeEventListener("mouseup", releaseMouse);
				window.removeEventListener("touchend", releaseMouse);

				if (frameRef.current) {
					window.cancelAnimationFrame(frameRef.current);
				}

				Matter.Mouse.clearSourceEvents(mouse);
				Matter.Render.stop(render);
				Matter.Runner.stop(runner);
				Matter.World.clear(engine.world, false);
				Matter.Engine.clear(engine);
				render.canvas.remove();
				bodies.clear();
				engineRef.current = null;
				matterRef.current = null;
				setIsReady(false);
			};
		}

		void startScene();

		return () => {
			cancelled = true;
			cleanupScene?.();
		};
	}, [gravity.x, gravity.y, isNearViewport, topBoundaryOffset]);

	const contextValue = {
		registerElement,
		unregisterElement,
	};

	return (
		<GravityContext.Provider value={contextValue}>
			<div
				ref={sceneRef}
				className={cn(
					"relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing",
					className,
				)}
			>
				{isReady ? children : null}
			</div>
		</GravityContext.Provider>
	);
}

function calculatePosition(value: number | string | undefined, containerSize: number) {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string" && value.endsWith("%")) {
		return containerSize * (Number.parseFloat(value) / 100);
	}

	return containerSize / 2;
}

function createWalls(
	Matter: MatterRuntime,
	width: number,
	height: number,
	topBoundaryOffset: number,
) {
	const wallOptions: Matter.IChamferableBodyDefinition = {
		friction: 1,
		isStatic: true,
		render: { visible: false },
	};
	const thickness = 96;
	const sideWallHeight = height + topBoundaryOffset + thickness * 2;
	const sideWallY = (height - topBoundaryOffset) / 2;

	return [
		Matter.Bodies.rectangle(
			width / 2,
			height + thickness / 2,
			width + thickness * 2,
			thickness,
			wallOptions,
		),
		Matter.Bodies.rectangle(
			width / 2,
			-topBoundaryOffset - thickness / 2,
			width + thickness * 2,
			thickness,
			wallOptions,
		),
		Matter.Bodies.rectangle(-thickness / 2, sideWallY, thickness, sideWallHeight, wallOptions),
		Matter.Bodies.rectangle(
			width + thickness / 2,
			sideWallY,
			thickness,
			sideWallHeight,
			wallOptions,
		),
	];
}
