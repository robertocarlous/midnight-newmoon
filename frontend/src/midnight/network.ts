// Network configuration for the frontend. Preprod is the intended target for
// Level 2 ("Lace onto Preprod"); preview/undeployed are kept for local
// testing and as a fallback - see README "Known issue: Preprod availability"
// for why this currently defaults to preview. Overridable via VITE_NETWORK
// without a code change once Preprod stabilizes.
export type NetworkId = 'undeployed' | 'preview' | 'preprod';

function resolveDefaultNetwork(): NetworkId {
  const fromEnv = import.meta.env.VITE_NETWORK;
  if (fromEnv === 'undeployed' || fromEnv === 'preview' || fromEnv === 'preprod') return fromEnv;
  return 'preview';
}

export const DEFAULT_NETWORK: NetworkId = resolveDefaultNetwork();

export interface NetworkConfig {
  networkId: NetworkId;
  indexer: string;
  indexerWS: string;
}

// Fallback config, used only if the connected wallet's getConfiguration()
// doesn't return usable URIs. Preferring the wallet's own configuration (see
// midnight/laceProviders.ts) respects the user's own node/indexer choice.
export const NETWORK_CONFIGS: Record<NetworkId, NetworkConfig> = {
  undeployed: {
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  },
  preview: {
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
  preprod: {
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
};

// Deployed whisper-wall contract address on Preprod. Overridable via
// VITE_CONTRACT_ADDRESS so the same build can point at a different
// deployment without a code change. Empty until a contract is deployed -
// the app shows the DeployPanel instead of the board while this is unset.
export const CONTRACT_ADDRESS: string = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

// As of writing, Lace does not implement wallet-delegated proving
// (getProvingProvider) for Preprod, and the publicly documented remote
// proof-server URL for Preprod (lace-proof-pub.preprod.midnight.network)
// does not resolve - a known issue on the Midnight forum. Lace's own
// Settings > Midnight also only supports a local proof-server. So this app
// runs proving itself against a proof-server on the user's own machine,
// same as the root CLI's docker-compose service - overridable in case a
// public one becomes available.
export const PROOF_SERVER_URL: string = import.meta.env.VITE_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300';
