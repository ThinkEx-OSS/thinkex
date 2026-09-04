import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { applyWorkspacePageDeltaToCache } from "#/features/workspaces/cache-page";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { workspaceRecordingMaxDurationMs } from "#/features/workspaces/recordings/workspace-recording";
import {
	createRecordingItem,
	finalizeRecording,
	getSupportedRecordingMimeType,
	uploadRecordingSegment,
} from "#/features/workspaces/recordings/workspace-recording-client";
import {
	deleteLocalWorkspaceRecording,
	deleteLocalWorkspaceRecordingSegment,
	listLocalWorkspaceRecordings,
	listLocalWorkspaceRecordingSegments,
	saveLocalWorkspaceRecording,
	saveLocalWorkspaceRecordingSegment,
	type LocalWorkspaceRecording,
} from "#/features/workspaces/recordings/workspace-recording-local-store";

interface WorkspaceRecordingContextValue {
	requestRecording: (parentId: string | null) => void;
	captureItemId: string | null;
	phase: "setup" | "recording" | "finishing";
	elapsedMs: number;
	recovery: LocalWorkspaceRecording | null;
	startRecording: () => void;
	stopRecording: () => void;
	recoverRecording: (mode: "resume" | "finish") => void;
}

const WorkspaceRecordingContext = createContext<WorkspaceRecordingContextValue | null>(null);
const segmentDurationMs = 30_000;

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
	const [captureSession, setCaptureSession] = useState<LocalWorkspaceRecording | null>(null);
	const [phase, setPhase] = useState<"setup" | "recording" | "finishing">("setup");
	const [elapsedMs, setElapsedMs] = useState(0);
	const [recovery, setRecovery] = useState<LocalWorkspaceRecording | null>(null);
	const sessionRef = useRef<LocalWorkspaceRecording | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const stopRequestedRef = useRef(false);
	const segmentStartedAtRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const creatingRef = useRef(false);
	const releaseRecordingLockRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (!capabilities.canMutateContent) return;
		void listLocalWorkspaceRecordings(workspaceId).then((recordings) => {
			setRecovery(recordings[0] ?? null);
		});
	}, [capabilities.canMutateContent, workspaceId]);

	useEffect(() => {
		if (phase !== "recording") return;
		const interval = window.setInterval(() => {
			const session = sessionRef.current;
			if (session)
				setElapsedMs(session.durationMs + (performance.now() - segmentStartedAtRef.current));
		}, 500);
		return () => window.clearInterval(interval);
	}, [phase]);

	const requestRecording = async (parentId: string | null) => {
		const existingItemId = captureSession?.itemId ?? recovery?.itemId;
		if (existingItemId) {
			const existingItem = itemsById.get(existingItemId);
			if (existingItem) {
				onOpenItem(existingItem);
				return;
			}
			if (captureSession) {
				toast.info("A recording is already in progress.");
				return;
			}
		}
		const mimeType = getSupportedRecordingMimeType();
		if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
			toast.error("This browser cannot record microphone audio.");
			return;
		}
		if (creatingRef.current) return;
		creatingRef.current = true;
		try {
			const createdAt = new Date();
			const created = await createRecordingItem({
				workspaceId,
				parentId,
				name: `Recording — ${new Intl.DateTimeFormat(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
					hour: "numeric",
					minute: "2-digit",
				}).format(createdAt)}`,
				mimeType,
			});
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId,
				revision: created.revision,
				items: [created.item],
			});
			const session: LocalWorkspaceRecording = {
				durationMs: 0,
				itemId: created.item.id,
				mimeType,
				segmentCount: 0,
				workspaceId,
			};
			setCaptureSession(session);
			setPhase("setup");
			setElapsedMs(0);
			onOpenItem(created.item);
			await saveLocalWorkspaceRecording(session).catch((error: unknown) => {
				toast.error(
					error instanceof Error ? error.message : "Unable to save recording on this device.",
				);
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Unable to create recording.");
		} finally {
			creatingRef.current = false;
		}
	};

	const startFreshRecording = async () => {
		if (!captureSession) return;
		setPhase("finishing");
		let stream: MediaStream | null = null;
		try {
			if (!(await acquireRecordingLock())) {
				setPhase("setup");
				toast.info("Another recording is already running in this browser.");
				return;
			}
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			await saveLocalWorkspaceRecording(captureSession);
			await beginCapture(captureSession, stream);
		} catch (error) {
			releaseRecordingLock();
			stream?.getTracks().forEach((track) => track.stop());
			setPhase("setup");
			toast.error(error instanceof Error ? error.message : "Unable to start recording.");
		}
	};

	const beginCapture = async (session: LocalWorkspaceRecording, existingStream?: MediaStream) => {
		if (!existingStream && !(await acquireRecordingLock())) {
			throw new Error("Another recording is already running in this browser.");
		}
		const stream = existingStream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
		sessionRef.current = session;
		streamRef.current = stream;
		stopRequestedRef.current = false;
		setCaptureSession(session);
		setElapsedMs(session.durationMs);
		setPhase("recording");
		startSegmentRecorder();
	};

	const startSegmentRecorder = () => {
		const session = sessionRef.current;
		const stream = streamRef.current;
		if (!session || !stream || stopRequestedRef.current) return;
		const recorder = new MediaRecorder(stream, {
			audioBitsPerSecond: 64_000,
			mimeType: session.mimeType,
		});
		const chunks: Blob[] = [];
		recorder.onstart = (event) => {
			segmentStartedAtRef.current = event.timeStamp;
		};
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = (event) => {
			void persistCompletedSegment(chunks, event.timeStamp - segmentStartedAtRef.current);
		};
		recorderRef.current = recorder;
		recorder.start();
		timerRef.current = window.setTimeout(() => recorder.stop(), segmentDurationMs);
	};

	const persistCompletedSegment = async (chunks: Blob[], measuredDurationMs: number) => {
		const session = sessionRef.current;
		if (!session || chunks.length === 0) {
			if (!stopRequestedRef.current) startSegmentRecorder();
			return;
		}
		const durationMs = Math.max(1, Math.min(segmentDurationMs, measuredDurationMs));
		const nextSession: LocalWorkspaceRecording = {
			...session,
			durationMs: session.durationMs + durationMs,
			segmentCount: session.segmentCount + 1,
		};
		const segment = {
			blob: new Blob(chunks, { type: session.mimeType }),
			durationMs,
			itemId: session.itemId,
			mimeType: session.mimeType,
			sequence: session.segmentCount,
			workspaceId: session.workspaceId,
		};
		await saveLocalWorkspaceRecordingSegment(nextSession, segment);
		sessionRef.current = nextSession;
		setCaptureSession(nextSession);
		setElapsedMs(nextSession.durationMs);
		void uploadStoredSegments(nextSession).catch(() => undefined);
		if (stopRequestedRef.current || nextSession.durationMs >= workspaceRecordingMaxDurationMs) {
			stopRequestedRef.current = true;
			await finishSession(nextSession);
		} else {
			startSegmentRecorder();
		}
	};

	const uploadStoredSegments = async (session: LocalWorkspaceRecording) => {
		const segments = await listLocalWorkspaceRecordingSegments(session.itemId);
		for (const segment of segments) {
			await uploadRecordingSegment(segment);
			await deleteLocalWorkspaceRecordingSegment(segment.itemId, segment.sequence);
		}
	};

	const finishSession = async (session: LocalWorkspaceRecording) => {
		setPhase("finishing");
		try {
			await uploadStoredSegments(session);
			await finalizeRecording(session);
			await deleteLocalWorkspaceRecording(session.itemId);
			setRecovery(null);
			await queryClient.invalidateQueries({
				queryKey: ["workspace-recording", workspaceId, session.itemId],
			});
			toast.success("Recording saved. Transcription is processing.");
		} catch (error) {
			setRecovery(session);
			toast.error(error instanceof Error ? error.message : "Recording is saved locally.");
		} finally {
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			recorderRef.current = null;
			sessionRef.current = null;
			setCaptureSession(null);
			releaseRecordingLock();
		}
	};

	const acquireRecordingLock = async () => {
		if (releaseRecordingLockRef.current) return true;
		let release!: () => void;
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		return await new Promise<boolean>((resolve) => {
			void navigator.locks.request(
				"thinkex-microphone-recording",
				{ ifAvailable: true },
				async (lock) => {
					resolve(Boolean(lock));
					if (!lock) return;
					releaseRecordingLockRef.current = release;
					await hold;
				},
			);
		});
	};

	const releaseRecordingLock = () => {
		releaseRecordingLockRef.current?.();
		releaseRecordingLockRef.current = null;
	};

	const stopRecording = () => {
		stopRequestedRef.current = true;
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		const recorder = recorderRef.current;
		if (recorder?.state === "recording") recorder.stop();
	};

	useEffect(() => {
		const stopForPageExit = () => {
			stopRequestedRef.current = true;
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			if (recorderRef.current?.state === "recording") recorderRef.current.stop();
			streamRef.current?.getTracks().forEach((track) => track.stop());
			releaseRecordingLock();
		};
		window.addEventListener("pagehide", stopForPageExit);
		return () => {
			window.removeEventListener("pagehide", stopForPageExit);
			stopForPageExit();
		};
	}, []);

	const recoverRecording = async (mode: "resume" | "finish") => {
		if (!recovery) return;
		setRecovery(null);
		setCaptureSession(recovery);
		setPhase("finishing");
		if (mode === "resume") {
			try {
				await uploadStoredSegments(recovery);
				await beginCapture(recovery);
			} catch (error) {
				setCaptureSession(null);
				setRecovery(recovery);
				toast.error(error instanceof Error ? error.message : "Unable to resume recording.");
			}
			return;
		}
		if (recovery.segmentCount < 1) {
			toast.error("No completed audio segment was recovered.");
			setCaptureSession(null);
			setRecovery(recovery);
			return;
		}
		await finishSession(recovery);
	};

	return (
		<WorkspaceRecordingContext.Provider
			value={{
				requestRecording: (parentId) => void requestRecording(parentId),
				captureItemId: captureSession?.itemId ?? null,
				phase,
				elapsedMs,
				recovery,
				startRecording: () => void startFreshRecording(),
				stopRecording,
				recoverRecording: (mode) => void recoverRecording(mode),
			}}
		>
			{children}
			{captureSession && phase !== "setup" && activeItemId !== captureSession.itemId ? (
				<div className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border bg-background px-3 py-2 shadow-lg">
					<span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
						{phase === "recording" ? (
							<span className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />
						) : null}
						<Mic className="relative size-4" />
					</span>
					<button
						type="button"
						className="min-w-0 text-left"
						onClick={() => {
							const item = itemsById.get(captureSession.itemId);
							if (item) onOpenItem(item);
						}}
					>
						<span className="block truncate font-medium text-sm">
							{itemsById.get(captureSession.itemId)?.name ?? "Recording"}
						</span>
						<span className="block text-muted-foreground text-xs">
							{phase === "recording" ? formatElapsedTime(elapsedMs) : "Finishing…"}
						</span>
					</button>
					<Button
						size="icon-sm"
						variant="destructive"
						disabled={phase !== "recording"}
						aria-label="Stop and transcribe recording"
						onClick={stopRecording}
					>
						<Square className="size-3 fill-current" />
					</Button>
				</div>
			) : null}
		</WorkspaceRecordingContext.Provider>
	);
}

function formatElapsedTime(durationMs: number) {
	const seconds = Math.floor(durationMs / 1_000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useWorkspaceRecording() {
	const context = use(WorkspaceRecordingContext);
	if (!context)
		throw new Error("useWorkspaceRecording must be used within WorkspaceRecordingProvider.");
	return context;
}
