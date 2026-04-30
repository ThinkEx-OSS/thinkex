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

export function destroyZero() {
  if (!zeroInstance) return;
  void zeroInstance.close();
  zeroInstance = null;
  zeroUserId = null;
}

/**
 * Returns the active Zero client for `userId`. If the user changed (logout,
 * anonymous → authed, swap), tears down the previous client first so its
 * in-flight requests can't race the new session cookie.
 */
export function getZero(params: { userId: string }) {
  if (zeroInstance && zeroUserId !== params.userId) destroyZero();
  if (!zeroInstance) {
    zeroInstance = createZeroInstance(params);
    zeroUserId = params.userId;
  }
  return zeroInstance;
}

export type ZeroInstance = ReturnType<typeof getZero>;
