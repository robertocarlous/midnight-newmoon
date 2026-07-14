import { useState } from 'react';

function shorten(value: string, head = 10, tail = 8): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

/** A monospace value with a click-to-copy affordance. Truncates long hex/address strings by default. */
export function CopyableCode({ value, full = false, className = '' }: { value: string; full?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) - fail quietly.
    }
  };

  return (
    <button type="button" className={`copyable ${className}`} onClick={handleCopy} title={value}>
      <code>{full ? value : shorten(value)}</code>
      <span className="copyable__hint">{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  );
}
