import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { listWallets, connectWallet } from '../midnight/wallet';
import { DEFAULT_NETWORK, type NetworkId } from '../midnight/network';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WalletContextValue {
  status: WalletStatus;
  error: string | null;
  api: ConnectedAPI | null;
  unshieldedAddress: string | null;
  networkId: NetworkId;
  availableWallets: InitialAPI[];
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshWallets: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<ConnectedAPI | null>(null);
  const [unshieldedAddress, setUnshieldedAddress] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<InitialAPI[]>(() => listWallets());

  const refreshWallets = useCallback(() => setAvailableWallets(listWallets()), []);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const wallets = listWallets();
      setAvailableWallets(wallets);
      if (wallets.length === 0) {
        throw new Error('No Midnight wallet found. Install Lace and refresh the page.');
      }
      // With exactly one wallet installed (the common case), connect to it
      // directly. If more are ever detected, the UI lets the user pick.
      const connectedApi = await connectWallet(wallets[0], DEFAULT_NETWORK);
      const { unshieldedAddress: address } = await connectedApi.getUnshieldedAddress();
      setApi(connectedApi);
      setUnshieldedAddress(address);
      setStatus('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  const disconnect = useCallback(() => {
    setApi(null);
    setUnshieldedAddress(null);
    setStatus('disconnected');
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ status, error, api, unshieldedAddress, networkId: DEFAULT_NETWORK, availableWallets, connect, disconnect, refreshWallets }),
    [status, error, api, unshieldedAddress, availableWallets, connect, disconnect, refreshWallets],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
