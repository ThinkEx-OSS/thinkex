import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { mustGetMutator } from "@rocicorp/zero";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { serverMutators } from "@/lib/zero/server-mutators";
import { schema } from "@/lib/zero/zero-schema.gen";

const dbProvider = zeroDrizzle(schema, db);

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await handleMutateRequest(
    dbProvider,
    async (transact) => {
      return transact(async (tx, name, args) => {
        const mutator = mustGetMutator(serverMutators, name);
        await mutator.fn({
          tx,
          args,
          ctx: {
            userId: session.user.id,
          },
        });
      });
    },
    request,
  );

  return NextResponse.json(result);
}
