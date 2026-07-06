// Private witness implementation for the whisper-wall contract.
//
// authorSecret() is called locally, inside the prover, whenever a circuit
// needs it - its return value never leaves this process unless a circuit
// explicitly discloses it (or a value derived from it, e.g. a hash).
//
// The secret is derived deterministically from the wallet seed so the same
// wallet always proves as "the same author" without persisting any extra
// private state or ever putting the seed itself on-chain.
import * as crypto from 'node:crypto';

export interface WitnessContextLike {
  privateState: unknown;
}

export function makeWitnesses(seed: string) {
  const secret = crypto.createHash('sha256').update(`${seed}:whisper-wall:author-secret`).digest();

  return {
    authorSecret: (context: WitnessContextLike): [unknown, Uint8Array] => [
      context.privateState,
      new Uint8Array(secret),
    ],
  };
}
