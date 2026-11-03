/**
 * Safe JSON Parse Utility - FAZ 7 Security Fix
 * Prevents server crashes from malformed JSON in database fields
 */

/**
 * Safely parse JSON string, returns null on failure
 * @param {string} str - JSON string to parse
 * @returns {any|null} - Parsed object or null
 */
export function safeJsonParse(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export default safeJsonParse;
