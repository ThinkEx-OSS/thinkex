export type StorageMode = "local" | "supabase";

const ZERO_REQUIRED_MESSAGE =
  "ThinkEx requires Zero for workspace sync in self-hosted development. Set NEXT_PUBLIC_ZERO_SERVER and start the Zero cache server with `pnpm dev`.";

export function getStorageMode(): StorageMode {
  return process.env.STORAGE_TYPE === "supabase" ? "supabase" : "local";
}

export function usesLocalStorage(): boolean {
  return getStorageMode() === "local";
}

export function usesProviderReachableStorage(): boolean {
  return getStorageMode() === "supabase";
}

export function isSupabaseClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export function isSupabaseServerConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getUnsupportedLocalStorageMessage(feature: string): string {
  return `${feature} is unavailable in core self-host mode with local file storage. Configure provider-reachable object storage before using ${feature.toLowerCase()}.`;
}

export function getZeroConfigError(): string | null {
  if (!process.env.NEXT_PUBLIC_ZERO_SERVER?.trim()) {
    return ZERO_REQUIRED_MESSAGE;
  }

  return null;
}
