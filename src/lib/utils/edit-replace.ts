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

function buildSearchCandidates(oldString: string, contentLooksJson: boolean): string[] {
  const candidates = new Set<string>();
  candidates.add(oldString);
  if (contentLooksJson) {
    const noFence = unwrapSingleCodeFence(oldString);
    if (noFence.length > 0) candidates.add(noFence);
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

export interface FailedEdit {
  index: number;
  reason: string;
}

export interface BestEffortEditsResult extends AppliedEditsResult {
  appliedEditIndices: number[];
  failedEdits: FailedEdit[];
  hadFailures: boolean;
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

type Replacer = (content: string, find: string) => Iterable<string>;

const simpleReplacer: Replacer = function* (_content, find) {
  yield find;
};

const lineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines.length === 0) return;
  if (searchLines[searchLines.length - 1] === "") searchLines.pop();
  if (searchLines.length === 0) return;
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const block = originalLines.slice(i, i + searchLines.length).join("\n");
    yield block;
  }
};

const trimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim();
  if (!trimmedFind || trimmedFind === find) return;
  if (content.includes(trimmedFind)) yield trimmedFind;
};

const whitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();
  const normalizedFind = normalizeWhitespace(find);
  if (!normalizedFind) return;

  const lines = content.split("\n");
  for (const line of lines) {
    if (normalizeWhitespace(line) === normalizedFind) {
      yield line;
    }
  }

  const findLines = find.split("\n");
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length).join("\n");
      if (normalizeWhitespace(block) === normalizedFind) {
        yield block;
      }
    }
  }
};

const indentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndentation = (text: string): string => {
    const lines = text.split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) return text;
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
      }),
    );
    return lines
      .map((line) => (line.trim().length === 0 ? line : line.slice(minIndent)))
      .join("\n");
  };

  const normalizedFind = removeIndentation(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");
  if (findLines.length === 0) return;
  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n");
    if (removeIndentation(block) === normalizedFind) {
      yield block;
    }
  }
};

const escapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (str: string): string =>
    str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar) => {
      switch (capturedChar) {
        case "n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case "'":
          return "'";
        case '"':
          return '"';
        case "`":
          return "`";
        case "\\":
          return "\\";
        case "\n":
          return "\n";
        case "$":
          return "$";
        default:
          return match;
      }
    });

  const unescapedFind = unescapeString(find);
  if (unescapedFind && content.includes(unescapedFind)) {
    yield unescapedFind;
  }
};

const contextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n");
  if (findLines.length < 3) return;
  if (findLines[findLines.length - 1] === "") findLines.pop();
  if (findLines.length < 3) return;

  const contentLines = content.split("\n");
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() !== lastLine) continue;
      const blockLines = contentLines.slice(i, j + 1);
      if (blockLines.length !== findLines.length) break;
      let matchingLines = 0;
      let totalNonEmptyLines = 0;
      for (let k = 1; k < blockLines.length - 1; k++) {
        const blockLine = blockLines[k].trim();
        const findLine = findLines[k].trim();
        if (blockLine.length > 0 || findLine.length > 0) {
          totalNonEmptyLines++;
          if (blockLine === findLine) matchingLines++;
        }
      }
      if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
        yield blockLines.join("\n");
        break;
      }
      break;
    }
  }
};

const replacers: Replacer[] = [
  simpleReplacer,
  lineTrimmedReplacer,
  trimmedBoundaryReplacer,
  whitespaceNormalizedReplacer,
  indentationFlexibleReplacer,
  escapeNormalizedReplacer,
  contextAwareReplacer,
];

function notFoundError(totalEdits: number, editIndex: number): Error {
  return new Error(
    totalEdits === 1
      ? `Could not find the exact text. The old text must match exactly including all whitespace and newlines.`
      : `Could not find edits[${editIndex}]. The oldText must match exactly including all whitespace and newlines.`,
  );
}

function occurrenceError(totalEdits: number, editIndex: number, occurrences: number): Error {
  return new Error(
    totalEdits === 1
      ? `Found ${occurrences} occurrences of the text. The text must be unique. Please provide more context to make it unique.`
      : `Found ${occurrences} occurrences of edits[${editIndex}]. Each oldText must be unique. Please provide more context to make it unique.`,
  );
}

function resolveUniqueMatch(
  content: string,
  oldText: string,
  contentLooksJson: boolean,
  totalEdits: number,
  editIndex: number,
): { matchText: string; matchIndex: number; matchLength: number } {
  const searchCandidates = buildSearchCandidates(oldText, contentLooksJson);
  const yielded = new Set<string>();
  let maxOccurrences = 0;

  for (const candidate of searchCandidates) {
    for (const replacer of replacers) {
      for (const search of replacer(content, candidate)) {
        if (!search || yielded.has(search)) continue;
        yielded.add(search);
        const result = findText(content, search);
        if (!result.found) continue;
        const occurrences = countOccurrences(content, search);
        maxOccurrences = Math.max(maxOccurrences, occurrences);
        if (occurrences > 1) continue;
        return {
          matchText: search,
          matchIndex: result.index,
          matchLength: result.matchLength,
        };
      }
    }
  }

  if (maxOccurrences > 1) {
    throw occurrenceError(totalEdits, editIndex, maxOccurrences);
  }
  throw notFoundError(totalEdits, editIndex);
}

function applyResolvedEdits(
  content: string,
  resolved: Array<{ editIndex: number; matchIndex: number; matchLength: number; newText: string }>,
): string {
  let newContent = content;
  for (let i = resolved.length - 1; i >= 0; i--) {
    const edit = resolved[i];
    newContent =
      newContent.substring(0, edit.matchIndex) +
      edit.newText +
      newContent.substring(edit.matchIndex + edit.matchLength);
  }
  return newContent;
}

export function applyEdits(content: string, edits: Edit[]): AppliedEditsResult {
  const normalizedContent = normalizeLineEndings(content);
  const contentLooksJson = /"questions"\s*:|"cards"\s*:|^\s*[\[{]/.test(normalizedContent);
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
    const replacementText = normalizeReplacementText(normalizedContent, edit.newText);
    const match = resolveUniqueMatch(
      normalizedContent,
      edit.oldText,
      contentLooksJson,
      normalizedEdits.length,
      i,
    );
    matchedEdits.push({
      editIndex: i,
      matchIndex: match.matchIndex,
      matchLength: match.matchLength,
      newText: replacementText,
    });
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

  const newContent = applyResolvedEdits(normalizedContent, matchedEdits);

  if (normalizedContent === newContent) {
    throw new Error(`No changes made. The replacements produced identical content.`);
  }

  return { baseContent: normalizedContent, newContent };
}

export function applyEditsBestEffort(content: string, edits: Edit[]): BestEffortEditsResult {
  const normalizedContent = normalizeLineEndings(content);
  const contentLooksJson = /"questions"\s*:|"cards"\s*:|^\s*[\[{]/.test(normalizedContent);
  const normalizedEdits = edits.map((e) => ({
    oldText: normalizeLineEndings(e.oldText),
    newText: normalizeLineEndings(e.newText),
  }));

  const failedEdits: FailedEdit[] = [];
  const appliedEditIndices: number[] = [];

  const pending = new Set<number>();
  for (let i = 0; i < normalizedEdits.length; i++) pending.add(i);

  const firstPassResolved: Array<{
    editIndex: number;
    matchIndex: number;
    matchLength: number;
    newText: string;
  }> = [];

  // Pass 1: resolve against original snapshot for independence.
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];
    if (edit.oldText.length === 0) {
      failedEdits.push({
        index: i,
        reason:
          normalizedEdits.length === 1
            ? `oldText must not be empty.`
            : `edits[${i}].oldText must not be empty.`,
      });
      pending.delete(i);
      continue;
    }
    const replacementText = normalizeReplacementText(normalizedContent, edit.newText);
    try {
      const match = resolveUniqueMatch(
        normalizedContent,
        edit.oldText,
        contentLooksJson,
        normalizedEdits.length,
        i,
      );
      firstPassResolved.push({
        editIndex: i,
        matchIndex: match.matchIndex,
        matchLength: match.matchLength,
        newText: replacementText,
      });
      pending.delete(i);
    } catch {
      // Leave unresolved for pass 2.
    }
  }

  firstPassResolved.sort((a, b) => a.matchIndex - b.matchIndex);
  const nonOverlapping: typeof firstPassResolved = [];
  for (let i = 0; i < firstPassResolved.length; i++) {
    const curr = firstPassResolved[i];
    if (nonOverlapping.length === 0) {
      nonOverlapping.push(curr);
      continue;
    }
    const prev = nonOverlapping[nonOverlapping.length - 1]!;
    if (prev.matchIndex + prev.matchLength > curr.matchIndex) {
      failedEdits.push({
        index: curr.editIndex,
        reason: `edits[${prev.editIndex}] and edits[${curr.editIndex}] overlap. Merge them into one edit or target disjoint regions.`,
      });
      continue;
    }
    nonOverlapping.push(curr);
  }

  let currentContent = applyResolvedEdits(normalizedContent, nonOverlapping);
  for (const resolved of nonOverlapping) appliedEditIndices.push(resolved.editIndex);

  // Pass 2: retry unresolved edits sequentially against latest content.
  for (const editIndex of Array.from(pending).sort((a, b) => a - b)) {
    const edit = normalizedEdits[editIndex];
    const replacementText = normalizeReplacementText(currentContent, edit.newText);
    try {
      const match = resolveUniqueMatch(
        currentContent,
        edit.oldText,
        contentLooksJson,
        normalizedEdits.length,
        editIndex,
      );
      currentContent =
        currentContent.substring(0, match.matchIndex) +
        replacementText +
        currentContent.substring(match.matchIndex + match.matchLength);
      appliedEditIndices.push(editIndex);
    } catch (error) {
      failedEdits.push({
        index: editIndex,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  appliedEditIndices.sort((a, b) => a - b);
  failedEdits.sort((a, b) => a.index - b.index);

  if (appliedEditIndices.length === 0 && failedEdits.length === 0) {
    throw new Error(`No changes made. The replacements produced identical content.`);
  }
  if (appliedEditIndices.length === 0 && failedEdits.length > 0) {
    throw new Error(failedEdits[0]?.reason ?? `No changes made.`);
  }
  if (normalizedContent === currentContent) {
    throw new Error(`No changes made. The replacements produced identical content.`);
  }

  return {
    baseContent: normalizedContent,
    newContent: currentContent,
    appliedEditIndices,
    failedEdits,
    hadFailures: failedEdits.length > 0,
  };
}

/** @deprecated Use applyEdits() for new code. Kept for any remaining callers. */
export function replace(content: string, oldString: string, newString: string): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }
  const { newContent } = applyEdits(content, [{ oldText: oldString, newText: newString }]);
  return newContent;
}
