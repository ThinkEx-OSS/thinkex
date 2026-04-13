import { NextRequest, NextResponse } from "next/server";
import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { getZeroContext } from "@/lib/zero/auth";
import { queries } from "@/lib/zero/queries";
import { schema } from "@/lib/zero/zero-schema.gen";

export async function POST(request: NextRequest) {
  const ctx = await getZeroContext(request);

  const result = await handleQueryRequest(
    (name, args) => mustGetQuery(queries, name).fn({ args, ctx }),
    schema,
    request,
  );

  return NextResponse.json(result);
}
