type CodeLanguageDefinition = {
	aliases?: readonly string[];
	extensions?: readonly string[];
	fileNames?: readonly string[];
	label: string;
	value: string;
};

const codeLanguageDefinitions = [
	{
		value: "javascript",
		label: "JavaScript",
		aliases: ["js"],
		extensions: ["cjs", "js", "mjs"],
	},
	{
		value: "typescript",
		label: "TypeScript",
		aliases: ["ts"],
		extensions: ["cts", "mts", "ts"],
	},
	{ value: "tsx", label: "TSX", extensions: ["tsx"] },
	{ value: "jsx", label: "JSX", extensions: ["jsx"] },
	{ value: "json", label: "JSON", extensions: ["json"] },
	{ value: "jsonc", label: "JSONC", extensions: ["jsonc"] },
	{ value: "html", label: "HTML", extensions: ["htm", "html"] },
	{ value: "css", label: "CSS", extensions: ["css"] },
	{ value: "markdown", label: "Markdown", aliases: ["md"] },
	{ value: "mdx", label: "MDX", extensions: ["mdx"] },
	{
		value: "shellscript",
		label: "Shell",
		aliases: ["sh", "shell"],
		extensions: ["bashrc", "sh", "zsh"],
	},
	{ value: "bash", label: "Bash", extensions: ["bash"] },
	{
		value: "powershell",
		label: "PowerShell",
		aliases: ["ps", "ps1"],
		extensions: ["ps1", "psm1"],
	},
	{ value: "python", label: "Python", aliases: ["py"], extensions: ["py"] },
	{ value: "sql", label: "SQL", extensions: ["sql"] },
	{ value: "graphql", label: "GraphQL", aliases: ["gql"], extensions: ["gql", "graphql"] },
	{ value: "yaml", label: "YAML", aliases: ["yml"], extensions: ["yaml", "yml"] },
	{ value: "toml", label: "TOML", extensions: ["toml"] },
	{
		value: "dotenv",
		label: ".env",
		aliases: [".env", "env"],
		extensions: ["env"],
		fileNames: [".env"],
	},
	{ value: "ini", label: "INI", extensions: ["ini"] },
	{
		value: "docker",
		label: "Dockerfile",
		aliases: ["dockerfile"],
		extensions: ["dockerfile"],
		fileNames: ["dockerfile"],
	},
	{
		value: "terraform",
		label: "Terraform",
		aliases: ["tf", "tfvars"],
		extensions: ["tf", "tfvars"],
	},
	{ value: "hcl", label: "HCL", extensions: ["hcl"] },
	{ value: "xml", label: "XML", extensions: ["xml"] },
	{ value: "go", label: "Go", extensions: ["go"] },
	{ value: "rust", label: "Rust", extensions: ["rs"] },
	{ value: "java", label: "Java", extensions: ["java"] },
	{ value: "c", label: "C", extensions: ["c", "h"] },
	{
		value: "cpp",
		label: "C++",
		aliases: ["c++"],
		extensions: ["cc", "cpp", "cxx", "hh", "hpp", "hxx"],
	},
	{ value: "csharp", label: "C#", aliases: ["cs", "csharp"], extensions: ["cs"] },
	{ value: "kotlin", label: "Kotlin", aliases: ["kt", "kts"], extensions: ["kt", "kts"] },
	{ value: "swift", label: "Swift", extensions: ["swift"] },
	{ value: "dart", label: "Dart", extensions: ["dart"] },
	{ value: "php", label: "PHP", extensions: ["php"] },
	{ value: "ruby", label: "Ruby", extensions: ["rb"] },
	{ value: "lua", label: "Lua", extensions: ["lua"] },
	{ value: "r", label: "R", extensions: ["r"] },
	{ value: "vue", label: "Vue", extensions: ["vue"] },
	{ value: "svelte", label: "Svelte", extensions: ["svelte"] },
	{ value: "astro", label: "Astro", extensions: ["astro"] },
	{
		value: "make",
		label: "Makefile",
		aliases: ["makefile"],
		extensions: ["make", "mk"],
		fileNames: ["makefile"],
	},
	{ value: "diff", label: "Diff", extensions: ["diff", "patch"] },
] as const satisfies readonly CodeLanguageDefinition[];

export type SupportedCodeLanguage = (typeof codeLanguageDefinitions)[number]["value"];

export type CodeLanguageOption = {
	label: string;
	value: SupportedCodeLanguage;
};

type CodeLanguageLookupDefinition = Omit<CodeLanguageDefinition, "value"> & {
	value: SupportedCodeLanguage;
};

const codeLanguageDefinitionList: readonly CodeLanguageLookupDefinition[] = codeLanguageDefinitions;

export const supportedCodeLanguages = codeLanguageDefinitions.map((definition) => definition.value);

export const codeLanguageOptions: CodeLanguageOption[] = codeLanguageDefinitions.map(
	({ label, value }) => ({ label, value }),
);

export const supportedCodeFileExtensions = [
	...new Set(codeLanguageDefinitionList.flatMap((definition) => definition.extensions ?? [])),
].sort((left, right) => left.localeCompare(right));

export const supportedCodeFileNames = [
	...new Set(codeLanguageDefinitionList.flatMap((definition) => definition.fileNames ?? [])),
].sort((left, right) => left.localeCompare(right));

const supportedCodeLanguageSet = new Set<string>(supportedCodeLanguages);
const codeLanguageAliases = new Map<string, SupportedCodeLanguage>(
	codeLanguageDefinitionList.flatMap((definition) =>
		(definition.aliases ?? []).map((alias) => [alias, definition.value] as const),
	),
);

const codeLanguageByFileExtension = new Map<string, SupportedCodeLanguage>(
	codeLanguageDefinitionList.flatMap((definition) =>
		(definition.extensions ?? []).map((extension) => [extension, definition.value] as const),
	),
);

const codeLanguageByFileName = new Map<string, SupportedCodeLanguage>(
	codeLanguageDefinitionList.flatMap((definition) =>
		(definition.fileNames ?? []).map((fileName) => [fileName, definition.value] as const),
	),
);

export function normalizeCodeLanguage(
	language: string | null | undefined,
): SupportedCodeLanguage | null {
	if (!language) {
		return null;
	}

	const normalized = language.trim().toLowerCase();

	if (supportedCodeLanguageSet.has(normalized)) {
		return normalized as SupportedCodeLanguage;
	}

	return codeLanguageAliases.get(normalized) ?? null;
}

export function getCodeLanguageLabel(language: string | null | undefined) {
	const normalizedLanguage = normalizeCodeLanguage(language);
	const option = codeLanguageOptions.find((candidate) => candidate.value === normalizedLanguage);

	return option?.label ?? "Code";
}

export function resolveCodeLanguageFromFileName(fileName: string): SupportedCodeLanguage | null {
	const normalizedName = fileName.trim().split(/[\\/]/).at(-1)?.toLowerCase() ?? "";

	if (!normalizedName) {
		return null;
	}

	const exactNameMatch = codeLanguageByFileName.get(normalizedName);

	if (exactNameMatch) {
		return exactNameMatch;
	}

	if (normalizedName.startsWith(".env.")) {
		return "dotenv";
	}

	const extension = normalizedName.split(".").at(-1);

	if (!extension || extension === normalizedName) {
		return null;
	}

	return codeLanguageByFileExtension.get(extension) ?? null;
}
