import { Zero } from "@rocicorp/zero";
import { getZeroConfigError } from "@/lib/self-host-config";
import { mutators } from "./mutators";
import { schema } from "./zero-schema.gen";

export interface ZeroContext {
  userId: string;
}

const appURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function createZeroInstance({ userId }: { userId: string }) {
  const configError = getZeroConfigError();
  if (configError) throw new Error(configError);
  return new Zero({
    schema,
    cacheURL: process.env.NEXT_PUBLIC_ZERO_SERVER!,
    mutateURL: `${appURL}/api/zero/mutate`,
    queryURL: `${appURL}/api/zero/query`,
    userID: userId,
    context: { userId },
    mutators,
  });
}

let zeroInstance: ReturnType<typeof createZeroInstance> | null = null;
let zeroUserId: string | null = null;

/**
 * Tear down the active client. `Zero.close()` is async (Replicache shutdown +
 * WebSocket abort), so callers that *must* avoid overlap (e.g. the explicit
 * `reset()` retry path) should `await` this. The user-swap path inside
 * `getZero` does not await: clients are scoped per-user so any tail-end
 * traffic from the old session can't leak into the new one's data.
 */
export function destroyZero(): Promise<void> {
  const inst = zeroInstance;
  if (!inst) return Promise.resolve();
  zeroInstance = null;
  zeroUserId = null;
  return inst.close();
}

/**
 * Returns the active Zero client for `userId`. If the user changed (logout,
 * anonymous → authed, swap), kicks off teardown of the previous client; the
 * new client is created immediately so the React render that triggered the
 * swap has a value to commit. Brief client-side overlap during the old
 * client's async close is acceptable.
 */
export function getZero(params: { userId: string }) {
  if (zeroInstance && zeroUserId !== params.userId) void destroyZero();
  if (!zeroInstance) {
    zeroInstance = createZeroInstance(params);
    zeroUserId = params.userId;
  }
  return zeroInstance;
}

export type ZeroInstance = ReturnType<typeof getZero>;
