export interface AutumnSecretKeyEnv {
	AUTUMN_PROD_SECRET_KEY?: string;
	AUTUMN_SECRET_KEY?: string;
}

/**
 * Which key is present picks the Autumn environment: production holds only
 * AUTUMN_PROD_SECRET_KEY, staging and dev hold only AUTUMN_SECRET_KEY.
 *
 * Deliberately not switched on `import.meta.env.PROD` — Vite sets that for every
 * build, so staging would report into Autumn production. And a deployment that
 * is missing its key returns undefined, which callers treat as "skip tracking":
 * recoverable, unlike silently writing into the wrong environment.
 *
 * Shared so the better-auth plugin and the usage tracker can never disagree
 * about which environment they are talking to.
 */
export function resolveAutumnSecretKey(env: AutumnSecretKeyEnv): string | undefined {
	return env.AUTUMN_PROD_SECRET_KEY?.trim() || env.AUTUMN_SECRET_KEY?.trim() || undefined;
}
