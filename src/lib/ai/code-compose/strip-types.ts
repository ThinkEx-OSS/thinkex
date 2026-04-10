/**
 * Strip TypeScript type annotations from code before execution in isolated-vm.
 * Uses sucrase for fast (~1ms) TS→JS transform. Only called when needed.
 */

let sucrase: typeof import("sucrase") | null = null;

async function getSucrase() {
  if (!sucrase) {
    sucrase = await import("sucrase");
  }
  return sucrase;
}

/**
 * Heuristic: does the code contain TS-only syntax?
 * Checks for common patterns like `: string`, `<Type>`, `interface`, `as const`.
 */
export function looksLikeTypeScript(code: string): boolean {
  return /\b(interface|type|enum|as\s+const|<[A-Z]\w*>|:\s*(string|number|boolean|any|void|never|unknown|Array|Record|Promise)\b)/.test(
    code,
  );
}

/**
 * Strip TS annotations if detected. Returns original code if already valid JS.
 * ~1ms when stripping is needed, ~0ms when skipped.
 */
export async function stripTypeAnnotations(code: string): Promise<string> {
  if (!looksLikeTypeScript(code)) {
    return code;
  }

  const { transform } = await getSucrase();
  const result = transform(code, {
    transforms: ["typescript"],
    disableESTransforms: true,
  });

  return result.code;
}
