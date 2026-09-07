import {
	CompletedRecordingUpload,
	useCompletedRecordings,
} from "#/features/workspaces/components/CompletedRecordingUpload";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { applyWorkspacePageDeltaToCache } from "#/features/workspaces/cache-page";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { formatRecordingTimestamp } from "#/features/workspaces/recordings/workspace-recording-transcript";
import { captureWorkspaceRecording } from "#/features/workspaces/recordings/workspace-recording-capture";
import {
	createRecordingItem,
	getSupportedRecordingMimeType,
} from "#/features/workspaces/recordings/workspace-recording-client";
import type { LocalWorkspaceRecording } from "#/features/workspaces/recordings/workspace-recording-local-store";

type Target = Pick<LocalWorkspaceRecording, "itemId" | "workspaceId" | "mimeType">;
type Phase = "setup" | "recording" | "paused" | "finishing";
interface WorkspaceRecordingContextValue {
	requestRecording: (parentId: string | null) => void;
	analyser: AnalyserNode | null;
	captureItemId: string | null;
	phase: Phase;
	elapsedMs: number;
	pendingUploads: ReturnType<typeof useCompletedRecordings>["pendingUploads"];
	openCaptureItem: () => void;
	startRecording: (item?: WorkspaceItem, mimeType?: string) => void;
	pauseRecording: () => void;
	resumeRecording: () => void;
	stopRecording: () => void;
	retryUpload: (recording: LocalWorkspaceRecording) => void;
}
const WorkspaceRecordingContext = createContext<WorkspaceRecordingContextValue | null>(null);

/** Own the microphone across item navigation; persist only completed recordings. */
export function WorkspaceRecordingProvider({
	activeItemId,
	children,
	itemsById,
	onOpenItem,
	workspaceId,
}: {
	activeItemId?: string;
	children: ReactNode;
	itemsById: ReadonlyMap<string, WorkspaceItem>;
	onOpenItem: (item: WorkspaceItem) => void;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const { capabilities } = useWorkspaceMutationAccess();
	const [target, setTarget] = useState<Target | null>(null);
	const [phase, setPhase] = useState<Phase>("setup");
	const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const {
		pendingUploads,
		completeRecording: retainCompleted,
		upload,
	} = useCompletedRecordings(workspaceId, capabilities.canMutateContent);
	const captureRef = useRef<ReturnType<typeof captureWorkspaceRecording> | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const busyRef = useRef(false);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = capabilities.canMutateContent;
		if (!capabilities.canMutateContent) return;
		return () => {
			mountedRef.current = false;
			captureRef.current?.finish();
			captureRef.current = null;
			cleanupRef.current?.();
			cleanupRef.current = null;
		};
	}, [workspaceId, capabilities.canMutateContent]);

	useEffect(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (captureRef.current || busyRef.current || pendingUploads.length) event.preventDefault();
		};
		window.addEventListener("beforeunload", beforeUnload);
		return () => window.removeEventListener("beforeunload", beforeUnload);
	}, [pendingUploads]);

	useEffect(() => {
		if (phase !== "recording") return;
		const timer = window.setInterval(() => setElapsedMs(captureRef.current?.elapsedMs() ?? 0), 500);
		return () => window.clearInterval(timer);
	}, [phase]);

	const startRecording = async (item?: WorkspaceItem, mimeType?: string) => {
		const nextTarget = item && mimeType ? { itemId: item.id, workspaceId, mimeType } : target;
		if (
			!capabilities.canMutateContent ||
			!nextTarget ||
			busyRef.current ||
			captureRef.current ||
			pendingUploads.some((pending) => pending.recording.itemId === nextTarget.itemId)
		)
			return;
		busyRef.current = true;
		setTarget(nextTarget);
		setPhase("finishing");
		try {
			await navigator.locks.request(
				"thinkex-microphone-recording",
				{ ifAvailable: true },
				async (lock) => {
					if (!lock) {
						throw new Error("Another tab is already recording.");
					}
					let release = () => {};
					const released = new Promise<void>((resolveRelease) => {
						release = resolveRelease;
					});
					let stream: MediaStream | null = null;
					let audioContext: AudioContext | null = null;
					const cleanup = () => {
						stream?.getTracks().forEach((track) => track.stop());
						void audioContext?.close().catch(() => undefined);
						release();
					};
					try {
						stream = await navigator.mediaDevices.getUserMedia({ audio: true });
						if (!mountedRef.current) {
							cleanup();
							return;
						}
						audioContext = new AudioContext();
						const nextAnalyser = audioContext.createAnalyser();
						nextAnalyser.fftSize = 256;
						audioContext.createMediaStreamSource(stream).connect(nextAnalyser);
						const recorder = new MediaRecorder(stream, {
							mimeType: nextTarget.mimeType,
							audioBitsPerSecond: 64_000,
						});
						cleanupRef.current = cleanup;
						captureRef.current = captureWorkspaceRecording(recorder, (audio) => {
							captureRef.current = null;
							cleanup();
							cleanupRef.current = null;
							setAnalyser(null);
							if (!audio.blob.size) {
								setPhase("setup");
								toast.error("No audio was recorded. Try again.");
								return;
							}
							setTarget(null);
							setPhase("setup");
							void retainCompleted({ ...nextTarget, ...audio, uploadId: crypto.randomUUID() });
						});
						recorder.addEventListener("error", () =>
							toast.error("Recording was interrupted. Saving the captured audio."),
						);
						setAnalyser(nextAnalyser);
						setElapsedMs(0);
						setPhase("recording");
						busyRef.current = false;
						await released;
					} catch (error) {
						cleanup();
						throw error;
					}
				},
			);
		} catch (error) {
			setPhase("setup");
			toast.error(error instanceof Error ? error.message : "Couldn’t start recording.");
		} finally {
			busyRef.current = false;
		}
	};

	const requestRecording = async (parentId: string | null) => {
		const existingId = target?.itemId;
		if (existingId) {
			const item = itemsById.get(existingId);
			if (item) {
				onOpenItem(item);
				return;
			}
			captureRef.current?.finish();
			if (captureRef.current) return;
			setTarget(null);
		}
		if (busyRef.current) return;
		const mimeType = getSupportedRecordingMimeType();
		if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
			toast.error("Recording isn’t supported here.");
			return;
		}
		busyRef.current = true;
		try {
			const created = await createRecordingItem({
				workspaceId,
				parentId,
				mimeType,
				name: `${new Date().toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replaceAll(":", ".")} Recording`,
			});
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId,
				revision: created.revision,
				items: [created.item],
			});
			setTarget({ itemId: created.item.id, workspaceId, mimeType });
			setPhase("setup");
			setElapsedMs(0);
			onOpenItem(created.item);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn’t create recording.");
		} finally {
			busyRef.current = false;
		}
	};

	return (
		<WorkspaceRecordingContext.Provider
			value={{
				requestRecording: (parentId) => void requestRecording(parentId),
				analyser,
				captureItemId: target?.itemId ?? null,
				phase,
				elapsedMs,
				pendingUploads,
				openCaptureItem: () => {
					const item = target ? itemsById.get(target.itemId) : null;
					if (item) onOpenItem(item);
				},
				startRecording: (item, mimeType) => void startRecording(item, mimeType),
				pauseRecording: () => {
					captureRef.current?.pause();
					setElapsedMs(captureRef.current?.elapsedMs() ?? 0);
					setPhase("paused");
				},
				resumeRecording: () => {
					captureRef.current?.resume();
					setPhase("recording");
				},
				stopRecording: () => {
					setPhase("finishing");
					captureRef.current?.finish();
				},
				retryUpload: (recording) => void upload(recording),
			}}
		>
			{children}
			<div className="fixed bottom-4 right-4 z-50 max-h-96 max-w-sm overflow-auto space-y-2">
				{pendingUploads
					.filter(({ recording }) => !itemsById.has(recording.itemId))
					.map(({ recording, status }) => (
						<div key={recording.itemId} className="rounded-lg border bg-background shadow-lg">
							<CompletedRecordingUpload
								blob={recording.blob}
								name="Recovered recording"
								busy={status !== "failed"}
								onRetry={() => void upload(recording)}
							/>
						</div>
					))}
			</div>
			{target && phase !== "setup" && activeItemId !== target.itemId ? (
				<button
					type="button"
					className="fixed right-4 bottom-4 z-50 rounded-full border bg-background px-4 py-3 text-sm shadow-lg sm:hidden"
					onClick={() => {
						const item = itemsById.get(target.itemId);
						if (item) onOpenItem(item);
					}}
				>
					{phase === "recording"
						? formatRecordingTimestamp(elapsedMs)
						: phase === "paused"
							? "Paused"
							: "Saving…"}{" "}
					· Open recording
				</button>
			) : null}
		</WorkspaceRecordingContext.Provider>
	);
}

/** Access the workspace's active recording controls. */
export function useWorkspaceRecording() {
	const context = use(WorkspaceRecordingContext);
	if (!context)
		throw new Error("useWorkspaceRecording must be used within WorkspaceRecordingProvider.");
	return context;
}
