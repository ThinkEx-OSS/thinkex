/**
 * Processes message content to extract a title and clean up the content
 * Similar to how the createNote tool processes input
 */

export interface ProcessedContent {
  title: string;
  content: string;
}

/**
 * Processes message content to extract a title and clean up the content
 * Replicates the behavior of the createNote tool
 */
export function processMessageContent(rawContent: string): ProcessedContent {
  // If the content is empty, return defaults
  if (!rawContent || !rawContent.trim()) {
    return { title: "New Note", content: "" };
  }

  let title: string;
  let content = rawContent.trim();

  // Try to find a markdown header in the first few lines
  const headerMatch = content.match(/^#+\s+(.+)$/m);
  if (headerMatch) {
    // Use the first header as the title
    title = headerMatch[1].trim();
    // Remove the header from the content
    content = content.replace(/^#+\s+.*$\n?/m, '').trim();
  } else {
    // No header found, use first line as title
    const firstLineBreak = content.indexOf("\n");
    if (firstLineBreak !== -1) {
      title = content.substring(0, firstLineBreak).trim();
      content = content.substring(firstLineBreak + 1).trim();
    } else {
      // Single line of content
      title = content || "New Note";
      content = "";
    }
  }

  // Clean up the title (remove any markdown formatting)
  title = title
    .replace(/^#+\s*/, '') // Remove any remaining markdown headers
    .replace(/\*\*|__|~~|`/g, '') // Remove markdown formatting
    .trim();

  // Limit title length
  title = title.substring(0, 100);

  // Clean up the content
  if (content) {
    // Remove any leading header that matches the title (safety measure)
    const titleEscaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerPattern = new RegExp(`^#+\\s+${titleEscaped}\\s*$\\n?`, 'im');
    content = content.replace(headerPattern, '');
    
    // Also remove if title appears as first line (without markdown header)
    const firstLinePattern = new RegExp(`^${titleEscaped}\\s*$\\n?`, 'im');
    if (content.match(firstLinePattern)) {
      content = content.replace(firstLinePattern, '');
    }
    
    content = content.trim();
  }

  return {
    title: title || "New Note",
    content: content
  };
}
