/**
 * The only form in which a caught error reaches a log line: its name and its
 * code. Never its message — a pg error's message can quote the row that
 * failed, and the import routes must not log screenshot text or row values
 * (see CLAUDE.md, "Never log OCR text, row values or request bodies").
 *
 * `code` is always present, undefined when the error has none, matching the
 * `{ error: error.name, code: error.code }` objects this replaces.
 */
export interface ErrorSummary {
  error: string;
  code: string | undefined;
}

export function errorSummary(e: unknown): ErrorSummary {
  const error = e instanceof Error ? e.name : e === null ? 'null' : typeof e;
  const code = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;
  return { error, code };
}
