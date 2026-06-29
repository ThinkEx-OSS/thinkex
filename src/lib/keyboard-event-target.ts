// Mirrors Base UI's internal TYPEABLE_SELECTOR with select included for form controls.
// @see node_modules/@base-ui/react/floating-ui-react/utils/constants.js
const TYPEABLE_TARGET_SELECTOR =
	"input:not([type='hidden']):not([disabled]),textarea:not([disabled]),select:not([disabled]),[contenteditable]:not([contenteditable='false'])";
const PREVENT_TYPE_TO_FOCUS_SELECTOR = "[data-prevent-type-to-focus]";
const OPEN_POPUP_SELECTOR = "[data-open]";
const NON_OVERLAY_OPEN_POPUP_SELECTOR = '[data-slot="collapsible-content"]';

function isElement(target: EventTarget | null): target is Element {
	return target instanceof Element;
}

export function isEditableEventTarget(target: EventTarget | null) {
	if (!isElement(target)) {
		return false;
	}

	return Boolean(target.closest(TYPEABLE_TARGET_SELECTOR));
}

export function isOpenPopupInteractionTarget(target: EventTarget | null) {
	if (!isElement(target)) {
		return false;
	}

	const openPopup = target.closest(OPEN_POPUP_SELECTOR);
	if (!openPopup || openPopup.matches(NON_OVERLAY_OPEN_POPUP_SELECTOR)) {
		return false;
	}

	return true;
}

export function eventTargetsPreventTypeToFocus(event: KeyboardEvent) {
	for (const node of event.composedPath()) {
		if (!isElement(node)) {
			continue;
		}

		if (
			node.closest(PREVENT_TYPE_TO_FOCUS_SELECTOR) ||
			isEditableEventTarget(node) ||
			isOpenPopupInteractionTarget(node)
		) {
			return true;
		}
	}

	return false;
}
