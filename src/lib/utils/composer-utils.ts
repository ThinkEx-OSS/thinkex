/**
 * Focuses the composer input field.
 * Uses the existing pattern with a timeout to ensure the DOM is ready.
 * @param cursorAtEnd - If true, sets the cursor to the end of the text
 */
export function focusComposerInput(cursorAtEnd = false): void {
  setTimeout(() => {
    const composerInput = document.querySelector('.aui-composer-input') as HTMLTextAreaElement | null;
    if (composerInput) {
      composerInput.focus();
      if (cursorAtEnd) {
        const len = composerInput.value.length;
        composerInput.setSelectionRange(len, len);
      }
    }
  }, 100);
}
