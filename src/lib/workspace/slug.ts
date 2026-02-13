
export function generateSlug(name: string): string {
    // 1. Convert to lowercase
    // 2. Replace special chars with spaces (regex like the SQL one: /[^a-z0-9\s-]/g)
    // 3. Trim whitespace
    // 4. Replace spaces with hyphens
    // 5. Deduplicate hyphens
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, ''); // Strip leading/trailing hyphens

    // Enforce max length of 50 total (43 base + 1 hyphen + 6 suffix)
    const truncated = base.substring(0, 43);

    // Use Web Crypto API for better randomness and guaranteed length
    // (fallback to Math.random if crypto not available, though in Node/modern browsers it is)
    const suffix = Math.random().toString(36).substring(2, 8).padEnd(6, '0');

    // If truncated is empty (e.g. name was "!!!"), fallback to 'workspace'
    const finalSlug = truncated || 'workspace';

    return `${finalSlug}-${suffix}`;
}
