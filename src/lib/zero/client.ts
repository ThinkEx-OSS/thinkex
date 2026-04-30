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

/** `Zero.close()` is async; await this when overlap matters (e.g. reset()). */
export function destroyZero(): Promise<void> {
  const inst = zeroInstance;
  if (!inst) return Promise.resolve();
  zeroInstance = null;
  zeroUserId = null;
  return inst.close();
}

/** Returns the active client for `userId`, swapping it out on user change. */
export function getZero(params: { userId: string }) {
  if (zeroInstance && zeroUserId !== params.userId) void destroyZero();
  if (!zeroInstance) {
    zeroInstance = createZeroInstance(params);
    zeroUserId = params.userId;
  }
  return zeroInstance;
}

export type ZeroInstance = ReturnType<typeof getZero>;
