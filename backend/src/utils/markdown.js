/**
 * Content Sanitization Utilities (FAZ 4)
 * Prevents XSS by stripping dangerous HTML from user content
 * Markdown parsing is done on the frontend - backend stores raw content
 */

/**
 * Maximum allowed message length
 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Dangerous HTML patterns to strip
 * Backend stores raw markdown but removes executable HTML
 */
const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
  /<embed[\s\S]*?>/gi,
  /<form[\s\S]*?>[\s\S]*?<\/form>/gi,
  /<link[\s\S]*?>/gi,
  /<meta[\s\S]*?>/gi,
  /<style[\s\S]*?>[\s\S]*?<\/style>/gi,
  /\son\w+\s*=\s*["'][^"']*["']/gi, // onclick=, onerror=, etc
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:[^,]*;base64/gi,
];

/**
 * Sanitize message content
 * Strips dangerous HTML while preserving markdown and safe text
 * @param {string} content - Raw user content
 * @returns {string} Sanitized content
 */
export function sanitizeContent(content) {
  if (typeof content !== 'string') return '';

  let sanitized = content;

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    // Reset regex state (important for global regexes)
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '');
  }

  // Strip remaining HTML tags but preserve their text content
  // This allows markdown to pass through while removing HTML
  sanitized = sanitized.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
    // Allow a small whitelist of safe inline tags for markdown rendering
    const allowedTags = ['b', 'i', 'em', 'strong', 'u', 's', 'del', 'code', 'br'];
    if (allowedTags.includes(tag.toLowerCase())) {
      return match;
    }
    return '';
  });

  return sanitized;
}

/**
 * Validate message content
 * @param {string} content - Message content to validate
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
export function validateMessageContent(content) {
  if (content === undefined || content === null) {
    return { valid: false, error: 'Message content is required' };
  }

  if (typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a string' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message content cannot be empty' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Parse @mentions from message content
 * Format: @username#1234
 * @param {string} content - Message content
 * @returns {Array<{username: string, discriminator: string}>}
 */
export function parseMentions(content) {
  if (!content || typeof content !== 'string') return [];

  const mentionRegex = /@([a-zA-Z0-9_]+)#(\d{4})/g;
  const mentions = [];
  const seen = new Set();
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const username = match[1];
    const discriminator = match[2];
    const key = `${username}#${discriminator}`;

    // Deduplicate mentions
    if (!seen.has(key)) {
      seen.add(key);
      mentions.push({ username, discriminator });
    }
  }

  return mentions;
}

/**
 * Validate emoji for reactions
 * Basic validation - accepts common emoji patterns
 * @param {string} emoji
 * @returns {{ valid: boolean, error?: string, value?: string }}
 */
export function validateEmoji(emoji) {
  if (!emoji || typeof emoji !== 'string') {
    return { valid: false, error: 'Emoji is required' };
  }

  const trimmed = emoji.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Emoji cannot be empty' };
  }

  // Max 32 chars to allow for custom emoji IDs like <:name:123456>
  if (trimmed.length > 32) {
    return { valid: false, error: 'Emoji is too long' };
  }

  // Basic check: must contain at least one non-whitespace character
  // and not contain control characters or HTML
  if (/[<>]/.test(trimmed)) {
    return { valid: false, error: 'Emoji contains invalid characters' };
  }

  return { valid: true, value: trimmed };
}
