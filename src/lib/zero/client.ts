import { Zero } from "@rocicorp/zero";
import { mutators } from "./mutators";
import { schema } from "./zero-schema.gen";

export interface ZeroContext {
  userId: string;
}

const appURL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function createZeroInstance(params: { userId: string }) {
  return new Zero({
    schema,
    cacheURL: process.env.NEXT_PUBLIC_ZERO_SERVER!,
    mutateURL: `${appURL}/api/zero/mutate`,
    queryURL: `${appURL}/api/zero/query`,
    userID: params.userId,
    context: {
      userId: params.userId,
    },
    mutators,
  });
}

let zeroInstance: ReturnType<typeof createZeroInstance> | null = null;
let zeroUserId: string | null = null;

export function destroyZero() {
  if (!zeroInstance) {
    return;
  }

  void zeroInstance.close();
  zeroInstance = null;
  zeroUserId = null;
}

export function getZero(params: { userId: string }) {
  if (!zeroInstance || zeroUserId !== params.userId) {
    destroyZero();
    zeroInstance = createZeroInstance(params);
    zeroUserId = params.userId;
    return zeroInstance;
  }

  return zeroInstance;
}

export type ZeroInstance = ReturnType<typeof getZero>;
