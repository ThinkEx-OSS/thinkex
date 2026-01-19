
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
        .replace(/-+/g, '-');

    // Enforce max length of 50 to match potential DB constraints (though text is usually unlimited, good practice)
    const truncated = base.substring(0, 50);

    // Append a short random suffix to ensure uniqueness without DB round-trips
    // 4 chars of entropy is usually enough for per-user uniqueness collision avoidance
    // Math.random base 36 is simple
    const suffix = Math.random().toString(36).substring(2, 6);

    // If truncated is empty (e.g. name was "!!!"), fallback to 'workspace'
    const finalSlug = truncated || 'workspace';

    return `${finalSlug}-${suffix}`;
}
