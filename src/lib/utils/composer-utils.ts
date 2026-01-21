/**
 * Focuses the composer input field.
 * Uses the existing pattern with a timeout to ensure the DOM is ready.
 */
export function focusComposerInput(): void {
  setTimeout(() => {
    const composerInput = document.querySelector('.aui-composer-input') as HTMLTextAreaElement | null;
    if (composerInput) {
      composerInput.focus();
    }
  }, 100);
}
