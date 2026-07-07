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
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
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
 * Builds a ProofProvider for the deployed dApp to prove transactions with.
 *
 * Ideally this would delegate proving to the connected wallet
 * (`getProvingProvider`), so the deployed frontend would need no
 * proof-server of its own. As of writing, though, Lace's DApp Connector API
 * doesn't implement `getProvingProvider` for Preprod (calling it throws
 * "getProvingProvider is not a function"), and the publicly documented
 * remote proof-server for Preprod doesn't resolve either - a known issue
 * (see the Midnight forum). So this prefers wallet-delegated proving if a
 * future Lace version supports it, and otherwise falls back to a
 * proof-server reachable from the browser - by default the same
 * docker-compose proof-server the root CLI uses, running on the user's own
 * machine at http://localhost:6300.
 */
export async function makeProofProvider(
  api: ConnectedAPI,
  zkConfigProvider: FetchZkConfigProvider<string>,
  fallbackProofServerUrl: string,
): Promise<ProofProvider> {
  if (typeof (api as unknown as { getProvingProvider?: unknown }).getProvingProvider === 'function') {
    try {
      const provingProvider = await api.getProvingProvider({
        getZKIR: (loc) => zkConfigProvider.getZKIR(loc),
        getProverKey: (loc) => zkConfigProvider.getProverKey(loc),
        getVerifierKey: (loc) => zkConfigProvider.getVerifierKey(loc),
      });
      return createProofProvider(provingProvider);
    } catch {
      // Fall through to the local proof-server below.
    }
  }
  return httpClientProofProvider(fallbackProofServerUrl, zkConfigProvider);
}
