import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [anonymousClient()],
	sessionOptions: {
		refetchInterval: 0,
		refetchOnWindowFocus: false,
		refetchWhenOffline: false,
	},
});
