/**
 * Non-interactive demo: posts one message to the deployed whisper-wall
 * contract and reads the resulting ledger state back. Used to produce
 * deploy/compile evidence without driving the interactive `npm run cli`.
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
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { resolveNetwork, getOrCreateSeed, getDeployment } from '../src/network';
import { createWallet, persistWalletState, unshieldedToken } from '../src/wallet';
import { makeWitnesses } from '../src/witnesses';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

const message = process.argv[2] ?? `Hello from New Moon Level 1 (${new Date().toISOString()})`;

async function main() {
  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run setup -- --network ${network}\` first.`);
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'whisper-wall');
  const contractPath = path.join(zkConfigPath, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) {
    console.error('\n❌ Contract not compiled! Run: npm run compile\n');
    process.exit(1);
  }
  const WhisperWall = await import(pathToFileURL(contractPath).href);

  const compiledContract = CompiledContract.make('whisper-wall', WhisperWall.Contract).pipe(
    CompiledContract.withWitnesses(makeWitnesses(SEED) as any),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );

  console.log(`Connecting wallet on ${network}...`);
  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
  const state = await walletCtx.wallet.waitForSyncedState();
  await persistWalletState(network, walletCtx);
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`Wallet balance: ${balance.toLocaleString()} tNight`);

  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';
  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signedRecipe = await walletCtx.wallet.signRecipe(recipe, (payload) =>
        walletCtx.unshieldedKeystore.signData(payload),
      );
      return walletCtx.wallet.finalizeRecipe(signedRecipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'whisper-wall-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  console.log('Connecting to contract...');
  const deployed: any = await findDeployedContract(providers, {
    compiledContract: compiledContract as any,
    contractAddress: deployment.address,
  });

  console.log(`Posting message: "${message}"`);
  const tx = await deployed.callTx.submitFeedback(message);
  console.log(`✅ Posted. txId: ${tx.public.txId}`);

  const contractState = await providers.publicDataProvider.queryContractState(deployment.address);
  const ledgerState = WhisperWall.ledger(contractState.data);
  console.log('\n─── Whisper Wall state ─────────────────────────────────────');
  console.log(`  Contract address:  ${deployment.address}`);
  console.log(`  Network:           ${network}`);
  console.log(`  feedbackCount:     ${ledgerState.feedbackCount}`);
  console.log(`  lastMessage:       ${JSON.stringify(ledgerState.lastMessage)}`);
  console.log(`  authorCommitment:  ${Buffer.from(ledgerState.lastAuthorCommitment).toString('hex')}`);

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
