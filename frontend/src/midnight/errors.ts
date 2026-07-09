// midnight-js-contracts wraps failures in generic messages like
// "Unexpected error submitting scoped transaction '<unnamed>': Error"
// with the real cause nested in `.cause` (sometimes several layers deep).
// This walks the chain so the UI can show something actionable instead of
// the outermost wrapper text.
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message || current.constructor.name);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  // Also dump the full original error to the console for devtools inspection.
  console.error('describeError:', err);
  return parts.join(' <- caused by: ');
}
