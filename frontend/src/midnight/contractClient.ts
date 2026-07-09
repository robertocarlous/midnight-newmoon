// Wires together every provider needed to deploy/call circuits on the
// whisper-wall contract from the browser, using a connected Lace wallet for
// signing/balancing/proving instead of a local seed.
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import * as WhisperWall from '../generated/whisper-wall/index.js';
import { NETWORK_CONFIGS, PROOF_SERVER_URL, type NetworkId } from './network';
import { makeWalletAndMidnightProvider, makeProofProvider } from './laceProviders';
import { makeWitnesses } from './witnesses';
import { describeError } from './errors';

export interface WhisperWallLedgerState {
  feedbackCount: bigint;
  lastMessage: string;
  lastAuthorCommitment: Uint8Array;
}

export type DustRetryCallback = (attempt: number, maxAttempts: number) => void;

export interface WhisperWallClient {
  postMessage(message: string, onDustRetry?: DustRetryCallback): Promise<{ txId: string }>;
  readLedger(): Promise<WhisperWallLedgerState | null>;
}

// A brand-new (or recently used) wallet's reported DUST balance is a
// time-projection of what its registered NIGHT will eventually generate;
// the tx-builder only spends what the *next block's timestamp* accounts
// for, which can lag wall-clock by roughly a block right after funding or
// registration. That shows up as "Insufficient Funds: could not balance
// dust" even when DUST is genuinely accruing - the same transient failure
// the root CLI's deploy.ts already retries around. This mirrors that.
async function withDustRetry<T>(fn: () => Promise<T>, onRetry?: DustRetryCallback): Promise<T> {
  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 5000;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const description = describeError(err);
      const isDustShortage = /insufficient funds|not enough dust|could not balance dust/i.test(description);
      if (!isDustShortage || attempt === MAX_RETRIES) throw err;
      onRetry?.(attempt, MAX_RETRIES);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error('unreachable');
}

const ZK_BASE_URL = `${window.location.origin}/managed/whisper-wall`;

async function buildProviders(api: ConnectedAPI, networkId: NetworkId) {
  setNetworkId(networkId);

  const config = await api.getConfiguration().catch(() => null);
  const fallback = NETWORK_CONFIGS[networkId];
  const indexer = config?.indexerUri ?? fallback.indexer;
  const indexerWS = config?.indexerWsUri ?? fallback.indexerWS;

  // Explicit native fetch: FetchZkConfigProvider defaults to cross-fetch,
  // whose environment detection can pick its Node (node-fetch) code path
  // instead of the browser one once vite-plugin-node-polyfills is active,
  // silently breaking the zk-asset fetch (surfaced as an opaque
  // "Failed to read verifier key for whisper-wall#submitFeedback").
  // Binding the real browser fetch sidesteps that detection entirely.
  const zkConfigProvider = new FetchZkConfigProvider<string>(ZK_BASE_URL, window.fetch.bind(window));
  const { unshieldedAddress } = await api.getUnshieldedAddress();
  const witnesses = makeWitnesses(unshieldedAddress);

  const compiledContract = CompiledContract.make('whisper-wall', WhisperWall.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as any),
    CompiledContract.withCompiledFileAssets(ZK_BASE_URL),
  );

  const walletAndMidnightProvider = await makeWalletAndMidnightProvider(api, networkId);
  const proofProvider = await makeProofProvider(api, zkConfigProvider, PROOF_SERVER_URL);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'whisper-wall-state',
      accountId: unshieldedAddress,
      // No real secret is stored via this provider (our witness derives its
      // secret from localStorage, see witnesses.ts) - the SDK still requires
      // a password with >=16 chars AND >=3 of {upper, lower, digit, special}
      // to open the local store.
      privateStoragePasswordProvider: () => 'Whisper-Wall-Browser-Store-9!',
    }),
    // Explicit webSocketImpl: the package defaults to the `ws` package's
    // WebSocket, which doesn't exist in a browser bundle (it resolves to
    // undefined there) - the browser's native WebSocket global replaces it.
    publicDataProvider: indexerPublicDataProvider(indexer, indexerWS, WebSocket as any),
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };

  return { providers, compiledContract };
}

function wrapDeployed(deployed: any, contractAddress: string, providers: any): WhisperWallClient {
  return {
    async postMessage(message: string, onDustRetry?: DustRetryCallback) {
      const tx = await withDustRetry<any>(() => deployed.callTx.submitFeedback(message), onDustRetry);
      return { txId: tx.public.txId as string };
    },
    async readLedger() {
      const state = await providers.publicDataProvider.queryContractState(contractAddress);
      if (!state) return null;
      const ledger = WhisperWall.ledger(state.data);
      return {
        feedbackCount: ledger.feedbackCount,
        lastMessage: ledger.lastMessage,
        lastAuthorCommitment: ledger.lastAuthorCommitment,
      };
    },
  };
}

export async function connectWhisperWallClient(
  api: ConnectedAPI,
  contractAddress: string,
  networkId: NetworkId,
): Promise<WhisperWallClient> {
  const { providers, compiledContract } = await buildProviders(api, networkId);
  const deployed: any = await findDeployedContract(providers, {
    compiledContract: compiledContract as any,
    contractAddress,
  });
  return wrapDeployed(deployed, contractAddress, providers);
}

/**
 * Deploys a brand-new instance of whisper-wall using the connected wallet as
 * the deployer. Used from the DeployPanel (see components/DeployPanel.tsx)
 * when no contract address is configured yet - lets a Lace wallet that's
 * already synced to Preprod deploy without going through the slow from-seed
 * CLI wallet sync.
 */
export async function deployWhisperWallContract(
  api: ConnectedAPI,
  networkId: NetworkId,
  onDustRetry?: DustRetryCallback,
): Promise<{ address: string; client: WhisperWallClient }> {
  const { providers, compiledContract } = await buildProviders(api, networkId);
  const deployed: any = await withDustRetry(
    () =>
      deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [],
      }),
    onDustRetry,
  );
  const address = deployed.deployTxData.public.contractAddress as string;
  return { address, client: wrapDeployed(deployed, address, providers) };
}
