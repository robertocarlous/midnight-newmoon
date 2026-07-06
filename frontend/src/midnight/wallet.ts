// Lace / DApp Connector API detection and connection.
//
// Wallets inject their Initial API under `window.midnight`, each keyed by a
// freshly generated UUID rather than a fixed name (a wallet can inject
// multiple instances, e.g. for different API versions) - so we enumerate
// `Object.values(window.midnight)` instead of hardcoding a key like
// `window.midnight.mnLace`.
import '@midnight-ntwrk/dapp-connector-api';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export function listWallets(): InitialAPI[] {
  const injected = window.midnight;
  return injected ? Object.values(injected) : [];
}

export async function connectWallet(wallet: InitialAPI, networkId: string): Promise<ConnectedAPI> {
  return wallet.connect(networkId);
}
