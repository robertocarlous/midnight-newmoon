// Private witness implementation for the browser.
//
// The DApp Connector API deliberately does not expose the wallet's real
// private keys to a webpage - a dApp only ever gets addresses, balances, and
// signing/proving delegation. So the whisper-wall witness (authorSecret)
// uses a *locally generated* secret instead: 32 random bytes, created once
// per connected address and persisted in this browser's localStorage. It
// never leaves this device - the contract only ever sees its one-way hash
// (see contracts/whisper-wall.compact).
const STORAGE_PREFIX = 'whisper-wall:author-secret:';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function getOrCreateAuthorSecret(address: string): Uint8Array {
  const key = `${STORAGE_PREFIX}${address}`;
  const existing = localStorage.getItem(key);
  if (existing) return hexToBytes(existing);

  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  localStorage.setItem(key, bytesToHex(secret));
  return secret;
}

export interface WitnessContextLike {
  privateState: unknown;
}

export function makeWitnesses(address: string) {
  const secret = getOrCreateAuthorSecret(address);
  return {
    authorSecret: (context: WitnessContextLike): [unknown, Uint8Array] => [context.privateState, secret],
  };
}
