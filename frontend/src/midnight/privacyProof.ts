// The observable privacy behavior: recompute persistentHash(authorSecret)
// locally, in the browser, using the exact same primitive the circuit uses
// (see contracts/whisper-wall.compact), and compare it against the public
// lastAuthorCommitment read from chain.
//
// This proves "the connected wallet authored the last post" without the
// secret ever being sent anywhere - not to the contract, not to the
// indexer, not even to this comparison function's caller. Only the boolean
// result is - the same asymmetry the contract enforces on-chain, replayed
// client-side for display purposes.
import { persistentHash, Bytes32Descriptor } from '@midnight-ntwrk/compact-runtime';
import { getOrCreateAuthorSecret } from './witnesses';

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Returns true if `onChainCommitment` matches the hash of this browser's
 * locally-held author secret for `address` - i.e. whether the connected
 * wallet is provably the author of the post that produced that commitment.
 */
export function provesAuthorship(address: string, onChainCommitment: Uint8Array): boolean {
  const secret = getOrCreateAuthorSecret(address);
  const computed = persistentHash(Bytes32Descriptor, secret);
  return bytesEqual(computed, onChainCommitment);
}
