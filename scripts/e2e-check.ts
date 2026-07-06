/**
 * End-to-end smoke check for midnight-newmoon.
 *
 * Reconnects to the deployed contract, reads its ledger state, and exits 0
 * on success. Used by `npm run test:e2e` and by the project's CI workflows.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { resolveNetwork, getOrCreateSeed, getDeployment } from '../src/network';
import { createWallet, persistWalletState } from '../src/wallet';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

// ─── Network configuration ─────────────────────────────────────────────────────

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

function fail(msg: string): never {
  console.error(`❌ e2e-check failed: ${msg}`);
  process.exit(1);
}

function isHexAddress(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-fA-F]+$/.test(s) && s.length >= 32;
}

async function main() {
  // 1. Deployment sanity
  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}.`);
    process.exit(1);
  }
  if (!isHexAddress(deployment.address)) {
    fail(`Deployment address missing or invalid: ${JSON.stringify(deployment, null, 2)}`);
  }

  // 2. Build wallet and providers
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'whisper-wall');
  const contractPath = path.join(zkConfigPath, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) fail('Compiled contract missing — run `npm run compile`.');
  const WhisperWall = await import(pathToFileURL(contractPath).href);
  // Vacant witnesses are fine here: e2e-check only reads ledger state and
  // reconnects to the contract, it never calls submitFeedback (which is the
  // only circuit that invokes the authorSecret witness).
  const compiledContract = CompiledContract.make('whisper-wall', WhisperWall.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );

  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
  const state = await walletCtx.wallet.waitForSyncedState();
  // Persist the sync state — saves time on the next e2e-check invocation in CI
  // when run against the same persistent wallet directory.
  await persistWalletState(network, walletCtx);

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx() {
      throw new Error('e2e-check is read-only and should not balance transactions');
    },
    submitTx() {
      throw new Error('e2e-check is read-only and should not submit transactions');
    },
  } as any;

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'whisper-wall-state',
      accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
      // SDK requires ≥16 chars. e2e-check is read-only so we don't expose
      // the env-var override here — match the deploy script's local-devnet default.
      privateStoragePasswordProvider: () => 'Local-Devnet-Development-Placeholder-1',
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  // 3. Reconnect to the deployed contract — proves callTx interface is wired
  try {
    await findDeployedContract(providers, {
      contractAddress: deployment.address,
      compiledContract: compiledContract as any,
    });
  } catch (err: any) {
    await walletCtx.wallet.stop();
    fail(`findDeployedContract threw: ${err?.message ?? err}`);
  }

  // 4. Read the on-chain contract state via the public data provider — proves
  // the contract is indexed and queryable on the chain itself, not just that
  // we know how to construct the local handle.
  const onChainState = await providers.publicDataProvider.queryContractState(deployment.address);
  if (!onChainState) {
    await walletCtx.wallet.stop();
    fail(`queryContractState returned null for ${deployment.address}`);
  }

  // 5. Decode the ledger and sanity-check its shape — proves the deployed
  // bytecode matches this contract's public ledger layout (feedbackCount,
  // lastMessage, lastAuthorCommitment), not just that some contract exists
  // at this address.
  const ledgerState = WhisperWall.ledger(onChainState!.data);
  if (typeof ledgerState.feedbackCount !== 'bigint') {
    await walletCtx.wallet.stop();
    fail(`feedbackCount has unexpected type: ${typeof ledgerState.feedbackCount}`);
  }
  if (typeof ledgerState.lastMessage !== 'string') {
    await walletCtx.wallet.stop();
    fail(`lastMessage has unexpected type: ${typeof ledgerState.lastMessage}`);
  }
  if (!(ledgerState.lastAuthorCommitment instanceof Uint8Array) || ledgerState.lastAuthorCommitment.length !== 32) {
    await walletCtx.wallet.stop();
    fail(`lastAuthorCommitment is not a 32-byte value`);
  }

  console.log(`✅ e2e-check passed`);
  console.log(`   contractAddress:  ${deployment.address}`);
  console.log(`   network:          ${network}`);
  console.log(`   feedbackCount:    ${ledgerState.feedbackCount}`);
  console.log(`   lastMessage:      ${JSON.stringify(ledgerState.lastMessage)}`);
  console.log(`   authorCommitment: ${Buffer.from(ledgerState.lastAuthorCommitment).toString('hex')}`);

  await walletCtx.wallet.stop();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
