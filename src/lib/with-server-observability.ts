import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  capturePostHogServerEvent,
  capturePostHogServerException,
  flushPostHogServer,
} from "@/lib/posthog-server";

type RouteHandler<TArgs extends [Request, ...unknown[]]> = (
  ...args: TArgs
) => Promise<Response>;

type ObservabilityProperties = Record<string, string | number | boolean | undefined>;

type ObservabilityMetadata = {
  distinctId?: string;
  properties?: ObservabilityProperties;
};

export type ServerObservabilityOptions<
  TArgs extends [Request, ...unknown[]],
> = {
  routeName: string;
  getMetadata?: (...args: TArgs) => Promise<ObservabilityMetadata> | ObservabilityMetadata;
};

function getResponseStatus(response: Response | undefined): number | undefined {
  return response?.status;
}

export function withServerObservability<
  TArgs extends [Request, ...unknown[]],
>(
  handler: RouteHandler<TArgs>,
  options: ServerObservabilityOptions<TArgs>,
): RouteHandler<TArgs> {
  return async (...args: TArgs): Promise<Response> => {
    const [request] = args;
    const startedAt = Date.now();
    const method = request.method;
    const path = new URL(request.url).pathname;
    const metadata =
      options.getMetadata ? await Promise.resolve(options.getMetadata(...args)) : undefined;

    after(async () => {
      await flushPostHogServer();
    });

    try {
      const response = await handler(...args);

      capturePostHogServerEvent("server_request", {
        distinctId: metadata?.distinctId,
        properties: {
          route_name: options.routeName,
          method,
          path,
          status: getResponseStatus(response),
          duration_ms: Date.now() - startedAt,
          ...metadata?.properties,
        },
      });

      return response;
    } catch (error) {
      if (error instanceof Response) {
        capturePostHogServerEvent("server_request", {
          distinctId: metadata?.distinctId,
          properties: {
            route_name: options.routeName,
            method,
            path,
            status: error.status,
            duration_ms: Date.now() - startedAt,
            ...metadata?.properties,
          },
        });

        return error;
      }

      capturePostHogServerException(error, {
        distinctId: metadata?.distinctId,
        properties: {
          route_name: options.routeName,
          method,
          path,
          duration_ms: Date.now() - startedAt,
          ...metadata?.properties,
        },
      });

      capturePostHogServerEvent("server_request", {
        distinctId: metadata?.distinctId,
        properties: {
          route_name: options.routeName,
          method,
          path,
          status: 500,
          duration_ms: Date.now() - startedAt,
          failed: true,
          ...metadata?.properties,
        },
      });

      console.error(`Error in ${options.routeName}:`, error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
