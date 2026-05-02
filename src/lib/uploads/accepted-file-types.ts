import {
  OFFICE_DOCUMENT_ACCEPT,
  OFFICE_DOCUMENT_ACCEPT_STRING,
  isOfficeDocument,
} from "@/lib/uploads/office-document-validation";

const PDF_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
};

const IMAGE_ACCEPT: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/avif": [".avif"],
  "image/tiff": [".tiff", ".tif"],
};

const TEXT_ACCEPT: Record<string, string[]> = {
  "text/plain": [".txt", ".log"],
  "text/markdown": [".md", ".Rmd"],
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "text/x-rst": [".rst"],
};

const CODE_EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".json": "json",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".cfg": "ini",
  ".env": "bash",
  ".properties": "properties",
  ".proto": "protobuf",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".dart": "dart",
  ".lua": "lua",
  ".pl": "perl",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".sql": "sql",
  ".gradle": "gradle",
  ".tf": "hcl",
  ".r": "r",
  ".m": "matlab",
  ".jl": "julia",
  ".f": "fortran",
  ".f90": "fortran",
  ".f95": "fortran",
  ".do": "stata",
  ".sas": "sas",
  ".sps": "spss",
  ".hs": "haskell",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".ex": "elixir",
  ".exs": "elixir",
  ".clj": "clojure",
  ".asm": "asm",
  ".s": "asm",
  ".v": "verilog",
  ".sv": "systemverilog",
  ".vhd": "vhdl",
  ".vhdl": "vhdl",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".tex": "latex",
  ".latex": "latex",
  ".bib": "bibtex",
};

const CODE_EXTENSIONS = Object.keys(CODE_EXTENSION_LANGUAGE_MAP);

const CODE_ACCEPT: Record<string, string[]> = {
  "text/plain": CODE_EXTENSIONS,
  "application/octet-stream": CODE_EXTENSIONS,
  "application/json": [".json"],
  "text/xml": [".xml"],
  "application/xml": [".xml"],
  "text/x-python": [".py"],
  "text/html": [".html", ".htm"],
  "text/css": [".css"],
};

const OFFICE_ACCEPT: Record<string, string[]> = Object.fromEntries(
  Object.entries(OFFICE_DOCUMENT_ACCEPT).map(([k, v]) => [k, [...v]]),
);

type CategoryName = "pdf" | "office" | "images" | "text" | "code";

const CATEGORY_MAP: Record<CategoryName, Record<string, string[]>> = {
  pdf: PDF_ACCEPT,
  office: OFFICE_ACCEPT,
  images: IMAGE_ACCEPT,
  text: TEXT_ACCEPT,
  code: CODE_ACCEPT,
};

function buildAcceptObject(
  ...categories: CategoryName[]
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const cat of categories) {
    const accept = CATEGORY_MAP[cat];
    for (const [mime, exts] of Object.entries(accept)) {
      if (merged[mime]) {
        const existing = new Set(merged[mime]);
        for (const ext of exts) existing.add(ext);
        merged[mime] = [...existing];
      } else {
        merged[mime] = [...exts];
      }
    }
  }
  return merged;
}

function buildAcceptString(...categories: CategoryName[]): string {
  const extensions = new Set<string>();
  const mimes = new Set<string>();
  for (const cat of categories) {
    const accept = CATEGORY_MAP[cat];
    for (const [mime, exts] of Object.entries(accept)) {
      if (cat !== "code") {
        mimes.add(mime);
      }
      for (const ext of exts) extensions.add(ext);
    }
  }
  return [...mimes, ...extensions].join(",");
}

const ALL_TEXT_EXTENSIONS = new Set<string>();
for (const exts of Object.values(TEXT_ACCEPT)) {
  for (const ext of exts) ALL_TEXT_EXTENSIONS.add(ext.toLowerCase());
}

const ALL_CODE_EXTENSIONS = new Set<string>(
  CODE_EXTENSIONS.map((e) => e.toLowerCase()),
);

export function isTextOrCodeFile(filename: string): boolean {
  const ext = ("." + filename.split(".").pop()?.toLowerCase()) as string;
  return ALL_TEXT_EXTENSIONS.has(ext) || ALL_CODE_EXTENSIONS.has(ext);
}

export function getCodeLanguage(filename: string): string | null {
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  return CODE_EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

export function isStudyDocumentFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    isOfficeDocument(file)
  );
}

export const HOME_UPLOAD_ACCEPT = buildAcceptObject(
  "pdf",
  "office",
  "images",
  "text",
  "code",
);
export const HOME_UPLOAD_ACCEPT_STRING = buildAcceptString(
  "pdf",
  "office",
  "images",
  "text",
  "code",
);
export const HOME_UPLOAD_REJECT_MESSAGE = "This file type is not supported.";
export const HOME_UPLOAD_DESCRIPTION =
  "Documents, images, text, and code files";

export const WORKSPACE_UPLOAD_ACCEPT = buildAcceptObject(
  "pdf",
  "office",
  "images",
  "text",
  "code",
);
export const WORKSPACE_UPLOAD_ACCEPT_STRING = buildAcceptString(
  "pdf",
  "office",
  "images",
  "text",
  "code",
);
export const WORKSPACE_UPLOAD_DESCRIPTION = "documents, images, or code files";

export const CHAT_UPLOAD_ACCEPT = buildAcceptObject(
  "pdf",
  "office",
  "images",
  "text",
  "code",
);
export const CHAT_UPLOAD_ACCEPT_STRING = buildAcceptString(
  "pdf",
  "office",
  "images",
  "text",
  "code",
);

export const SERVER_ALLOWED_MIME_TYPES: string[] = (() => {
  const mimes = new Set<string>();
  for (const cat of [
    "pdf",
    "office",
    "images",
    "text",
    "code",
  ] as CategoryName[]) {
    for (const mime of Object.keys(CATEGORY_MAP[cat])) {
      mimes.add(mime);
    }
  }
  mimes.add("application/octet-stream");
  mimes.add("text/x-python");
  return [...mimes];
})();
