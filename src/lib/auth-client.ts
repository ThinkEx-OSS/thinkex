import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
	plugins: [anonymousClient(), oauthProviderClient()],
	sessionOptions: {
		refetchInterval: 0,
		refetchOnWindowFocus: false,
		refetchWhenOffline: false,
	},
});
