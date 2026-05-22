/**
 * Normalizes absolute file paths to be completely consistent across the application.
 * - Converts all backslashes (\) to forward slashes (/)
 * - Ensures Windows drive letters are always uppercase (e.g. c:/ -> C:/)
 * - Trims any surrounding whitespace
 */
export const normalizePath = (filePath: string | null | undefined): string => {
  if (!filePath) return '';
  let normalized = filePath.trim().replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return normalized;
};
