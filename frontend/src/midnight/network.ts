// Network configuration for the frontend. Preprod is the target for Level 2
// ("Lace onto Preprod"), but preview/undeployed are kept for local testing
// against the same devnet used by the root CLI.
export type NetworkId = 'undeployed' | 'preview' | 'preprod';

export const DEFAULT_NETWORK: NetworkId = 'preprod';

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
// deployment without a code change.
export const CONTRACT_ADDRESS: string =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? '__PREPROD_CONTRACT_ADDRESS__';
