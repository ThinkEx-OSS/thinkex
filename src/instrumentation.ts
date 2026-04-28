import type { Instrumentation } from "next";
import { TCCSpanProcessor } from "@contextcompany/otel";
import { registerOTel } from "@vercel/otel";
import {
  capturePostHogServerException,
  flushPostHogServer,
} from "@/lib/posthog-server";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  registerOTel({
    serviceName: "thinkex",
    spanProcessors: [
      "auto",
      ...(process.env.TCC_API_KEY
        ? [
            new TCCSpanProcessor({
              debug: false,
              otlpUrl: "https://ingest.thecontext.company",
            }),
          ]
        : []),
    ],
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  capturePostHogServerException(error, {
    properties: {
      source: "instrumentation.onRequestError",
      path: request.path,
      method: request.method,
      router_kind: context.routerKind,
      route_path: context.routePath,
      route_type: context.routeType,
      render_source: context.renderSource,
      revalidate_reason: context.revalidateReason,
    },
  });

  await flushPostHogServer();
};
