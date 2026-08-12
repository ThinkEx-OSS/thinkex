/**
 * Workspace themes.
 *
 * The theme is the user-facing choice; its icon is a property of the theme, so
 * one icon may back several themes. Art is imported through Vite so the files
 * are content-hashed into /assets/ and inherit the immutable cache rule that
 * public/_headers already sets for that path.
 */

import {
	type WorkspaceColor,
	type WorkspaceIcon,
	type WorkspaceTheme as WorkspaceThemeValue,
	workspaceThemeValues,
} from "#/features/workspaces/contracts";
import {
	DEFAULT_WORKSPACE_COLOR,
	DEFAULT_WORKSPACE_ICON,
	DEFAULT_WORKSPACE_THEME,
} from "#/features/workspaces/defaults";
import {
	normalizeIconSearch,
	normalizeIconSearchTerm,
	workspaceIconOptions,
} from "#/features/workspaces/model/workspace-icons";
import { hasNameSearchQuery, scoreNameSearch, type NameSearchField } from "#/lib/name-search";

const art = import.meta.glob("../themes/*.webp", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

export interface WorkspaceTheme {
	value: WorkspaceThemeValue;
	label: string;
	group: string;
	/** Derived from the theme, not chosen separately — see getWorkspaceDisplay. */
	icon: WorkspaceIcon;
	/** Nearest workspace colour to the theme art's own background field. */
	color: WorkspaceColor;
}

export const workspaceThemeOptions = [
	{
		value: "study-session",
		label: "Study Session",
		group: "Study",
		icon: "notebook-pen",
		color: "indigo-bold",
	},
	{
		value: "lecture-notes",
		label: "Lecture Notes",
		group: "Study",
		icon: "book-open-text",
		color: "sky-deep",
	},
	{ value: "exam-prep", label: "Exam Prep", group: "Study", icon: "clock-3", color: "rose-soft" },
	{
		value: "coursework",
		label: "Coursework",
		group: "Study",
		icon: "file-text",
		color: "sky",
	},
	{
		value: "reading-list",
		label: "Reading List",
		group: "Study",
		icon: "book-marked",
		color: "green-bold",
	},
	{ value: "library", label: "Library", group: "Study", icon: "library-big", color: "stone" },
	{ value: "seminar", label: "Seminar", group: "Study", icon: "school", color: "cyan" },
	{ value: "study-group", label: "Study Group", group: "Study", icon: "users", color: "cyan-soft" },
	{
		value: "graduation",
		label: "Graduation",
		group: "Study",
		icon: "graduation-cap",
		color: "blue-deep",
	},
	{
		value: "highlights",
		label: "Highlights",
		group: "Study",
		icon: "highlighter",
		color: "yellow",
	},
	{
		value: "research-project",
		label: "Research Project",
		group: "Research",
		icon: "book-search",
		color: "amber-soft",
	},
	{
		value: "literature-review",
		label: "Literature Review",
		group: "Research",
		icon: "notebook-tabs",
		color: "cyan-deep",
	},
	{ value: "thesis", label: "Thesis", group: "Research", icon: "scroll-text", color: "stone-soft" },
	{
		value: "citations",
		label: "Citations",
		group: "Research",
		icon: "archive",
		color: "stone",
	},
	{
		value: "fieldwork",
		label: "Fieldwork",
		group: "Research",
		icon: "thermometer",
		color: "green-deep",
	},
	{
		value: "lab-work",
		label: "Lab Work",
		group: "Research",
		icon: "test-tube-diagonal",
		color: "indigo",
	},
	{
		value: "data-analysis",
		label: "Data Analysis",
		group: "Research",
		icon: "chart-scatter",
		color: "blue",
	},
	{
		value: "grant-proposal",
		label: "Grant Proposal",
		group: "Research",
		icon: "clipboard-list",
		color: "blue-deep",
	},
	{
		value: "knowledge-base",
		label: "Knowledge Base",
		group: "Personal",
		icon: "folder-open",
		color: "teal-deep",
	},
	{ value: "notes", label: "Notes", group: "Personal", icon: "file-text", color: "sky-bold" },
	{ value: "archive", label: "Archive", group: "Personal", icon: "folder-search", color: "amber" },
	{ value: "ideas", label: "Ideas", group: "Personal", icon: "lightbulb", color: "amber" },
	{
		value: "reference",
		label: "Reference",
		group: "Personal",
		icon: "book-open",
		color: "emerald-bold",
	},
	{
		value: "chemistry",
		label: "Chemistry",
		group: "Science",
		icon: "flask-conical",
		color: "violet-deep",
	},
	{ value: "biology", label: "Biology", group: "Science", icon: "microscope", color: "cyan-deep" },
	{ value: "physics", label: "Physics", group: "Science", icon: "magnet", color: "blue-deep" },
	{
		value: "astronomy",
		label: "Astronomy",
		group: "Science",
		icon: "telescope",
		color: "blue-soft",
	},
	{
		value: "molecular-science",
		label: "Molecular Science",
		group: "Science",
		icon: "atom",
		color: "indigo-deep",
	},
	{ value: "genetics", label: "Genetics", group: "Science", icon: "dna", color: "cyan" },
	{
		value: "neuroscience",
		label: "Neuroscience",
		group: "Science",
		icon: "brain",
		color: "indigo-bold",
	},
	{
		value: "mathematics",
		label: "Mathematics",
		group: "Science",
		icon: "sigma",
		color: "amber-deep",
	},
	{
		value: "geometry",
		label: "Geometry",
		group: "Science",
		icon: "drafting-compass",
		color: "sky-deep",
	},
	{
		value: "statistics",
		label: "Statistics",
		group: "Science",
		icon: "chart-column",
		color: "sky",
	},
	{
		value: "earth-science",
		label: "Earth Science",
		group: "Science",
		icon: "mountain",
		color: "stone-bold",
	},
	{ value: "climate", label: "Climate", group: "Science", icon: "droplet", color: "cyan" },
	{ value: "space", label: "Space", group: "Science", icon: "rocket", color: "sky-bold" },
	{ value: "electronics", label: "Electronics", group: "Science", icon: "zap", color: "indigo" },
	{ value: "medicine", label: "Medicine", group: "Medicine", icon: "stethoscope", color: "rose" },
	{
		value: "anatomy",
		label: "Anatomy",
		group: "Medicine",
		icon: "heart-pulse",
		color: "rose-bold",
	},
	{ value: "pharmacy", label: "Pharmacy", group: "Medicine", icon: "pill", color: "teal" },
	{ value: "clinical", label: "Clinical", group: "Medicine", icon: "hospital", color: "blue-soft" },
	{
		value: "history",
		label: "History",
		group: "Humanities",
		icon: "landmark",
		color: "stone-bold",
	},
	{
		value: "archaeology",
		label: "Archaeology",
		group: "Humanities",
		icon: "ruler",
		color: "amber-deep",
	},
	{ value: "geography", label: "Geography", group: "Humanities", icon: "map", color: "amber-soft" },
	{
		value: "world-studies",
		label: "World Studies",
		group: "Humanities",
		icon: "globe-2",
		color: "cyan-deep",
	},
	{ value: "languages", label: "Languages", group: "Humanities", icon: "languages", color: "red" },
	{
		value: "literature",
		label: "Literature",
		group: "Humanities",
		icon: "book-open",
		color: "green-deep",
	},
	{
		value: "creative-writing",
		label: "Creative Writing",
		group: "Humanities",
		icon: "pen-tool",
		color: "red-soft",
	},
	{
		value: "journalism",
		label: "Journalism",
		group: "Humanities",
		icon: "newspaper",
		color: "blue-bold",
	},
	{
		value: "philosophy",
		label: "Philosophy",
		group: "Humanities",
		icon: "scale",
		color: "stone-deep",
	},
	{ value: "law", label: "Law", group: "Humanities", icon: "gavel", color: "red-bold" },
	{ value: "politics", label: "Politics", group: "Humanities", icon: "vote", color: "blue" },
	{
		value: "psychology",
		label: "Psychology",
		group: "Humanities",
		icon: "brain-circuit",
		color: "violet-bold",
	},
	{
		value: "discussion",
		label: "Discussion",
		group: "Humanities",
		icon: "message-square-text",
		color: "rose-soft",
	},
	{ value: "design", label: "Design", group: "Arts", icon: "swatch-book", color: "sky-deep" },
	{ value: "drawing", label: "Drawing", group: "Arts", icon: "pencil-ruler", color: "stone-bold" },
	{ value: "painting", label: "Painting", group: "Arts", icon: "palette", color: "orange-bold" },
	{
		value: "photography",
		label: "Photography",
		group: "Arts",
		icon: "camera",
		color: "violet-soft",
	},
	{ value: "film", label: "Film", group: "Arts", icon: "video", color: "indigo-deep" },
	{ value: "theatre", label: "Theatre", group: "Arts", icon: "theater", color: "rose-bold" },
	{ value: "music", label: "Music", group: "Arts", icon: "music", color: "violet-soft" },
	{
		value: "instrument-practice",
		label: "Instrument Practice",
		group: "Arts",
		icon: "audio-lines",
		color: "cyan-soft",
	},
	{ value: "podcasting", label: "Podcasting", group: "Arts", icon: "mic", color: "sky-deep" },
	{ value: "audio", label: "Audio", group: "Arts", icon: "headphones", color: "teal-deep" },
	{
		value: "programming",
		label: "Programming",
		group: "Technology",
		icon: "code-2",
		color: "blue",
	},
	{
		value: "web-development",
		label: "Web Development",
		group: "Technology",
		icon: "binary",
		color: "indigo-soft",
	},
	{
		value: "data-science",
		label: "Data Science",
		group: "Technology",
		icon: "database",
		color: "blue-deep",
	},
	{ value: "ai", label: "AI", group: "Technology", icon: "bot", color: "violet" },
	{ value: "hardware", label: "Hardware", group: "Technology", icon: "cpu", color: "indigo-bold" },
	{
		value: "robotics",
		label: "Robotics",
		group: "Technology",
		icon: "circuit-board",
		color: "cyan-deep",
	},
	{
		value: "cybersecurity",
		label: "Cybersecurity",
		group: "Technology",
		icon: "shield-check",
		color: "indigo",
	},
	{
		value: "engineering",
		label: "Engineering",
		group: "Technology",
		icon: "wrench",
		color: "orange-deep",
	},
	{ value: "systems", label: "Systems", group: "Technology", icon: "satellite", color: "sky-bold" },
	{
		value: "business",
		label: "Business",
		group: "Work",
		icon: "briefcase-business",
		color: "yellow-soft",
	},
	{ value: "strategy", label: "Strategy", group: "Work", icon: "target", color: "red-deep" },
	{ value: "meetings", label: "Meetings", group: "Work", icon: "presentation", color: "blue-bold" },
	{ value: "analytics", label: "Analytics", group: "Work", icon: "chart-line", color: "blue-bold" },
	{
		value: "reporting",
		label: "Reporting",
		group: "Work",
		icon: "file-chart-column",
		color: "blue-bold",
	},
	{ value: "finance", label: "Finance", group: "Work", icon: "banknote", color: "emerald-deep" },
	{
		value: "accounting",
		label: "Accounting",
		group: "Work",
		icon: "calculator",
		color: "teal-bold",
	},
	{ value: "marketing", label: "Marketing", group: "Work", icon: "megaphone", color: "red" },
	{ value: "sales", label: "Sales", group: "Work", icon: "store", color: "rose-deep" },
	{ value: "operations", label: "Operations", group: "Work", icon: "factory", color: "amber-deep" },
	{ value: "logistics", label: "Logistics", group: "Work", icon: "truck", color: "yellow-deep" },
	{ value: "product", label: "Product", group: "Work", icon: "kanban", color: "cyan-bold" },
	{
		value: "project-plan",
		label: "Project Plan",
		group: "Work",
		icon: "chart-gantt",
		color: "blue-soft",
	},
	{ value: "startup", label: "Startup", group: "Work", icon: "orbit", color: "violet-deep" },
	{ value: "clients", label: "Clients", group: "Work", icon: "handshake", color: "orange-deep" },
	{ value: "people", label: "People", group: "Work", icon: "users", color: "teal-bold" },
	{
		value: "legal-research",
		label: "Legal Research",
		group: "Work",
		icon: "scroll-text",
		color: "rose-deep",
	},
	{
		value: "real-estate",
		label: "Real Estate",
		group: "Work",
		icon: "building-2",
		color: "sky",
	},
	{
		value: "planner",
		label: "Planner",
		group: "Personal",
		icon: "calendar-days",
		color: "orange",
	},
	{ value: "to-do", label: "To-Do", group: "Personal", icon: "list-todo", color: "teal-bold" },
	{
		value: "job-search",
		label: "Job Search",
		group: "Personal",
		icon: "search-check",
		color: "violet-bold",
	},
	{
		value: "money",
		label: "Money",
		group: "Personal",
		icon: "wallet-cards",
		color: "emerald-deep",
	},
	{
		value: "savings",
		label: "Savings",
		group: "Personal",
		icon: "piggy-bank",
		color: "yellow-bold",
	},
	{
		value: "expenses",
		label: "Expenses",
		group: "Personal",
		icon: "receipt-text",
		color: "yellow-bold",
	},
	{
		value: "home-diy",
		label: "Home DIY",
		group: "Personal",
		icon: "hand-coins",
		color: "yellow-bold",
	},
	{
		value: "gardening",
		label: "Gardening",
		group: "Personal",
		icon: "sprout",
		color: "orange-soft",
	},
	{ value: "travel", label: "Travel", group: "Personal", icon: "earth", color: "cyan-bold" },
	{
		value: "wellbeing",
		label: "Wellbeing",
		group: "Personal",
		icon: "activity",
		color: "green-bold",
	},
	{
		value: "economics",
		label: "Economics",
		group: "Humanities",
		icon: "chart-pie",
		color: "cyan-bold",
	},
	{
		value: "sociology",
		label: "Sociology",
		group: "Humanities",
		icon: "users",
		color: "violet",
	},
	{
		value: "anthropology",
		label: "Anthropology",
		group: "Humanities",
		icon: "compass",
		color: "amber-bold",
	},
	{
		value: "criminology",
		label: "Criminology",
		group: "Humanities",
		icon: "search-check",
		color: "sky-soft",
	},
	{
		value: "linguistics",
		label: "Linguistics",
		group: "Humanities",
		icon: "languages",
		color: "indigo-soft",
	},
	{
		value: "classics",
		label: "Classics",
		group: "Humanities",
		icon: "landmark",
		color: "orange-soft",
	},
	{
		value: "art-history",
		label: "Art History",
		group: "Humanities",
		icon: "palette",
		color: "yellow",
	},
	{
		value: "media-studies",
		label: "Media Studies",
		group: "Humanities",
		icon: "video",
		color: "blue-soft",
	},
	{ value: "ecology", label: "Ecology", group: "Science", icon: "leaf", color: "green-deep" },
	{
		value: "environmental-science",
		label: "Environmental Science",
		group: "Science",
		icon: "cloud-sun",
		color: "yellow-soft",
	},
	{
		value: "architecture",
		label: "Architecture",
		group: "Arts",
		icon: "pencil-ruler",
		color: "sky-bold",
	},
	{
		value: "nursing",
		label: "Nursing",
		group: "Medicine",
		icon: "pill-bottle",
		color: "teal-deep",
	},
	{
		value: "public-health",
		label: "Public Health",
		group: "Medicine",
		icon: "waves",
		color: "blue",
	},
	{
		value: "teaching",
		label: "Teaching",
		group: "Study",
		icon: "presentation",
		color: "orange-bold",
	},
	{
		value: "social-work",
		label: "Social Work",
		group: "Personal",
		icon: "helping-hand",
		color: "green",
	},
	{
		value: "default",
		label: "Default",
		group: "Default",
		icon: "notebook-pen",
		color: "indigo-deep",
	},
] as const satisfies ReadonlyArray<WorkspaceTheme>;

assertWorkspaceThemeCatalogueIsComplete();

// The contract enum and this catalogue are generated together; assert rather
// than trust, mirroring assertWorkspaceIconRegistryIsComplete.
function assertWorkspaceThemeCatalogueIsComplete() {
	const catalogued = new Set(workspaceThemeOptions.map((theme) => theme.value));
	const missing = workspaceThemeValues.filter((value) => !catalogued.has(value));

	if (missing.length > 0) {
		throw new Error(`workspaceThemeOptions is missing: ${missing.join(", ")}`);
	}
}

export const workspaceThemeGroups = [...new Set(workspaceThemeOptions.map((t) => t.group))].filter(
	(g) => g !== "Default",
);

// Prop descriptions double as free search terms — searching "flask" or
// "passport" should find the theme that draws one.
const themeKeywords: Record<string, string> = {
	"study-session": "an open ruled notebook, a highlighter and a takeaway coffee cup",
	"lecture-notes": "a spiral notepad, a pen and a folded lecture handout",
	"exam-prep": "a stack of flashcards, a pencil and a small desk clock",
	coursework: "a stapled assignment, a red pen and a marking rubric",
	"reading-list": "three stacked hardbacks with bookmarks and a pair of glasses",
	library: "a tall stack of books, a library card and a paper slip",
	seminar: "a lecture pad, a name card and a paper cup",
	"study-group": "three overlapping name badges and a shared notepad",
	graduation: "a mortarboard, a rolled diploma with ribbon and a tassel",
	highlights: "three highlighter pens and an annotated page",
	"research-project": "an open journal, a magnifier and a stack of tabbed papers",
	"literature-review": "a tabbed binder, sticky flags and a pen",
	thesis: "a thick bound manuscript, a red pen and loose chapter pages",
	citations: "an index-card box, a reference slip and a pencil",
	fieldwork: "a specimen jar, a field notebook and a magnifier",
	"lab-work": "a test-tube rack, a pipette and a lab notebook",
	"data-analysis": "a printed scatter plot, a calculator and a marker",
	"grant-proposal": "a clipped proposal, a fountain pen and a budget sheet",
	"knowledge-base": "a folder stack, an index divider and a label pen",
	notes: "loose note pages, a paper clip and a pencil",
	archive: "a document box, a folder stack and a label tag",
	ideas: "a desk lamp, a scribbled notepad and a pencil stub",
	reference: "an open reference book, a ribbon marker and reading glasses",
	chemistry: "a conical flask, a graduated cylinder and a round-bottom flask",
	biology: "a microscope, a slide box and a pipette",
	physics: "a horseshoe magnet, a metal spring and a pendulum ball",
	astronomy: "a small telescope, a star chart and a compass",
	"molecular-science": "a ball-and-stick molecular model, safety goggles and a lab notebook",
	genetics: "a DNA double-helix model, a petri dish and a swab tube",
	neuroscience: "a printed brain-scan sheet, a set of EEG electrodes with cables and a study card",
	mathematics: "a geometry set, a protractor and a squared workbook",
	geometry: "a drafting compass, a set square and a technical drawing",
	statistics: "a printed bar-chart report, a calculator and a marker",
	"earth-science": "a rock sample, a field hammer and a folded geological map",
	climate: "a rain gauge, a leaf sample and a field notebook",
	space: "a model rocket, a launch checklist and a pair of binoculars",
	electronics: "a breadboard, a resistor strip and a small multimeter",
	medicine: "a stethoscope, a pill bottle and a folded pulse chart",
	anatomy: "an anatomical model, a study card and a marker",
	pharmacy: "a pill organiser, a prescription slip and a small bottle",
	clinical: "a clipboard chart, an ID badge and a pen",
	history: "a rolled parchment, a wax seal and an old key",
	archaeology: "a pottery shard, a soft brush and a measuring rule",
	geography: "a folded paper map, a brass compass and a pencil",
	"world-studies": "a desk globe, a passport and a folded map",
	languages: "a pocket phrasebook, flashcards and a pen",
	literature: "an open novel, a bookmark ribbon and reading glasses",
	"creative-writing": "a fountain pen, an ink bottle and loose manuscript pages",
	journalism: "a folded newspaper, a voice recorder and a notepad",
	philosophy: "a balance scale, a worn hardback and a candle",
	law: "a gavel on its block, a bound statute book and a seal",
	politics: "a folded ballot paper, a plain sealed ballot box and a printed policy leaflet",
	psychology: "an inkblot card, a clipboard and a stopwatch",
	discussion: "a lectern card, a stopwatch and cue notes",
	design: "a fanned colour swatch book, a marker and a cutting ruler",
	drawing: "a sketchpad, a graphite pencil and a kneaded eraser",
	painting: "a paint palette, three brushes and a water jar",
	photography: "a camera body, a prime lens and a lens cap",
	film: "a clapperboard, a film reel and a lens filter",
	theatre: "two masks, a script booklet and a stage light",
	music: "sheet music, a tuning fork and a pencil",
	"instrument-practice": "a metronome, a music stand clip and a rosin block",
	podcasting: "a desk microphone, a pop filter and headphones",
	audio: "over-ear headphones, a small speaker and a coiled cable",
	programming: "a laptop, a stack of index cards and a coffee cup",
	"web-development": "a laptop, a wireframe sketch and a marker",
	"data-science": "a stack of drive discs, a printed chart and a notepad",
	ai: "a small desktop robot figure, a sketchpad and a marker",
	hardware: "a circuit board, a chip and a small screwdriver",
	robotics: "a servo motor, a jumper-wire bundle and pliers",
	cybersecurity: "a padlock, a key card and a folded audit sheet",
	engineering: "an adjustable wrench, a bolt set and a folded blueprint",
	systems: "a network diagram, a patch cable and a marker",
	business: "a closed briefcase, a folded newspaper and a key fob",
	strategy: "a dart in a target board, a notepad and a pen",
	meetings: "a flip-chart page, a marker and a name card",
	analytics: "a printed line-graph report, a ruler and a pencil",
	reporting: "a bound report, a paper clip and a pen",
	finance: "a folded banknote stack, a receipt spike and a calculator",
	accounting: "a desk calculator, a ledger book and a pen",
	marketing: "a megaphone, a pinned mood board and a marker",
	sales: "a shop-front awning model, a paper bag and a price tag",
	operations: "a stacked crate, a checklist clipboard and a marker",
	logistics: "a stacked parcel, a packing slip and a tape dispenser",
	product: "three sticky notes, a marker and an index card",
	"project-plan": "a printed timeline sheet, a ruler and a highlighter",
	startup: "a pitch deck page, a marker and a coffee cup",
	clients: "two business cards meeting and a signed contract",
	people: "three overlapping name badges and a shared notepad",
	"legal-research": "a bound statute book, a tabbed page and a pen",
	"real-estate": "a floor plan, a set of keys and a tape measure",
	planner: "a desk calendar, sticky notes and a fountain pen",
	"to-do": "a checklist pad, a pen and a paper clip",
	"job-search": "a printed CV, a fountain pen and a lanyard badge",
	money: "a card wallet, a folded receipt and a pen",
	savings: "a piggy bank, a coin stack and a savings passbook",
	expenses: "a curled receipt, a pen and a small notebook",
	"home-diy": "a paint roller, a colour chart and a tape measure",
	gardening: "a potted monstera, a watering can and a trowel",
	travel: "a suitcase, a passport and a folded boarding pass",
	wellbeing: "a water bottle, a rolled towel and a step counter",
	economics: "a printed supply-and-demand chart, a calculator and a pen",
	sociology: "a printed survey form, a clipboard and a pencil",
	anthropology: "a woven textile swatch, a field notebook and a plain clay pot fragment",
	criminology: "a case folder, a magnifier and an evidence tag",
	linguistics: "a phonetic chart, an index-card stack and a pen",
	classics: "a fluted column fragment, a bound Latin primer and a stylus",
	"art-history": "a framed canvas corner, a magnifier and a reference plate book",
	"media-studies": "a film strip, a printed storyboard and a marker",
	ecology: "a pressed-leaf sheet, a specimen tin and a hand lens",
	"environmental-science": "a soil test kit, a water sample vial and a field log",
	architecture: "a rolled blueprint, a scale ruler and a small massing model",
	nursing: "a fob watch, a folded chart and a medicine cup",
	"public-health": "a printed epidemiology chart, a clipboard and a marker",
	teaching: "a marking pen set, a stack of graded papers and a register",
	"social-work": "a case file, a referral form and a pen",
	default: "a closed notebook, a pen and a coffee cup",
};

// Umbrella words a user types that should surface a whole family, not just the
// theme that happens to share the word. Without this, "math" finds Mathematics
// but misses Geometry and Statistics.
const queryExpansions: Record<string, readonly string[]> = {
	math: ["mathematics", "geometry", "statistics", "algebra", "calculus", "sigma"],
	maths: ["mathematics", "geometry", "statistics", "algebra", "calculus"],
	science: ["chemistry", "biology", "physics", "genetics", "astronomy", "ecology", "lab"],
	code: ["programming", "web development", "software", "engineering", "systems"],
	coding: ["programming", "web development", "software"],
	writing: ["creative writing", "literature", "journalism", "thesis", "notes"],
	money: ["finance", "accounting", "savings", "expenses", "budget"],
	health: ["medicine", "anatomy", "clinical", "nursing", "wellbeing", "pharmacy"],
	art: ["painting", "drawing", "design", "photography", "art history"],
	music: ["audio", "instrument practice", "podcasting"],
	history: ["archaeology", "classics", "world studies"],
	business: ["strategy", "marketing", "sales", "operations", "finance"],
	law: ["politics", "legal research", "criminology"],
	data: ["data science", "statistics", "analytics", "data analysis"],
};

// Expansions are static, so normalise them once rather than per theme per
// keystroke — the chained passes the linter flagged were a symptom of doing
// this work inside the scoring loop.
const expansionTokens = new Map<string, readonly string[]>(
	Object.entries(queryExpansions).map(([token, values]) => {
		const expanded: string[] = [];

		for (const value of values) {
			for (const part of normalizeIconSearchTerm(value).split(" ")) {
				if (part) {
					expanded.push(part);
				}
			}
		}

		return [token, expanded];
	}),
);

const themeIcons = new Map(workspaceIconOptions.map((option) => [option.value, option]));

// Weighted so the theme's own name beats a match on borrowed vocabulary:
// "chemistry" is also an alias of the test-tube icon that Lab Work uses, and
// without weights that alias ties with Chemistry's actual label.
const TERM_WEIGHTS = { name: 1, group: 0.75, borrowed: 0.5 } as const;

const themeSearchFields = new Map<string, readonly NameSearchField[]>(
	workspaceThemeOptions.map((theme) => {
		const icon = themeIcons.get(theme.icon);

		return [
			theme.value,
			[
				{ text: theme.label, weight: TERM_WEIGHTS.name },
				{ text: theme.value, weight: TERM_WEIGHTS.name },
				{ text: theme.group, weight: TERM_WEIGHTS.group },
				{ text: themeKeywords[theme.value] ?? "", weight: TERM_WEIGHTS.borrowed },
				{ text: icon?.label ?? "", weight: TERM_WEIGHTS.borrowed },
				{ text: (icon?.aliases ?? []).join(" "), weight: TERM_WEIGHTS.borrowed },
			],
		];
	}),
);

export function filterWorkspaceThemeOptions(query: string, group: string | null) {
	const scoped = workspaceThemeOptions.filter(
		(theme) => theme.group !== "Default" && (!group || theme.group === group),
	);

	if (!hasNameSearchQuery(query)) {
		return scoped;
	}

	// Each token must hit something, but it may hit via an expansion — so
	// "math" matches Geometry through the expansion while still ranking
	// Mathematics first, because the direct label match scores higher.
	return scoped
		.map((theme, index) => {
			const fields = themeSearchFields.get(theme.value) ?? [];
			const score = scoreThemeQuery(query, fields);
			return score > 0 ? { index, score, theme } : null;
		})
		.filter((result) => result !== null)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map((result) => result.theme);
}

function scoreThemeQuery(query: string, fields: readonly NameSearchField[]) {
	const direct = scoreNameSearch(query, fields);
	if (direct > 0) {
		return direct;
	}

	const tokens = normalizeIconSearch(query);
	let total = 0;

	for (const token of tokens) {
		let best = scoreNameSearch(token, fields);

		if (best === 0) {
			for (const candidate of expansionTokens.get(token) ?? []) {
				best = Math.max(best, Math.min(3, scoreNameSearch(candidate, fields)));
			}
		}

		if (best === 0) {
			return 0;
		}

		total += best;
	}

	return tokens.length > 0 ? total / tokens.length : 0;
}

export const getWorkspaceThemeArtByValue = (value: string) => art[`../themes/${value}.webp`];

// Widened key: values arrive from the database as plain strings, so the literal
// union the `as const` array infers would reject every lookup.
export const defaultWorkspaceTheme = workspaceThemeOptions.find(
	(theme) => theme.value === DEFAULT_WORKSPACE_THEME,
) as WorkspaceTheme;

const themeByValue = new Map<string, WorkspaceTheme>(
	workspaceThemeOptions.map((t) => [t.value, t]),
);

export const getWorkspaceTheme = (value: string | null | undefined) =>
	value ? themeByValue.get(value) : undefined;

/**
 * What icon and colour to render. Deliberately does NOT infer from the icon:
 * a workspace that predates themes keeps whatever it already had, so upgrading
 * never silently repaints someone's chosen colour.
 */
export function resolveWorkspaceIdentity(workspace: {
	theme?: string | null;
	icon?: WorkspaceIcon | null;
	color?: WorkspaceColor | null;
}): { icon: WorkspaceIcon; color: WorkspaceColor } {
	const theme = getWorkspaceTheme(workspace.theme);

	return {
		icon: theme?.icon ?? workspace.icon ?? DEFAULT_WORKSPACE_ICON,
		color: theme?.color ?? workspace.color ?? DEFAULT_WORKSPACE_COLOR,
	};
}

/**
 * Which theme a workspace is on. Reads the column and nothing else: workspaces
 * that predate themes were backfilled from their icon in 0005, and creation
 * writes a theme, so there is no state left for a render-time guess to
 * reconstruct. Every surface that asks "what theme is this?" gets one answer.
 */
export function resolveWorkspaceTheme(workspace: { theme?: string | null }): WorkspaceTheme {
	return getWorkspaceTheme(workspace.theme) ?? defaultWorkspaceTheme;
}

/** Which artwork to render, always resolved. */
export function getWorkspaceThemeArt(workspace: { theme?: string | null }): string | undefined {
	return getWorkspaceThemeArtByValue(resolveWorkspaceTheme(workspace).value);
}
