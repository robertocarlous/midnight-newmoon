// Bridges the Midnight DApp Connector API's ConnectedAPI (Lace's public
// surface for webpages) to the ContractProviders shape midnight-js-contracts
// expects (WalletProvider + MidnightProvider + ProofProvider). The two APIs
// don't line up 1:1: the connector API works with hex-encoded, bech32m
// addresses and delegates proving to the wallet, while midnight-js-contracts
// works with typed Transaction objects and a local key-material provider.
import { Buffer } from 'buffer';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Transaction, type FinalizedTransaction } from '@midnight-ntwrk/ledger-v8';
import { createProofProvider, type ProofProvider } from '@midnight-ntwrk/midnight-js-types';
import type { WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import type { MidnightProvider } from '@midnight-ntwrk/midnight-js-types';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { MidnightBech32m, ShieldedCoinPublicKey, ShieldedEncryptionPublicKey } from '@midnight-ntwrk/wallet-sdk-address-format';

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/**
 * Resolves the wallet's shielded coin/encryption public keys (bech32m,
 * as returned by the connector API) into the raw hex form the ledger/proof
 * layer expects.
 */
async function resolveShieldedKeys(api: ConnectedAPI, networkId: string) {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses();
  const coinPublicKey = ShieldedCoinPublicKey.codec.decode(networkId, MidnightBech32m.parse(shieldedCoinPublicKey)).toHexString();
  const encryptionPublicKey = ShieldedEncryptionPublicKey.codec
    .decode(networkId, MidnightBech32m.parse(shieldedEncryptionPublicKey))
    .toHexString();
  return { coinPublicKey, encryptionPublicKey };
}

export async function makeWalletAndMidnightProvider(
  api: ConnectedAPI,
  networkId: string,
): Promise<WalletProvider & MidnightProvider> {
  const { coinPublicKey, encryptionPublicKey } = await resolveShieldedKeys(api, networkId);

  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,

    async balanceTx(tx, ttl?: Date) {
      void ttl; // the connector API doesn't take a TTL hint; the wallet applies its own.
      const hex = bytesToHex(tx.serialize());
      const { tx: balancedHex } = await api.balanceUnsealedTransaction(hex);
      const balanced = Transaction.deserialize('signature', 'proof', 'binding', hexToBytes(balancedHex));
      return balanced as unknown as FinalizedTransaction;
    },

    async submitTx(tx) {
      const hex = bytesToHex(tx.serialize());
      await api.submitTransaction(hex);
      return tx.identifiers()[0];
    },
  };
}

/**
 * Builds a ProofProvider that delegates proof generation to the connected
 * wallet (`getProvingProvider`) instead of talking to a local proof-server.
 * This is what makes the deployed frontend work without hosting a
 * proof-server reachable from the browser: proving happens wallet-side.
 */
export async function makeWalletProofProvider(
  api: ConnectedAPI,
  zkConfigProvider: FetchZkConfigProvider<string>,
): Promise<ProofProvider> {
  const provingProvider = await api.getProvingProvider({
    getZKIR: (loc) => zkConfigProvider.getZKIR(loc),
    getProverKey: (loc) => zkConfigProvider.getProverKey(loc),
    getVerifierKey: (loc) => zkConfigProvider.getVerifierKey(loc),
  });
  return createProofProvider(provingProvider);
}
