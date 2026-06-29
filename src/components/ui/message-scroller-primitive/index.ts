import {
	MessageScrollerButton as Button,
	MessageScrollerContent as Content,
	MessageScrollerItem as Item,
	MessageScrollerProvider as Provider,
	MessageScroller as Root,
	MessageScrollerViewport as Viewport,
} from "./components";

export const MessageScroller = {
	Provider,
	Root,
	Viewport,
	Content,
	Item,
	Button,
};

export type {
	MessageScrollerDefaultScrollPosition,
	MessageScrollerScrollAlign,
	MessageScrollerScrollOptions,
	MessageScrollerScrollable,
} from "./types";
