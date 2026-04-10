import { Zero } from "@rocicorp/zero";
import { mutators } from "./mutators";
import { schema } from "./zero-schema.gen";

export interface ZeroContext {
  userId: string | null;
}

function createZeroInstance(params: { userId: string; auth: string }) {
  return new Zero({
    schema,
    cacheURL: process.env.NEXT_PUBLIC_ZERO_SERVER!,
    mutateURL: "/api/zero/mutate",
    userID: params.userId,
    auth: params.auth,
    context: {
      userId: params.userId,
    },
    mutators,
  });
}

let zeroInstance: ReturnType<typeof createZeroInstance> | null = null;
let zeroUserId: string | null = null;
let zeroAuthToken: string | null = null;

export function getZero(params: { userId: string; auth: string }) {
  if (!zeroInstance || zeroUserId !== params.userId) {
    void zeroInstance?.close();
    zeroInstance = createZeroInstance(params);
    zeroUserId = params.userId;
    zeroAuthToken = params.auth;
    return zeroInstance;
  }

  if (zeroAuthToken !== params.auth) {
    zeroAuthToken = params.auth;
    void zeroInstance.connection.connect({ auth: params.auth });
  }

  return zeroInstance;
}

export type ZeroInstance = ReturnType<typeof getZero>;
