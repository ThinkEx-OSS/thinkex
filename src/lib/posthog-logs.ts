/**
 * PostHog OpenTelemetry logs helper for server-side usage.
 *
 * For API routes, prefer withApiLogging() from @/lib/with-api-logging — it
 * wraps handlers and logs requests automatically.
 *
 * For custom logging (Server Components, lib code), use getPostHogLogger() and
 * flushPostHogLogs() in after() when inside route handlers.
 */

import { loggerProvider } from '../../instrumentation'

const LOGGER_NAME = 'thinkex'

export { loggerProvider }

export function getPostHogLogger() {
  return loggerProvider.getLogger(LOGGER_NAME)
}

export async function flushPostHogLogs() {
  await loggerProvider.forceFlush()
}
