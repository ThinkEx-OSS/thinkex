"use client";

import { Button } from "@/components/ui/button";
import { Upload, Folder, FileText, Play, Globe, Brain } from "lucide-react";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeFill } from "react-icons/pi";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAssistantApi } from "@assistant-ui/react";
import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import type { PdfData } from "@/lib/workspace-state/types";
import { CreateYouTubeDialog } from "@/components/modals/CreateYouTubeDialog";

interface SidebarQuickActionsProps {
    currentWorkspaceId: string;
    isChatExpanded?: boolean;
    setIsChatExpanded?: (expanded: boolean) => void;
}

export function SidebarQuickActions({ currentWorkspaceId, isChatExpanded, setIsChatExpanded }: SidebarQuickActionsProps) {
    // Get assistant API
    const api = useAssistantApi();
    // Get workspace state and operations
    const { state: workspaceState } = useWorkspaceState(currentWorkspaceId);
    const operations = useWorkspaceOperations(currentWorkspaceId, workspaceState);

    // UI Store actions
    const setOpenModalItemId = useUIStore((state) => state.setOpenModalItemId);
    const setSelectedActions = useUIStore((state) => state.setSelectedActions);

    // File input ref for PDF upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);

    // Handlers
    const handleNoteClick = useCallback(() => {
        const itemId = operations.createItem("note");
        // Automatically open the modal for the newly created note
        if (itemId) {
            toast.success("New note created");
            setOpenModalItemId(itemId);
        }
    }, [operations, setOpenModalItemId]);

    const handleFlashcardClick = useCallback(() => {
        const itemId = operations.createItem("flashcard");
        if (itemId) {
            toast.success("New flashcard created");
        }
    }, [operations]);

    const handleYouTubeCreate = useCallback((url: string, name: string) => {
        operations.createItem("youtube", name, { url });
        toast.success("YouTube video added");
    }, [operations]);

    const handleFolderClick = useCallback(() => {
        // Create folder directly in workspace (like notes)
        const folderId = operations.createItem("folder");
        if (folderId) {
            toast.success("New folder created");
        }
        // Folder will auto-focus its title (handled in FolderCard)
    }, [operations]);

    const handlePDFSelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleDeepResearchClick = useCallback(() => {
        toast.success("Deep Research action selected");

        // Open chat if closed
        if (setIsChatExpanded && !isChatExpanded) {
            setIsChatExpanded(true);
        }

        // Set action state
        setSelectedActions(['deep-research']);


    }, [api, isChatExpanded, setIsChatExpanded, setSelectedActions]);

    const handleQuizClick = useCallback(() => {
        toast.info("Quizzes coming soon!");
    }, []);

    // PDF Upload Logic (Adapted from WorkspaceSection/BottomActionBar)
    const handlePDFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        // Filter for PDF files only
        const pdfFiles = files.filter(file =>
            file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        );

        if (pdfFiles.length === 0) {
            toast.error('Please select PDF files only');
            return;
        }

        if (pdfFiles.length !== files.length) {
            toast.error('Some files were skipped - only PDF files are supported');
        }

        // Check individual file size limit (10MB per file)
        const maxIndividualSize = 10 * 1024 * 1024; // 10MB
        const oversizedFiles = pdfFiles.filter(file => file.size > maxIndividualSize);
        if (oversizedFiles.length > 0) {
            toast.error(`${oversizedFiles.length} file(s) exceed the 10MB individual limit`);
            return;
        }

        // Check combined size limit (100MB total)
        const totalSize = pdfFiles.reduce((sum, file) => sum + file.size, 0);
        const maxCombinedSize = 100 * 1024 * 1024; // 100MB
        if (totalSize > maxCombinedSize) {
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
            toast.error(`Total file size (${totalSizeMB}MB) exceeds the 100MB combined limit`);
            return;
        }

        setIsUploading(true);
        const loadingToastId = toast.loading(`Uploading ${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''}...`);

        try {
            // Upload all files in parallel
            const uploadPromises = pdfFiles.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/upload-file', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    console.error(`Failed to upload ${file.name}`);
                    return null;
                }

                const data = await response.json();
                return {
                    fileUrl: data.url,
                    filename: data.filename || file.name,
                    fileSize: file.size,
                    name: file.name.replace(/\.pdf$/i, ''),
                };
            });

            const uploadResults = await Promise.all(uploadPromises);
            const validResults = uploadResults.filter((result): result is NonNullable<typeof result> => result !== null);

            if (validResults.length > 0) {
                const pdfCardDefinitions = validResults.map((result) => {
                    const pdfData: Partial<PdfData> = {
                        fileUrl: result.fileUrl,
                        filename: result.filename,
                        fileSize: result.fileSize,
                    };

                    return {
                        type: 'pdf' as const,
                        name: result.name,
                        initialData: pdfData,
                    };
                });

                operations.createItems(pdfCardDefinitions);
                toast.success(`${validResults.length} PDF${validResults.length > 1 ? 's' : ''} uploaded`);
            } else {
                toast.error("Failed to upload files");
            }

        } catch (error) {
            console.error("Error uploading PDFs:", error);
            toast.error("An error occurred during upload");
        } finally {
            setIsUploading(false);
            toast.dismiss(loadingToastId);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };


    return (
        <>
            <div className="px-1 pb-3 group-data-[collapsible=icon]:hidden">
                <div className="grid grid-cols-3 gap-2">
                    <Button
                        variant="outline"
                        onClick={handleNoteClick}
                        className="h-14 flex flex-col gap-0.5 justify-center items-center bg-blue-600 hover:bg-blue-500 border-blue-500 hover:border-blue-400 shadow-sm hover:shadow transition-all duration-200 group/btn rounded-md border-0"
                    >
                        <FileText className="size-3.5 mb-0.5 text-white group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white">Note</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleFolderClick}
                        className="h-14 flex flex-col gap-0.5 justify-center items-center bg-amber-600 hover:bg-amber-500 border-amber-500 hover:border-amber-400 shadow-sm hover:shadow transition-all duration-200 group/btn rounded-md border-0"
                    >
                        <Folder className="size-3.5 mb-0.5 text-white group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white">Folder</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handlePDFSelect}
                        disabled={isUploading}
                        className="h-14 flex flex-col gap-0.5 justify-center items-center bg-rose-600 hover:bg-rose-500 border-rose-500 hover:border-rose-400 shadow-sm hover:shadow transition-all duration-200 group/btn rounded-md border-0"
                    >
                        <Upload className="size-3.5 mb-0.5 text-white group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white">
                            {isUploading ? "..." : "PDF"}
                        </span>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-14 flex flex-col gap-0.5 justify-center items-center bg-emerald-600 hover:bg-emerald-500 border-emerald-500 hover:border-emerald-400 shadow-sm hover:shadow transition-all duration-200 group/btn rounded-md border-0"
                            >
                                <LuBook className="size-3.5 mb-0.5 text-white group-hover/btn:scale-110 transition-transform duration-200" />
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-white">Learn</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={handleFlashcardClick} className="cursor-pointer">
                                <PiCardsThreeFill className="mr-2 h-4 w-4" />
                                <span>Flashcards</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleQuizClick} className="cursor-pointer">
                                <Brain className="mr-2 h-4 w-4" />
                                <span>Quiz</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="outline"
                        onClick={() => setShowYouTubeDialog(true)}
                        className="h-14 flex flex-col gap-0.5 justify-center items-center bg-red-600 hover:bg-red-500 border-red-500 hover:border-red-400 shadow-sm hover:shadow transition-all duration-200 group/btn rounded-md border-0"
                    >
                        <Play className="size-3.5 mb-0.5 text-white group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white">Youtube</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleDeepResearchClick}
                        className="h-14 flex flex-col gap-0.5 justify-center items-center bg-violet-600 hover:bg-violet-500 border-violet-500 hover:border-violet-400 shadow-sm hover:shadow transition-all duration-200 group/btn rounded-md border-0"
                    >
                        <Globe className="size-3.5 mb-0.5 text-white group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white">Research</span>
                    </Button>
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    onChange={handlePDFUpload}
                    className="hidden"
                />
            </div>

            {/* YouTube Dialog */}
            <CreateYouTubeDialog
                open={showYouTubeDialog}
                onOpenChange={setShowYouTubeDialog}
                onCreate={handleYouTubeCreate}
            />
        </>
    );
}
