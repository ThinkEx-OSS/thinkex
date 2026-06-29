import * as React from "react";

function useLatest<T>(value: T) {
	const ref = React.useRef(value);

	React.useLayoutEffect(() => {
		ref.current = value;
	}, [value]);

	return ref;
}

function composeRefs<T>(
	...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> | undefined {
	const validRefs = refs.filter(Boolean);

	if (validRefs.length === 0) {
		return undefined;
	}

	return (value) => {
		for (const ref of validRefs) {
			if (typeof ref === "function") {
				ref(value);
			} else if (ref) {
				ref.current = value;
			}
		}
	};
}

export { composeRefs, useLatest };
