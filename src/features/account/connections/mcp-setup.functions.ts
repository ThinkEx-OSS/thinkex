import { createServerFn } from "@tanstack/react-start";

import { getMcpResourceUrl } from "#/lib/app-origin";

export const getMcpServerUrlFn = createServerFn({ method: "GET" }).handler(async () =>
	getMcpResourceUrl(),
);
