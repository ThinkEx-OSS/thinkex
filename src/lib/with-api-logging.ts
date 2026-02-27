import { SeverityNumber } from "@opentelemetry/api-logs";
import { after } from "next/server";
import { getPostHogLogger, flushPostHogLogs } from "@/lib/posthog-logs";

/** Supports Request or NextRequest as first arg (NextRequest extends Request) */
type RouteHandler<
  TArgs extends [Request, ...unknown[]],
  TReturn = Response
> = (...args: TArgs) => Promise<TReturn>;

type LogAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Wraps an API route handler to log requests to PostHog OpenTelemetry.
 * Extracts endpoint and method from the request; registers flush in after().
 *
 * @example
 * ```ts
 * // Simple usage
 * export const GET = withApiLogging(async (req) => {
 *   return NextResponse.json({ data: [] });
 * });
 *
 * // With existing withErrorHandling
 * export const GET = withErrorHandling(
 *   withApiLogging(handleGET),
 *   "GET /api/workspaces"
 * );
 *
 * // With custom attributes
 * export const POST = withApiLogging(handlePOST, {
 *   getAttributes: (req, ctx) => ({ workspaceId: ctx?.params?.id }),
 * });
 * ```
 */
export function withApiLogging<
  TArgs extends [Request, ...unknown[]],
  TReturn = Response
>(
  handler: RouteHandler<TArgs, TReturn>,
  options?: {
    /** Override endpoint (default: from req.url pathname) */
    endpoint?: string;
    /** Add custom attributes to the log (sync only; for dynamic use getAttributes) */
    attributes?: LogAttributes;
    /** Async fn to add dynamic attributes from request/context */
    getAttributes?: (...args: TArgs) => Promise<LogAttributes> | LogAttributes;
  }
): RouteHandler<TArgs, TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const [req] = args;
    const path = options?.endpoint ?? new URL(req.url).pathname;
    const method = req.method;

    const baseAttrs: LogAttributes = { endpoint: path, method };
    const customAttrs = options?.attributes ?? {};
    const dynamicAttrs = options?.getAttributes
      ? await Promise.resolve(options.getAttributes(...args))
      : {};

    getPostHogLogger().emit({
      body: `${method} ${path}`,
      severityNumber: SeverityNumber.INFO,
      attributes: { ...baseAttrs, ...customAttrs, ...dynamicAttrs },
    });

    after(async () => {
      await flushPostHogLogs();
    });

    return handler(...args);
  };
}
