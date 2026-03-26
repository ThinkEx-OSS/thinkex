import type { Instrumentation } from "next";
import { BraintrustExporter } from "@braintrust/otel";
import { registerOTel } from "@vercel/otel";
import {
  capturePostHogServerException,
  flushPostHogServer,
} from "@/lib/posthog-server";

export function register() {
  registerOTel({
    serviceName: "thinkex",
    traceExporter: new BraintrustExporter({
      parent: "project_name:thinkex",
      filterAISpans: true,
    }),
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
