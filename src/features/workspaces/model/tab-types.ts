export type WorkspaceTab = {
	id: string;
	title: string;
	viewItemId?: string;
	createdAt: number;
	updatedAt: number;
};

export type WorkspaceTabSession = {
	activeTabId: string;
	tabs: WorkspaceTab[];
};
