/**
 * Gemini API code execution environment — single source for tool description + system prompt.
 * @see https://ai.google.dev/gemini-api/docs/code-execution
 * @see https://ai.google.dev/gemini-api/docs/code-execution#supported-libraries
 */
export const CODE_EXECUTION_DOCS_URL =
  "https://ai.google.dev/gemini-api/docs/code-execution";

export const CODE_EXECUTION_LIBRARIES_URL = `${CODE_EXECUTION_DOCS_URL}#supported-libraries`;

/** Preinstalled packages in Google's sandbox (no pip install). */
export const GEMINI_CODE_EXECUTION_LIBRARIES = [
  "attrs",
  "chess",
  "contourpy",
  "fpdf",
  "geopandas",
  "imageio",
  "jinja2",
  "joblib",
  "jsonschema",
  "jsonschema-specifications",
  "lxml",
  "matplotlib",
  "mpmath",
  "numpy",
  "opencv-python",
  "openpyxl",
  "packaging",
  "pandas",
  "pillow",
  "protobuf",
  "pylatex",
  "pyparsing",
  "PyPDF2",
  "python-dateutil",
  "python-docx",
  "python-pptx",
  "reportlab",
  "scikit-learn",
  "scipy",
  "seaborn",
  "six",
  "striprtf",
  "sympy",
  "tabulate",
  "tensorflow",
  "toolz",
  "xlrd",
] as const;

export function buildCodeExecuteToolDescription(): string {
  return [
    "Run a self-contained task in Google's Python code execution sandbox (Gemini 3.1 Pro).",
    "Use for precise math, simulations, data analysis, charts (matplotlib/seaborn), or deterministic transforms when Python + listed libraries help.",
    "Only Python runs in the sandbox; you cannot install packages. Pass all required data inside `task` (the delegate does not see this chat).",
    `Docs: ${CODE_EXECUTION_DOCS_URL}`,
  ].join(" ");
}

/**
 * System prompt fragment: when/how to use code_execute + environment facts.
 */
export function getCodeExecutionSystemInstructions(): string {
  const libs = GEMINI_CODE_EXECUTION_LIBRARIES.join(", ");
  return `CODE EXECUTION (code_execute):
Use code_execute when: exact arithmetic or algebra verification, numerical simulation, statistical analysis, parsing/transforming structured data or text in Python, matplotlib/seaborn plots from data you include, or multi-step code-based reasoning where mistakes are likely without execution.
Do NOT use for: tasks that are pure explanation with no computation benefit, or when the user only wants code snippets to run locally (answer in chat instead).
The delegate runs in Google's sandbox — Python only. Other languages may be mentioned in prose but will not execute there.
Environment: ~30s max runtime; on errors the model may retry code up to a few times. No pip install — only these libraries: ${libs}.
Plots: only matplotlib is supported for graph rendering in this environment (seaborn builds on matplotlib). File I/O works best with text/CSV; embed or paste data in \`task\` — the sandbox cannot read ThinkEx workspace files. For workspace data, use workspace_read first, then put the needed excerpt or table in \`task\`.
Google's docs emphasize Gemini 3 Flash for some image+code workflows; this tool uses Gemini 3.1 Pro — image+code may work but is not guaranteed to match Flash behavior.
Always pass a self-contained \`task\`: problem statement, numbers, constraints, and any data tables or excerpts the Python run needs. Do not assume the delegate remembers prior turns.
After the tool returns, explain results to the user in plain language without naming this tool or exposing raw tool JSON.`;
}
