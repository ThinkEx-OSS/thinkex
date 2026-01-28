# Tool UI Schema Comparison

This document compares the tool definitions with their corresponding UI component schemas.

## Summary

Several mismatches found between tool input schemas and UI component type definitions.

## Detailed Comparison

### ✅ MATCHING

1. **processUrls**
   - Tool: `z.object({ jsonInput: z.string() })`
   - UI: `{ jsonInput: string }`
   - Status: ✅ Match

2. **processFiles**
   - Tool: `z.object({ jsonInput: z.string() })`
   - UI: `{ jsonInput: string }`
   - Status: ✅ Match

3. **updateCard**
   - Tool: `z.object({ id: z.string(), markdown: z.string().optional(), content: z.string().optional() })`
   - UI: `{ id: string; markdown?: string; content?: string }`
   - Status: ✅ Match

4. **deleteCard**
   - Tool: `z.object({ id: z.string() })`
   - UI: No explicit args type (uses `any`)
   - Status: ✅ Match (UI doesn't type args)

5. **clearCardContent**
   - Tool: `z.object({ id: z.string() })`
   - UI: No explicit args type (uses `any`)
   - Status: ✅ Match (UI doesn't type args)

6. **searchWeb**
   - Tool: `z.object({ query: z.string() })`
   - UI: `{ query: string }`
   - Status: ✅ Match

7. **executeCode**
   - Tool: `z.object({ task: z.string() })`
   - UI: `{ task: string }`
   - Status: ✅ Match

8. **deepResearch**
   - Tool: `z.object({ prompt: z.string() })`
   - UI: `{ prompt: string }`
   - Status: ✅ Match

### ⚠️ MISMATCHES

1. **createFlashcards**
   - Tool: `z.any()` - accepts plain text format (Title: ...\nFront: ...\nBack: ...)
   - UI: `{ description?: string; title?: string; cards?: Array<{ front: string; back: string }> }`
   - Issue: Tool accepts unstructured text, UI expects structured object
   - Impact: Low - UI likely handles text parsing internally, but type safety is lost

2. **updateFlashcards**
   - Tool: `z.any()` - accepts plain text format (Deck: ...\nFront: ...\nBack: ...)
   - UI: `{ description?: string; id?: string; cardsToAdd?: Array<{ front: string; back: string }> }`
   - Issue: Tool accepts unstructured text, UI expects structured object
   - Impact: Low - UI likely handles text parsing internally, but type safety is lost

3. **createQuiz**
   - Tool: `z.any()` - accepts object with: `topic`, `contextContent`, `sourceCardIds`, `sourceCardNames`, `difficulty`
   - UI: `{ topic?: string; difficulty: "easy" | "medium" | "hard" }`
   - Issue: Tool accepts more fields than UI types
   - Impact: Medium - UI won't have type safety for `contextContent`, `sourceCardIds`, `sourceCardNames`
   - Note: `difficulty` is required in UI but optional in tool

4. **updateQuiz**
   - Tool: `z.any()` - accepts object with: `quizId`, `topic`, `contextContent`, `sourceCardIds`, `sourceCardNames`
   - UI: `{ quizId: string }`
   - Issue: Tool accepts more fields than UI types
   - Impact: Medium - UI won't have type safety for additional fields

5. **createNote**
   - Tool: `z.object({ title: z.string(), content: z.string() })`
   - UI: `{ title: string; content: string; tags?: string[] }`
   - Issue: UI includes `tags` field that tool doesn't accept
   - Impact: Low - `tags` is optional in UI, tool will ignore it

6. **selectCards**
   - Tool: `z.object({ cardTitles: z.array(z.string()) })`
   - UI: `{ cardIds?: string[]; cardTitles?: string[] }`
   - Issue: UI accepts `cardIds` but tool only accepts `cardTitles`
   - Impact: High - If LLM passes `cardIds`, tool will fail
   - Note: UI handles both, but backend tool only supports `cardTitles`

## Recommendations

1. **Flashcard tools**: Consider updating UI types to accept `string | object` to match tool's `z.any()` schema, or document that args will be parsed text.

2. **Quiz tools**: Update UI types to include all fields that tools accept:
   - `createQuiz`: Add `contextContent?: string`, `sourceCardIds?: string[]`, `sourceCardNames?: string[]`
   - `updateQuiz`: Add `topic?: string`, `contextContent?: string`, `sourceCardIds?: string[]`, `sourceCardNames?: string[]`

3. **createNote**: Remove `tags` from UI type or add it to tool schema if it should be supported.

4. **selectCards**: Either:
   - Remove `cardIds` from UI type (if tool only supports titles), OR
   - Add `cardIds` support to the tool definition

## Notes

- Tools using `z.any()` lose type safety but provide flexibility for complex inputs
- UI components may handle parsing/coercion internally, so runtime behavior might be fine
- Type mismatches can cause TypeScript errors and reduce developer confidence
- Result schemas appear to be properly aligned via `tool-result-schemas.ts`
