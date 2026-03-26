import type { Instrumentation } from "next";
import {
  capturePostHogServerException,
  flushPostHogServer,
} from "@/lib/posthog-server";

export function register() {}

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
