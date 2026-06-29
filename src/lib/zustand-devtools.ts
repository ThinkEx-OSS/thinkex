import type { DevtoolsOptions } from "zustand/middleware";

export function zustandDevtoolsOptions(name: string): DevtoolsOptions {
	return {
		name,
		enabled: import.meta.env.DEV,
	};
}
