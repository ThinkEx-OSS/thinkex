import { env as workerEnv } from "cloudflare:workers";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { anonymous } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { sql } from "drizzle-orm";

import {
	purgeUserAccountResources,
	transferLinkedAccountResources,
} from "#/features/workspaces/durable-object-lifecycle";
import { sendDeleteAccountVerificationEmail } from "#/features/account/account-deletion-email";
import * as schema from "#/db/schema";
import { createDbContext } from "#/db/server";
import { getAuthBaseURL, getTrustedAppOrigins } from "#/lib/app-origin";

const isProduction = import.meta.env.PROD;

type AuthEnvKey = "BETTER_AUTH_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET";

type AuthRuntimeEnv = Record<AuthEnvKey, string | undefined>;
type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

function getEnvString(name: AuthEnvKey) {
	const value = workerEnv[name];
	return value?.trim() || undefined;
}

function getAuthRuntimeEnv(): AuthRuntimeEnv {
	return {
		BETTER_AUTH_SECRET: getEnvString("BETTER_AUTH_SECRET"),
		GOOGLE_CLIENT_ID: getEnvString("GOOGLE_CLIENT_ID"),
		GOOGLE_CLIENT_SECRET: getEnvString("GOOGLE_CLIENT_SECRET"),
	};
}

function getAuthSecret(env: AuthRuntimeEnv) {
	const secret = env.BETTER_AUTH_SECRET;

	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET is not configured. Set it before enabling authentication.");
	}

	return secret;
}

async function transferAnonymousUserData(
	database: Db,
	input: { anonymousUserId: string; newUserId: string },
) {
	if (input.anonymousUserId === input.newUserId) {
		return;
	}

	await database.batch([
		database.run(sql`
			update ${schema.workspaceMembers}
			set role = 'owner', updated_at = unixepoch()
			where user_id = ${input.newUserId}
				and workspace_id in (
					select id from ${schema.workspaces}
					where owner_id = ${input.anonymousUserId}
				)
		`),
		database.run(sql`
			update workspace_members as linked_member
			set
				role = case
					when linked_member.role = 'owner'
						or (
							select anonymous_member.role
							from workspace_members anonymous_member
							where anonymous_member.workspace_id = linked_member.workspace_id
								and anonymous_member.user_id = ${input.anonymousUserId}
						) = 'owner' then 'owner'
					when linked_member.role = 'admin'
						or (
							select anonymous_member.role
							from workspace_members anonymous_member
							where anonymous_member.workspace_id = linked_member.workspace_id
								and anonymous_member.user_id = ${input.anonymousUserId}
						) = 'admin' then 'admin'
					when linked_member.role = 'editor'
						or (
							select anonymous_member.role
							from workspace_members anonymous_member
							where anonymous_member.workspace_id = linked_member.workspace_id
								and anonymous_member.user_id = ${input.anonymousUserId}
						) = 'editor' then 'editor'
					else 'viewer'
				end,
				last_opened_at = case
					when linked_member.last_opened_at is null then (
						select anonymous_member.last_opened_at
						from workspace_members anonymous_member
						where anonymous_member.workspace_id = linked_member.workspace_id
							and anonymous_member.user_id = ${input.anonymousUserId}
					)
					when (
						select anonymous_member.last_opened_at
						from workspace_members anonymous_member
						where anonymous_member.workspace_id = linked_member.workspace_id
							and anonymous_member.user_id = ${input.anonymousUserId}
					) is null then linked_member.last_opened_at
					when linked_member.last_opened_at >= (
						select anonymous_member.last_opened_at
						from workspace_members anonymous_member
						where anonymous_member.workspace_id = linked_member.workspace_id
							and anonymous_member.user_id = ${input.anonymousUserId}
					) then linked_member.last_opened_at
					else (
						select anonymous_member.last_opened_at
						from workspace_members anonymous_member
						where anonymous_member.workspace_id = linked_member.workspace_id
							and anonymous_member.user_id = ${input.anonymousUserId}
					)
				end,
				updated_at = unixepoch()
			where linked_member.user_id = ${input.newUserId}
				and exists (
					select 1
					from workspace_members anonymous_member
					where anonymous_member.workspace_id = linked_member.workspace_id
						and anonymous_member.user_id = ${input.anonymousUserId}
				)
		`),
		database.run(sql`
			delete from ${schema.workspaceMembers}
			where user_id = ${input.anonymousUserId}
				and exists (
					select 1
					from ${schema.workspaceMembers} existing_member
					where existing_member.workspace_id = ${schema.workspaceMembers.workspaceId}
						and existing_member.user_id = ${input.newUserId}
				)
		`),
		database.run(sql`
			update ${schema.workspaceMembers}
			set user_id = ${input.newUserId}, updated_at = unixepoch()
			where user_id = ${input.anonymousUserId}
		`),
		database.run(sql`
			update ${schema.workspaces}
			set owner_id = ${input.newUserId}, updated_at = unixepoch()
			where owner_id = ${input.anonymousUserId}
		`),
		database.run(sql`
			update ${schema.workspaceInvites}
			set created_by_user_id = ${input.newUserId}, updated_at = unixepoch()
			where created_by_user_id = ${input.anonymousUserId}
		`),
	]);
}

function createAuth(database: Db, env: AuthRuntimeEnv) {
	const baseURL = getAuthBaseURL();

	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "sqlite",
			schema,
		}),
		secret: getAuthSecret(env),
		baseURL,
		trustedOrigins: getTrustedAppOrigins(typeof baseURL === "string" ? baseURL : baseURL.fallback),
		session: {
			expiresIn: 60 * 60 * 24 * 90,
			updateAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
			},
		},
		rateLimit: {
			enabled: isProduction,
			storage: "memory",
		},
		advanced: {
			ipAddress: {
				ipAddressHeaders: ["cf-connecting-ip"],
			},
		},
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID || "",
				clientSecret: env.GOOGLE_CLIENT_SECRET || "",
				prompt: "select_account",
			},
		},
		plugins: [
			anonymous({
				emailDomainName: "anonymous.thinkex.app",
				generateName: () => "Guest",
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					const transferInput = {
						anonymousUserId: anonymousUser.user.id,
						newUserId: newUser.user.id,
					};

					await transferAnonymousUserData(database, transferInput);
					await transferLinkedAccountResources(transferInput);
				},
			}),
			tanstackStartCookies(),
		],
		user: {
			deleteUser: {
				enabled: true,
				sendDeleteAccountVerification: async ({ user, url }) => {
					const result = await sendDeleteAccountVerificationEmail({
						email: user.email,
						url,
					});

					if (result.ok) {
						return;
					}

					const message =
						result.reason === "missing_binding"
							? "Account deletion email is not configured."
							: "Unable to send account deletion email right now.";

					throw APIError.fromStatus("INTERNAL_SERVER_ERROR", { message });
				},
				beforeDelete: async (user) => {
					await purgeUserAccountResources(user.id);
				},
			},
		},
	});
}

export async function withAuth<T>(run: (auth: ReturnType<typeof createAuth>) => Promise<T>) {
	const dbContext = await createDbContext();
	const auth = createAuth(dbContext.db, getAuthRuntimeEnv());

	try {
		return await run(auth);
	} finally {
		await dbContext.dispose();
	}
}
