import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { logs } from '@opentelemetry/api-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'

const posthogHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
const posthogToken =
  process.env.POSTHOG_PROJECT_TOKEN || process.env.NEXT_PUBLIC_POSTHOG_KEY

// Create LoggerProvider outside register() so it can be exported and flushed in route handlers
export const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    'service.name': process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '') || 'thinkex',
  }),
  processors: posthogToken
    ? [
        new BatchLogRecordProcessor(
          new OTLPLogExporter({
            url: `${posthogHost}/i/v1/logs`,
            headers: {
              Authorization: `Bearer ${posthogToken}`,
              'Content-Type': 'application/json',
            },
          })
        ),
      ]
    : [],
})

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && posthogToken) {
    logs.setGlobalLoggerProvider(loggerProvider)
  }
}
