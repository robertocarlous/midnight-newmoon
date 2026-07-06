// Wires together every provider needed to call circuits on the deployed
// whisper-wall contract from the browser, using a connected Lace wallet for
// signing/balancing/proving instead of a local seed.
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import * as WhisperWall from '../generated/whisper-wall/index.js';
import { NETWORK_CONFIGS, type NetworkId } from './network';
import { makeWalletAndMidnightProvider, makeWalletProofProvider } from './laceProviders';
import { makeWitnesses } from './witnesses';

export interface WhisperWallLedgerState {
  feedbackCount: bigint;
  lastMessage: string;
  lastAuthorCommitment: Uint8Array;
}

export interface WhisperWallClient {
  postMessage(message: string): Promise<{ txId: string }>;
  readLedger(): Promise<WhisperWallLedgerState | null>;
}

const ZK_BASE_URL = `${window.location.origin}/managed/whisper-wall`;

export async function connectWhisperWallClient(
  api: ConnectedAPI,
  contractAddress: string,
  networkId: NetworkId,
): Promise<WhisperWallClient> {
  setNetworkId(networkId);

  const config = await api.getConfiguration().catch(() => null);
  const fallback = NETWORK_CONFIGS[networkId];
  const indexer = config?.indexerUri ?? fallback.indexer;
  const indexerWS = config?.indexerWsUri ?? fallback.indexerWS;

  const zkConfigProvider = new FetchZkConfigProvider<string>(ZK_BASE_URL);
  const { unshieldedAddress } = await api.getUnshieldedAddress();
  const witnesses = makeWitnesses(unshieldedAddress);

  const compiledContract = CompiledContract.make('whisper-wall', WhisperWall.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as any),
    CompiledContract.withCompiledFileAssets(ZK_BASE_URL),
  );

  const walletAndMidnightProvider = await makeWalletAndMidnightProvider(api, networkId);
  const proofProvider = await makeWalletProofProvider(api, zkConfigProvider);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'whisper-wall-state',
      accountId: unshieldedAddress,
      // No real secret is stored via this provider (our witness derives its
      // secret from localStorage, see witnesses.ts) - the SDK still requires
      // a >=16 char password to open the local store.
      privateStoragePasswordProvider: () => 'whisper-wall-browser-local-store',
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

  const deployed: any = await findDeployedContract(providers, {
    compiledContract: compiledContract as any,
    contractAddress,
  });

  return {
    async postMessage(message: string) {
      const tx = await deployed.callTx.submitFeedback(message);
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
