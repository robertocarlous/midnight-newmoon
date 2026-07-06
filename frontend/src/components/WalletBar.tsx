import { useWallet } from '../context/WalletContext';

function shorten(address: string): string {
  return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-8)}` : address;
}

export function WalletBar() {
  const { status, error, unshieldedAddress, networkId, connect, disconnect } = useWallet();

  return (
    <div className="wallet-bar">
      <div className="wallet-bar__info">
        <span className={`wallet-dot wallet-dot--${status}`} />
        <span className="wallet-bar__network">{networkId}</span>
        {status === 'connected' && unshieldedAddress && (
          <code className="wallet-bar__address" title={unshieldedAddress}>
            {shorten(unshieldedAddress)}
          </code>
        )}
      </div>
      <div className="wallet-bar__actions">
        {status === 'connected' ? (
          <button onClick={disconnect}>Disconnect</button>
        ) : (
          <button onClick={connect} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Connecting…' : 'Connect Lace'}
          </button>
        )}
      </div>
      {status === 'error' && error && <p className="wallet-bar__error">{error}</p>}
    </div>
  );
}
