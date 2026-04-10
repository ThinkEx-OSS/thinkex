/**
 * Edit/replace utilities for workspace text editing (documents, quizzes, flashcards).
 * Multi-edit pattern modeled after pi-mono's edit tool.
 */

export function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

export function trimDiff(diff: string): string {
  const lines = diff.split("\n");
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++")
  );

  if (contentLines.length === 0) return diff;

  let min = Infinity;
  for (const line of contentLines) {
    const content = line.slice(1);
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/);
      if (match) min = Math.min(min, match[1].length);
    }
  }
  if (min === Infinity || min === 0) return diff;
  const trimmedLines = lines.map((line) => {
    if (
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++")
    ) {
      const prefix = line[0];
      const content = line.slice(1);
      return prefix + content.slice(min);
    }
    return line;
  });

  return trimmedLines.join("\n");
}

function unwrapSingleCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/);
  if (!match) return text;
  return match[1];
}

function normalizeReplacementText(content: string, newString: string): string {
  let normalized = newString;
  const contentLooksJson = /"questions"\s*:|"cards"\s*:|^\s*[\[{]/.test(content);

  if (contentLooksJson) {
    const unwrapped = unwrapSingleCodeFence(normalized);
    const unwrappedLooksJson = /^\s*[\[{]/.test(unwrapped.trim());
    if (unwrapped !== normalized && unwrappedLooksJson) {
      normalized = unwrapped;
    }
  }

  return normalized;
}

function buildSearchCandidates(oldString: string): string[] {
  const candidates = new Set<string>();
  const base = oldString;
  const noFence = unwrapSingleCodeFence(base);

  for (const c of [base, noFence]) {
    if (c.length > 0) candidates.add(c);
  }
  return Array.from(candidates);
}

export interface Edit {
  oldText: string;
  newText: string;
}

export interface AppliedEditsResult {
  baseContent: string;
  newContent: string;
}

function findText(content: string, oldText: string): { found: boolean; index: number; matchLength: number } {
  const index = content.indexOf(oldText);
  if (index !== -1) {
    return { found: true, index, matchLength: oldText.length };
  }
  return { found: false, index: -1, matchLength: 0 };
}

function countOccurrences(content: string, oldText: string): number {
  return content.split(oldText).length - 1;
}

export function applyEdits(content: string, edits: Edit[]): AppliedEditsResult {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedEdits = edits.map(e => ({
    oldText: normalizeLineEndings(e.oldText),
    newText: normalizeLineEndings(e.newText),
  }));

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i].oldText.length === 0) {
      throw new Error(
        normalizedEdits.length === 1
          ? `oldText must not be empty.`
          : `edits[${i}].oldText must not be empty.`
      );
    }
  }

  const matchedEdits: Array<{
    editIndex: number;
    matchIndex: number;
    matchLength: number;
    newText: string;
  }> = [];

  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];
    const candidates = buildSearchCandidates(edit.oldText);
    const replacementText = normalizeReplacementText(normalizedContent, edit.newText);
    let matched = false;

    for (const candidate of candidates) {
      const result = findText(normalizedContent, candidate);
      if (result.found) {
        const occurrences = countOccurrences(normalizedContent, candidate);
        if (occurrences > 1) {
          throw new Error(
            normalizedEdits.length === 1
              ? `Found ${occurrences} occurrences of the text. The text must be unique. Please provide more context to make it unique.`
              : `Found ${occurrences} occurrences of edits[${i}]. Each oldText must be unique. Please provide more context to make it unique.`
          );
        }
        matchedEdits.push({
          editIndex: i,
          matchIndex: result.index,
          matchLength: result.matchLength,
          newText: replacementText,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      throw new Error(
        normalizedEdits.length === 1
          ? `Could not find the exact text. The old text must match exactly including all whitespace and newlines.`
          : `Could not find edits[${i}]. The oldText must match exactly including all whitespace and newlines.`
      );
    }
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matchedEdits.length; i++) {
    const prev = matchedEdits[i - 1];
    const curr = matchedEdits[i];
    if (prev.matchIndex + prev.matchLength > curr.matchIndex) {
      throw new Error(
        `edits[${prev.editIndex}] and edits[${curr.editIndex}] overlap. Merge them into one edit or target disjoint regions.`
      );
    }
  }

  let newContent = normalizedContent;
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const edit = matchedEdits[i];
    newContent =
      newContent.substring(0, edit.matchIndex) +
      edit.newText +
      newContent.substring(edit.matchIndex + edit.matchLength);
  }

  if (normalizedContent === newContent) {
    throw new Error(`No changes made. The replacements produced identical content.`);
  }

  return { baseContent: normalizedContent, newContent };
}

/** @deprecated Use applyEdits() for new code. Kept for any remaining callers. */
export function replace(content: string, oldString: string, newString: string): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }
  const { newContent } = applyEdits(content, [{ oldText: oldString, newText: newString }]);
  return newContent;
}
