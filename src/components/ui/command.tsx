import { CheckIcon, SearchIcon } from "lucide-react";
import * as React from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { InputGroup, InputGroupAddon } from "#/components/ui/input-group.tsx";
import { cn } from "#/lib/utils.ts";

type CommandContextValue = {
	registerItem: (id: string, visible: boolean) => void;
	search: string;
	setSearch: (value: string) => void;
	unregisterItem: (id: string) => void;
	visibleCount: number;
};

const CommandContext = React.createContext<CommandContextValue | null>(null);

function useCommandContext() {
	const context = React.useContext(CommandContext);
	if (!context) {
		throw new Error("Command components must be used within Command");
	}
	return context;
}

function Command({ className, children, ...props }: React.ComponentProps<"div">) {
	const [search, setSearch] = React.useState("");
	const [items, setItems] = React.useState(() => new Map<string, boolean>());

	const registerItem = (id: string, visible: boolean) => {
		setItems((current) => {
			if (current.get(id) === visible) {
				return current;
			}

			const next = new Map(current);
			next.set(id, visible);
			return next;
		});
	};

	const unregisterItem = (id: string) => {
		setItems((current) => {
			if (!current.has(id)) {
				return current;
			}

			const next = new Map(current);
			next.delete(id);
			return next;
		});
	};

	return (
		<CommandContext.Provider
			value={{
				registerItem,
				search,
				setSearch,
				unregisterItem,
				visibleCount: Array.from(items.values()).filter(Boolean).length,
			}}
		>
			<div
				data-slot="command"
				className={cn(
					"flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</CommandContext.Provider>
	);
}

function CommandDialog({
	title = "Command Palette",
	description = "Search for a command to run...",
	children,
	className,
	showCloseButton = false,
	...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
	title?: string;
	description?: string;
	className?: string;
	showCloseButton?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Dialog {...props}>
			<DialogHeader className="sr-only">
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<DialogContent
				className={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0", className)}
				showCloseButton={showCloseButton}
			>
				{children}
			</DialogContent>
		</Dialog>
	);
}

function CommandInput({ className, onChange, value, ...props }: React.ComponentProps<"input">) {
	const { search, setSearch } = useCommandContext();
	const resolvedValue = value ?? search;

	return (
		<div data-slot="command-input-wrapper" className="p-1 pb-0">
			<InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
				<input
					data-slot="command-input"
					className={cn(
						"w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
					onChange={(event) => {
						setSearch(event.currentTarget.value);
						onChange?.(event);
					}}
					value={resolvedValue}
					{...props}
				/>
				<InputGroupAddon>
					<SearchIcon className="size-4 shrink-0 opacity-50" />
				</InputGroupAddon>
			</InputGroup>
		</div>
	);
}

function CommandList({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="command-list"
			className={cn(
				"no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
				className,
			)}
			{...props}
		/>
	);
}

function CommandEmpty({ className, ...props }: React.ComponentProps<"div">) {
	const { search, visibleCount } = useCommandContext();

	if (!search || visibleCount > 0) {
		return null;
	}

	return (
		<div
			data-slot="command-empty"
			className={cn("py-6 text-center text-sm", className)}
			{...props}
		/>
	);
}

function CommandGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="command-group"
			className={cn("overflow-hidden p-1 text-foreground", className)}
			{...props}
		/>
	);
}

function CommandSeparator({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="command-separator"
			className={cn("-mx-1 h-px w-auto bg-border", className)}
			{...props}
		/>
	);
}

function CommandItem({
	className,
	children,
	onClick,
	onKeyDown,
	onSelect,
	value,
	...props
}: Omit<React.ComponentProps<"div">, "onSelect"> & {
	onSelect?: (value: string) => void;
	value?: string;
}) {
	const id = React.useId();
	const { registerItem, search, unregisterItem } = useCommandContext();
	const itemValue = value ?? (typeof children === "string" ? children : "");
	const visible = !search || itemValue.toLowerCase().includes(search.trim().toLowerCase());

	React.useEffect(() => {
		registerItem(id, visible);
		return () => unregisterItem(id);
	}, [id, registerItem, unregisterItem, visible]);

	if (!visible) {
		return null;
	}

	const selectItem = () => {
		onSelect?.(itemValue);
	};

	return (
		<div
			data-slot="command-item"
			className={cn(
				"group/command-item relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-checked:bg-muted data-checked:text-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground data-selected:bg-accent data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-checked:**:[svg]:text-foreground data-selected:**:[svg]:text-foreground",
				className,
			)}
			onClick={(event) => {
				selectItem();
				onClick?.(event);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					selectItem();
				}
				onKeyDown?.(event);
			}}
			aria-selected={false}
			role="option"
			tabIndex={0}
			{...props}
		>
			{children}
			<CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
		</div>
	);
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="command-shortcut"
			className={cn(
				"ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
};
