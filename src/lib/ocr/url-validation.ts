function addEnvHost(hosts: Set<string>, value: string | undefined) {
  if (!value) return;
  try {
    hosts.add(new URL(value).hostname);
  } catch {
    // Ignore invalid env var values.
  }
}

export function getAllowedOcrFileHosts(): string[] {
  const hosts = new Set<string>();
  addEnvHost(hosts, process.env.NEXT_PUBLIC_SUPABASE_URL);
  addEnvHost(hosts, process.env.NEXT_PUBLIC_APP_URL);

  if (process.env.NODE_ENV === "development") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }

  return Array.from(hosts);
}

export function isAllowedOcrFileUrl(fileUrl: string): boolean {
  try {
    const parsedUrl = new URL(fileUrl);
    return getAllowedOcrFileHosts().some(
      (host) =>
        parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}
