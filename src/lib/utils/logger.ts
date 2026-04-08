/**
 * Debug Logger Utility
 * 
 * Centralized logging with environment-aware behavior:
 * - Development: All logs enabled
 * - Production (when disableInProduction): debug/info/warn off; errors still go to console
 * 
 * Usage:
 *   import { logger } from '@/lib/utils/logger';
 *   logger.debug('[COMPONENT]', 'Debug message', data);
 *   logger.info('[API]', 'Info message');
 *   logger.warn('[HOOK]', 'Warning message');
 *   logger.error('[ERROR]', 'Error message', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  // In production, suppress verbose logs; errors still log (e.g. Vercel / stderr)
  disableInProduction: boolean;
}

const config: LoggerConfig = {
  enabled: true, // Enable logging for development
  level: 'debug',
  disableInProduction: true, // Quiet prod: no debug/info/warn; errors still log
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (config.disableInProduction && process.env.NODE_ENV === "production") {
      return level === "error";
    }
    
    if (!config.enabled && level !== 'error') {
      return false;
    }
    
    return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(...args);
    }
  }

  // Helper for grouped logs (collapsible in dev tools)
  group(label: string, collapsed = false): void {
    if (this.shouldLog('debug')) {
      if (collapsed) {
        console.groupCollapsed(label);
      } else {
        console.group(label);
      }
    }
  }

  groupEnd(): void {
    if (this.shouldLog('debug')) {
      console.groupEnd();
    }
  }

  // Helper for timing operations
  time(label: string): void {
    if (this.shouldLog('debug')) {
      console.time(label);
    }
  }

  timeEnd(label: string): void {
    if (this.shouldLog('debug')) {
      console.timeEnd(label);
    }
  }

  // Helper for tables (useful for arrays of objects)
  table(data: unknown): void {
    if (this.shouldLog('debug')) {
      console.table(data);
    }
  }
}

export const logger = new Logger();

// Export config for runtime adjustments (useful for debugging in production)
export const setLoggerConfig = (newConfig: Partial<LoggerConfig>) => {
  Object.assign(config, newConfig);
};

