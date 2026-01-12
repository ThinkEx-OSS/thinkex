/**
 * Utility functions for extracting markdown content from selected DOM elements
 * This preserves the original markdown formatting when text is selected from rendered content
 */

/**
 * Converts HTML elements back to markdown syntax
 * Handles common markdown elements like headers, bold, italic, code, lists, etc.
 */
function htmlToMarkdown(element: Node): string {
  if (element.nodeType === Node.TEXT_NODE) {
    return element.textContent || '';
  }

  if (element.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = element as Element;
  const tagName = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(htmlToMarkdown).join('');

  switch (tagName) {
    case 'h1':
      return `# ${children}\n\n`;
    case 'h2':
      return `## ${children}\n\n`;
    case 'h3':
      return `### ${children}\n\n`;
    case 'h4':
      return `#### ${children}\n\n`;
    case 'h5':
      return `##### ${children}\n\n`;
    case 'h6':
      return `###### ${children}\n\n`;
    case 'p':
      return `${children}\n\n`;
    case 'strong':
    case 'b':
      return `**${children}**`;
    case 'em':
    case 'i':
      return `*${children}*`;
    case 'code':
      // Check if it's inside a pre element (code block) or inline
      const parent = el.parentElement;
      if (parent && parent.tagName.toLowerCase() === 'pre') {
        return children;
      }
      return `\`${children}\``;
    case 'pre':
      // Extract language from class if available
      const language = el.className.match(/language-(\w+)/)?.[1] || '';
      return `\`\`\`${language}\n${children}\n\`\`\`\n\n`;
    case 'blockquote':
      return `> ${children.replace(/\n/g, '\n> ')}\n\n`;
    case 'ul':
      return `${children}\n`;
    case 'ol':
      return `${children}\n`;
    case 'li':
      const parentList = el.parentElement;
      if (parentList && parentList.tagName.toLowerCase() === 'ol') {
        return `1. ${children}\n`;
      }
      return `- ${children}\n`;
    case 'hr':
      return `---\n\n`;
    case 'a':
      const href = el.getAttribute('href') || '';
      return `[${children}](${href})`;
    case 'br':
      return '\n';
    case 'table':
      return `${children}\n\n`;
    case 'thead':
      return `${children}\n`;
    case 'tbody':
      return `${children}\n`;
    case 'tr':
      return `${children}\n`;
    case 'th':
      return `| ${children} `;
    case 'td':
      return `| ${children} `;
    case 'div':
    case 'span':
      // Handle math blocks - look for katex classes
      if (el.classList.contains('katex-display')) {
        return `$$${children}$$\n\n`;
      }
      if (el.classList.contains('katex')) {
        return `$${children}$`;
      }
      // Handle code blocks with syntax highlighting
      if (el.classList.contains('aui-shiki-base') || el.classList.contains('aui-md-pre')) {
        return children; // Let the pre/code handling take care of it
      }
      // For other divs/spans, just return children without extra formatting
      return children;
    default:
      return children;
  }
}

/**
 * Extracts markdown content from a selected range
 * This function traverses the DOM tree and reconstructs the markdown
 */
export function extractMarkdownFromRange(range: Range): string {
  try {
    // Clone the range to avoid modifying the original
    const clonedRange = range.cloneRange();
    
    // Get the common ancestor container
    const container = clonedRange.commonAncestorContainer;
    
    // If the selection is within a single text node, return the plain text
    if (container.nodeType === Node.TEXT_NODE) {
      return clonedRange.toString();
    }
    
    // Create a document fragment with the selected content
    const contents = clonedRange.cloneContents();
    
    // Convert the HTML content to markdown
    let markdown = '';
    
    // Handle each child node
    for (const child of Array.from(contents.childNodes)) {
      markdown += htmlToMarkdown(child);
    }
    
    // Clean up extra whitespace and newlines
    return markdown
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
      .replace(/^\n+/, '') // Remove leading newlines
      .replace(/\n+$/, '') // Remove trailing newlines
      .replace(/\n\n\n+/g, '\n\n') // Replace multiple consecutive newlines with double newline
      .trim();
      
  } catch (error) {
    console.error('Error extracting markdown from range:', error);
    // Fallback to plain text
    return range.toString();
  }
}

/**
 * Extracts markdown content from selected text
 * This is the main function to use for text selection
 */
export function extractMarkdownFromSelection(): string | null {
  const selection = window.getSelection();
  
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  
  const range = selection.getRangeAt(0);
  const selectedText = range.toString().trim();
  
  if (!selectedText) {
    return null;
  }
  
  return extractMarkdownFromRange(range);
}

/**
 * Extracts markdown content from multiple selected ranges
 * Used for multi-highlight functionality
 */
export function extractMarkdownFromHighlights(highlights: Array<{ text: string; range?: Range }>): string[] {
  return highlights.map(highlight => {
    if (highlight.range) {
      return extractMarkdownFromRange(highlight.range);
    }
    // Fallback to plain text if no range available
    return highlight.text;
  });
}

/**
 * Combines multiple markdown selections into a single markdown document
 * Handles proper spacing and structure for multi-highlight content
 */
export function combineMarkdownSelections(markdownContents: string[]): string {
  if (markdownContents.length === 0) return '';
  if (markdownContents.length === 1) return markdownContents[0];
  
  // Clean up each markdown content
  const cleanedContents = markdownContents.map(content => {
    // Remove excessive whitespace and normalize line endings
    return content
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
      .replace(/^\n+/, '') // Remove leading newlines
      .replace(/\n+$/, '') // Remove trailing newlines
      .trim();
  }).filter(content => content.length > 0); // Remove empty contents
  
  if (cleanedContents.length === 0) return '';
  if (cleanedContents.length === 1) return cleanedContents[0];
  
  // Combine with separators, ensuring proper spacing
  return cleanedContents.join('\n\n---\n\n');
}
