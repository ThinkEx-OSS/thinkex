/**
 * Walks up from a DOM node to find assistant-ui `data-message-id` on MessagePrimitive.Root.
 * Mirrors @assistant-ui/react getSelectionMessageId.
 */
function findMessageId(node: Node | null): string | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    const id = el.getAttribute("data-message-id");
    if (id) return id;
    el = el.parentElement;
  }
  return null;
}

/**
 * Returns the message id only if the selection anchor and focus lie in the same message.
 * If the range spans two messages, returns null.
 */
export function getSelectionMessageId(selection: Selection): string | null {
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return null;
  const anchorId = findMessageId(anchorNode);
  const focusId = findMessageId(focusNode);
  if (!anchorId || anchorId !== focusId) return null;
  return anchorId;
}
