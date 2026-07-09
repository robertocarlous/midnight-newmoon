// midnight-js-contracts wraps failures in generic messages like
// "Unexpected error submitting scoped transaction '<unnamed>': Error"
// with the real cause nested in `.cause` (sometimes several layers deep).
// Deeper still, some of those causes come from the `effect` library's Cause
// objects, which aren't plain Errors and don't stringify to anything useful
// via `String()` (just "[object Object]") - they need their own fields
// (_tag, error, defect, etc.) picked out explicitly.
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const json = JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return `${v}n`;
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    });
    return json && json !== '{}' ? json : '';
  } catch {
    return '';
  }
}

function describeOne(current: unknown): { text: string; next: unknown } {
  if (current instanceof Error) {
    const withCause = current as Error & { cause?: unknown };
    const extra = safeStringify({ ...current });
    const message = current.message || current.constructor.name;
    return {
      text: extra && extra !== '{}' ? `${message} ${extra}` : message,
      next: withCause.cause,
    };
  }
  if (current && typeof current === 'object') {
    const obj = current as Record<string, unknown>;
    const tag = typeof obj._tag === 'string' ? obj._tag : undefined;
    const dump = safeStringify(current);
    const text = [tag, dump || String(current)].filter(Boolean).join(': ');
    // Effect Cause-like shapes nest the real failure under `error` or `defect`.
    return { text, next: obj.error ?? obj.defect ?? obj.cause };
  }
  return { text: String(current), next: undefined };
}

export function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const { text, next } = describeOne(current);
    parts.push(text);
    current = next;
  }
  // Also dump the full original error to the console for devtools inspection.
  console.error('describeError:', err);
  return parts.join(' <- caused by: ');
}
