import {
	Activity,
	Archive,
	Atom,
	AudioLines,
	Banknote,
	Binary,
	BookMarked,
	BookOpen,
	BookOpenText,
	BookSearch,
	Bot,
	Brain,
	BrainCircuit,
	BriefcaseBusiness,
	Building2,
	Calculator,
	CalendarDays,
	Camera,
	ChartColumn,
	ChartGantt,
	ChartLine,
	ChartPie,
	ChartScatter,
	CircuitBoard,
	ClipboardList,
	Clock3,
	CloudSun,
	Code2,
	Compass,
	Cpu,
	Database,
	Dna,
	DraftingCompass,
	Droplet,
	Earth,
	Factory,
	FileChartColumn,
	FileText,
	Flame,
	FlaskConical,
	FolderOpen,
	FolderSearch,
	Gavel,
	Globe2,
	GraduationCap,
	HandCoins,
	Handshake,
	Headphones,
	HeartPulse,
	HelpingHand,
	Highlighter,
	Hospital,
	Kanban,
	Landmark,
	Languages,
	Leaf,
	LibraryBig,
	Lightbulb,
	ListTodo,
	type LucideIcon,
	Magnet,
	Map as MapIcon,
	Megaphone,
	MessageSquareText,
	Mic,
	Microscope,
	Mountain,
	Music,
	Newspaper,
	NotebookPen,
	NotebookTabs,
	Orbit,
	Package,
	Palette,
	PencilRuler,
	PenTool,
	PiggyBank,
	Pill,
	PillBottle,
	Presentation,
	ReceiptText,
	Rocket,
	Ruler,
	Satellite,
	Scale,
	School,
	ScrollText,
	SearchCheck,
	ShieldCheck,
	Sigma,
	Sprout,
	Stethoscope,
	Store,
	SwatchBook,
	Target,
	Telescope,
	TestTubeDiagonal,
	Theater,
	Thermometer,
	Truck,
	Users,
	Video,
	Vote,
	WalletCards,
	Waves,
	Wrench,
	Zap,
} from "lucide-react";

import type { WorkspaceIcon } from "#/features/workspaces/contracts";
import { workspaceIconValues } from "#/features/workspaces/contracts";

export interface WorkspaceIconOption {
	value: WorkspaceIcon;
	label: string;
	Icon: LucideIcon;
	category: WorkspaceIconCategory;
	aliases: readonly string[];
}

type WorkspaceIconCategory =
	| "study"
	| "science"
	| "technology"
	| "health"
	| "humanities"
	| "work"
	| "planning"
	| "environment";

const iconSearchSeparator = /[^a-z0-9]+/g;

export const workspaceIconOptions = [
	icon("book-marked", "Bookmark Book", BookMarked, "study", [
		"study",
		"reading",
		"bookmark",
		"course",
		"class",
		"homework",
	]),
	icon("book-open", "Reading", BookOpen, "study", ["book", "textbook", "literature", "notes"]),
	icon("book-open-text", "Open Textbook", BookOpenText, "study", [
		"textbook",
		"course reading",
		"chapter",
		"manual",
		"reference",
	]),
	icon("book-search", "Search Book", BookSearch, "study", [
		"research",
		"literature review",
		"sources",
		"search",
		"bibliography",
	]),
	icon("graduation-cap", "Education", GraduationCap, "study", [
		"school",
		"college",
		"university",
		"degree",
		"academic",
	]),
	icon("library-big", "Library", LibraryBig, "study", ["archive", "research", "books", "sources"]),
	icon("school", "School", School, "study", ["campus", "classroom", "teacher", "student"]),
	icon("notebook-pen", "Notes", NotebookPen, "study", ["writing", "journal", "draft", "worksheet"]),
	icon("notebook-tabs", "Notebook", NotebookTabs, "study", [
		"binder",
		"sections",
		"class notes",
		"tabs",
	]),
	icon("highlighter", "Highlights", Highlighter, "study", [
		"annotation",
		"markup",
		"review",
		"important",
	]),
	icon("file-text", "Paper", FileText, "study", ["essay", "document", "report", "article"]),
	icon("file-chart-column", "Chart Document", FileChartColumn, "study", [
		"findings",
		"data report",
		"results",
		"analysis",
		"study",
	]),
	icon("folder-open", "Folder", FolderOpen, "planning", [
		"project",
		"folder",
		"case",
		"collection",
		"workspace",
	]),
	icon("folder-search", "Search Folder", FolderSearch, "planning", [
		"discovery",
		"find files",
		"explore",
		"research folder",
		"investigation",
	]),
	icon("archive", "Archive", Archive, "study", ["records", "library", "stored work", "repository"]),
	icon("clipboard-list", "Tasks", ClipboardList, "planning", [
		"todo",
		"checklist",
		"assignment",
		"operations",
	]),
	icon("kanban", "Board", Kanban, "planning", ["workflow", "sprint", "pipeline", "status"]),
	icon("list-todo", "Todo", ListTodo, "planning", [
		"tasks",
		"checklist",
		"action items",
		"next steps",
	]),
	icon("presentation", "Presentation", Presentation, "planning", [
		"slides",
		"lecture",
		"talk",
		"deck",
	]),
	icon("calendar-days", "Schedule", CalendarDays, "planning", [
		"calendar",
		"deadline",
		"dates",
		"timeline",
	]),
	icon("clock-3", "Time", Clock3, "planning", ["history", "deadline", "duration", "timeline"]),
	icon("target", "Goal", Target, "planning", ["objective", "milestone", "focus", "outcome"]),
	icon("lightbulb", "Idea", Lightbulb, "planning", [
		"insight",
		"concept",
		"innovation",
		"brainstorm",
	]),
	icon("brain", "Brain", Brain, "science", [
		"cognition",
		"psychology",
		"neuroscience",
		"mind",
		"learning",
	]),
	icon("brain-circuit", "Brain Circuit", BrainCircuit, "science", [
		"neuroscience",
		"cognition",
		"neural network",
		"brain",
		"psychology",
	]),
	icon("compass", "Compass", Compass, "planning", [
		"explore",
		"navigation",
		"direction",
		"strategy",
		"discovery",
	]),
	icon("map", "Map", MapIcon, "humanities", ["geography", "planning", "location", "route"]),
	icon("globe-2", "Globe", Globe2, "humanities", [
		"global",
		"world",
		"international",
		"geography",
		"culture",
	]),
	icon("languages", "Languages", Languages, "humanities", [
		"translation",
		"linguistics",
		"foreign language",
		"communication",
	]),
	icon("scroll-text", "History", ScrollText, "humanities", [
		"law",
		"records",
		"primary source",
		"archive",
	]),
	icon("newspaper", "Journalism", Newspaper, "humanities", [
		"news",
		"media",
		"current events",
		"article",
	]),
	icon("palette", "Art", Palette, "humanities", ["design", "visual arts", "creative", "studio"]),
	icon("swatch-book", "Swatch Book", SwatchBook, "humanities", [
		"design system",
		"brand",
		"colors",
		"style guide",
		"visual design",
	]),
	icon("pen-tool", "Writing", PenTool, "humanities", [
		"composition",
		"drafting",
		"creative writing",
		"author",
	]),
	icon("pencil-ruler", "Drafting", PencilRuler, "humanities", [
		"design",
		"architecture",
		"layout",
		"technical drawing",
	]),
	icon("music", "Music", Music, "humanities", ["audio", "composition", "performance", "sound"]),
	icon("audio-lines", "Audio", AudioLines, "humanities", [
		"sound",
		"waveform",
		"recording",
		"speech",
	]),
	icon("mic", "Microphone", Mic, "humanities", [
		"interview",
		"podcast",
		"voice",
		"oral history",
		"recording",
	]),
	icon("headphones", "Headphones", Headphones, "humanities", [
		"listening",
		"audio",
		"language lab",
		"music",
		"study session",
	]),
	icon("camera", "Photography", Camera, "humanities", [
		"image",
		"visual media",
		"photo",
		"field work",
	]),
	icon("video", "Video", Video, "humanities", [
		"film",
		"lecture recording",
		"media",
		"presentation",
	]),
	icon("theater", "Theater", Theater, "humanities", ["drama", "performance", "acting", "arts"]),
	icon("scale", "Law", Scale, "humanities", ["justice", "policy", "ethics", "government"]),
	icon("gavel", "Legal", Gavel, "humanities", ["law", "court", "judge", "regulation"]),
	icon("vote", "Politics", Vote, "humanities", ["election", "civics", "government", "policy"]),
	icon("landmark", "Institutions", Landmark, "humanities", [
		"government",
		"economics",
		"history",
		"museum",
	]),
	icon("message-square-text", "Communication", MessageSquareText, "humanities", [
		"discussion",
		"rhetoric",
		"conversation",
		"feedback",
	]),
	icon("users", "Users", Users, "work", ["people", "team", "group", "customers", "class"]),
	icon("helping-hand", "Helping Hand", HelpingHand, "work", [
		"support",
		"help",
		"service",
		"community",
		"care",
	]),
	icon("handshake", "Handshake", Handshake, "work", [
		"partnership",
		"agreement",
		"client",
		"sales",
		"collaboration",
	]),
	icon("hand-coins", "Hand Coins", HandCoins, "work", [
		"funding",
		"grant",
		"fundraising",
		"investment",
		"donation",
	]),
	icon("briefcase-business", "Business", BriefcaseBusiness, "work", [
		"work",
		"career",
		"consulting",
		"company",
	]),
	icon("building-2", "Building", Building2, "work", [
		"organization",
		"office",
		"company",
		"institution",
		"operations",
	]),
	icon("chart-column", "Bar Chart", ChartColumn, "work", [
		"metrics",
		"analytics",
		"statistics",
		"dashboard",
		"growth",
	]),
	icon("chart-line", "Line Chart", ChartLine, "work", [
		"trends",
		"forecast",
		"time series",
		"performance",
		"growth",
	]),
	icon("chart-scatter", "Scatter Chart", ChartScatter, "work", [
		"statistics",
		"scatterplot",
		"correlation",
		"regression",
		"data science",
	]),
	icon("chart-gantt", "Gantt Chart", ChartGantt, "work", [
		"timeline",
		"gantt",
		"roadmap",
		"project plan",
		"schedule",
	]),
	icon("chart-pie", "Pie Chart", ChartPie, "work", [
		"finance",
		"budget",
		"accounting",
		"portfolio",
		"market",
	]),
	icon("banknote", "Banknote", Banknote, "work", ["revenue", "cash", "money", "income", "sales"]),
	icon("piggy-bank", "Savings", PiggyBank, "work", ["budget", "reserve", "finance", "planning"]),
	icon("receipt-text", "Expenses", ReceiptText, "work", [
		"receipt",
		"invoice",
		"billing",
		"procurement",
	]),
	icon("megaphone", "Marketing", Megaphone, "work", [
		"communications",
		"announcement",
		"campaign",
		"outreach",
	]),
	icon("wallet-cards", "Wallet", WalletCards, "work", [
		"money",
		"payments",
		"billing",
		"expenses",
		"finance",
	]),
	icon("store", "Sales", Store, "work", ["retail", "commerce", "shop", "market"]),
	icon("factory", "Manufacturing", Factory, "work", [
		"production",
		"operations",
		"industry",
		"supply chain",
	]),
	icon("truck", "Logistics", Truck, "work", [
		"shipping",
		"delivery",
		"transportation",
		"supply chain",
	]),
	icon("package", "Inventory", Package, "work", ["product", "stock", "warehouse", "fulfillment"]),
	icon("shield-check", "Compliance", ShieldCheck, "work", [
		"security",
		"risk",
		"audit",
		"approved",
	]),
	icon("search-check", "Search Check", SearchCheck, "work", [
		"audit",
		"review",
		"quality assurance",
		"inspection",
		"verification",
	]),
	icon("atom", "Physics", Atom, "science", ["science", "quantum", "chemistry", "particle"]),
	icon("orbit", "Orbit", Orbit, "science", ["astronomy", "space", "physics", "planetary science"]),
	icon("magnet", "Magnetism", Magnet, "science", ["physics", "electromagnetism", "field", "force"]),
	icon("flask-conical", "Flask", FlaskConical, "science", [
		"lab",
		"chemistry",
		"experiment",
		"science",
		"research",
	]),
	icon("test-tube-diagonal", "Experiment", TestTubeDiagonal, "science", [
		"lab",
		"chemistry",
		"biology",
		"assay",
	]),
	icon("microscope", "Microscope", Microscope, "science", ["biology", "research", "cells", "lab"]),
	icon("activity", "Activity", Activity, "health", [
		"physiology",
		"signal",
		"biomedical",
		"vitals",
		"measurement",
	]),
	icon("dna", "Genetics", Dna, "science", ["biology", "genome", "medicine", "life science"]),
	icon("sigma", "Math", Sigma, "science", ["statistics", "equation", "algebra", "formula"]),
	icon("calculator", "Calculator", Calculator, "science", [
		"math",
		"accounting",
		"numbers",
		"finance",
	]),
	icon("ruler", "Ruler", Ruler, "science", [
		"measure",
		"geometry",
		"design",
		"measurement",
		"engineering",
	]),
	icon("drafting-compass", "Drafting Compass", DraftingCompass, "science", [
		"engineering",
		"architecture",
		"design",
		"technical drawing",
		"cad",
	]),
	icon("cpu", "CPU", Cpu, "technology", [
		"computing",
		"computer science",
		"hardware",
		"systems",
		"processor",
	]),
	icon("circuit-board", "Electronics", CircuitBoard, "technology", [
		"engineering",
		"hardware",
		"robotics",
		"circuits",
	]),
	icon("binary", "Data", Binary, "technology", [
		"computer science",
		"programming",
		"bits",
		"information",
	]),
	icon("database", "Database", Database, "technology", ["data", "storage", "sql", "warehouse"]),
	icon("bot", "Robot", Bot, "technology", [
		"ai",
		"artificial intelligence",
		"machine learning",
		"automation",
		"agent",
	]),
	icon("code-2", "Code", Code2, "technology", ["programming", "software", "developer", "web"]),
	icon("wrench", "Wrench", Wrench, "technology", [
		"build",
		"tools",
		"maintenance",
		"operations",
		"repair",
	]),
	icon("stethoscope", "Medicine", Stethoscope, "health", [
		"healthcare",
		"doctor",
		"clinical",
		"patient",
	]),
	icon("hospital", "Hospital", Hospital, "health", [
		"clinic",
		"healthcare",
		"medical center",
		"patient care",
	]),
	icon("heart-pulse", "Health", HeartPulse, "health", [
		"medicine",
		"wellness",
		"vitals",
		"nursing",
	]),
	icon("pill", "Pharmacy", Pill, "health", ["medicine", "drug", "treatment", "pharmaceutical"]),
	icon("pill-bottle", "Medication", PillBottle, "health", [
		"prescription",
		"pharmacy",
		"drug",
		"treatment",
	]),
	icon("leaf", "Ecology", Leaf, "environment", [
		"environment",
		"nature",
		"sustainability",
		"biology",
	]),
	icon("sprout", "Agriculture", Sprout, "environment", ["plant", "farming", "growth", "botany"]),
	icon("earth", "Earth", Earth, "environment", ["planet", "climate", "geology", "environment"]),
	icon("waves", "Ocean", Waves, "environment", ["marine science", "water", "hydrology", "coast"]),
	icon("droplet", "Water", Droplet, "environment", [
		"chemistry",
		"fluid",
		"climate",
		"environment",
	]),
	icon("thermometer", "Temperature", Thermometer, "environment", [
		"climate",
		"weather",
		"heat",
		"measurement",
	]),
	icon("flame", "Fire", Flame, "environment", ["energy", "heat", "combustion", "wildfire"]),
	icon("mountain", "Geology", Mountain, "environment", [
		"earth science",
		"terrain",
		"field work",
		"landscape",
	]),
	icon("cloud-sun", "Weather", CloudSun, "environment", [
		"meteorology",
		"climate",
		"forecast",
		"atmosphere",
	]),
	icon("telescope", "Astronomy", Telescope, "science", [
		"space",
		"stars",
		"physics",
		"observatory",
	]),
	icon("rocket", "Aerospace", Rocket, "science", ["space", "engineering", "launch", "mission"]),
	icon("satellite", "Satellite", Satellite, "science", [
		"space",
		"remote sensing",
		"communications",
		"orbit",
	]),
	icon("zap", "Energy", Zap, "science", ["electricity", "power", "physics", "fast"]),
] as const satisfies ReadonlyArray<WorkspaceIconOption>;

export const workspaceIcons: Record<WorkspaceIcon, LucideIcon> = Object.fromEntries(
	workspaceIconOptions.map(({ value, Icon }) => [value, Icon]),
) as Record<WorkspaceIcon, LucideIcon>;

assertWorkspaceIconRegistryIsComplete();

export function filterWorkspaceIconOptions(query: string) {
	const tokens = normalizeIconSearch(query);

	if (tokens.length === 0) {
		return workspaceIconOptions;
	}

	return workspaceIconOptions
		.map((option, index) => ({
			option,
			index,
			score: getWorkspaceIconSearchScore(option, tokens),
		}))
		.filter((result) => result.score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map(({ option }) => option);
}

function icon(
	value: WorkspaceIcon,
	label: string,
	Icon: LucideIcon,
	category: WorkspaceIconCategory,
	aliases: readonly string[],
): WorkspaceIconOption {
	return { value, label, Icon, category, aliases };
}

function getWorkspaceIconSearchScore(option: WorkspaceIconOption, tokens: readonly string[]) {
	const terms = getWorkspaceIconSearchTerms(option);
	let score = 0;

	for (const token of tokens) {
		const tokenScore = Math.max(...terms.map((term) => getSearchTermScore(term, token)));

		if (tokenScore === 0) {
			return 0;
		}

		score += tokenScore;
	}

	return score;
}

function getWorkspaceIconSearchTerms(option: WorkspaceIconOption) {
	return [option.label, option.value, option.category, ...option.aliases].map(
		normalizeIconSearchTerm,
	);
}

function getSearchTermScore(term: string, token: string) {
	if (term === token) {
		return 12;
	}

	if (term.startsWith(token)) {
		return 8;
	}

	if (term.includes(token)) {
		return 4;
	}

	return 0;
}

function normalizeIconSearch(query: string) {
	return normalizeIconSearchTerm(query).split(" ").filter(Boolean);
}

function normalizeIconSearchTerm(value: string) {
	return value.toLowerCase().replace(iconSearchSeparator, " ").trim();
}

function assertWorkspaceIconRegistryIsComplete() {
	const optionValues = new Set(workspaceIconOptions.map((option) => option.value));
	const missingValues = workspaceIconValues.filter((value) => !optionValues.has(value));

	if (missingValues.length > 0) {
		throw new Error(`Missing workspace icon options: ${missingValues.join(", ")}`);
	}
}
