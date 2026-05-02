#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ENV_FILES = [
  ".env.development.local",
  ".env.local",
  ".env.development",
  ".env",
];

const REQUIRED_ENV_KEYS = [
  "ZERO_UPSTREAM_DB",
  "ZERO_QUERY_URL",
  "ZERO_MUTATE_URL",
  "ZERO_MUTATE_FORWARD_COOKIES",
  "ZERO_QUERY_FORWARD_COOKIES",
  "ZERO_APP_PUBLICATIONS",
  "ZERO_ADMIN_PASSWORD",
  "ZERO_APP_ID",
  "ZERO_COOKIE_DOMAIN",
  "NEXT_PUBLIC_ZERO_SERVER",
];

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFiles() {
  for (const file of ENV_FILES) {
    const fullPath = resolve(process.cwd(), file);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      if (!key || process.env[key] !== undefined) continue;

      const value = parseEnvValue(trimmed.slice(eqIndex + 1));
      process.env[key] = value;
    }
  }
}

function failMissingEnv(keys) {
  console.error(
    [
      "Zero startup configuration is incomplete.",
      "",
      "Missing required environment variables:",
      ...keys.map((key) => `- ${key}`),
      "",
      "Copy the values from `.env.example` or run `./setup.sh`, then retry `pnpm dev`.",
    ].join("\n"),
  );
  process.exit(1);
}

function spawnZero() {
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const forwardedArgs = process.argv.slice(2);
  if (forwardedArgs[0] === "--") {
    forwardedArgs.shift();
  }
  const args = ["exec", "zero-cache", ...forwardedArgs];
  const child = spawn(pnpmCmd, args, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

const helpRequested = process.argv
  .slice(2)
  .filter((arg) => arg !== "--")
  .some((arg) => arg === "--help" || arg === "-h");

loadEnvFiles();

if (!helpRequested) {
  const missingKeys = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missingKeys.length > 0) {
    failMissingEnv(missingKeys);
  }
}

spawnZero();
