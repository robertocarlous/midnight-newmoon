import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { deployWhisperWallContract } from '../midnight/contractClient';

/**
 * Shown instead of the board when no contract address is configured
 * (VITE_CONTRACT_ADDRESS unset). Deploys a fresh whisper-wall instance using
 * the connected Lace wallet - avoids the slow from-seed sync the Node CLI
 * needs, since a Lace wallet that's already used Preprod stays synced.
 */
export function DeployPanel() {
  const { status, api, networkId } = useWallet();
  const [deploying, setDeploying] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'connected' || !api) {
    return <p className="board__hint">Connect a Lace wallet (funded on Preprod) to deploy whisper-wall.</p>;
  }

  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    try {
      const { address } = await deployWhisperWallContract(api, networkId);
      setAddress(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeploying(false);
    }
  };

  if (address) {
    return (
      <div className="deploy-panel deploy-panel--done">
        <h3>✅ Deployed</h3>
        <p>
          Contract address: <code>{address}</code>
        </p>
        <p className="deploy-panel__detail">
          Set <code>VITE_CONTRACT_ADDRESS={address}</code> and rebuild to point the app at this contract.
        </p>
      </div>
    );
  }

  return (
    <div className="deploy-panel">
      <p className="board__hint">No contract configured yet. Deploy a fresh whisper-wall instance with the connected wallet.</p>
      <button onClick={handleDeploy} disabled={deploying}>
        {deploying ? 'Deploying (this can take a minute)…' : 'Deploy whisper-wall'}
      </button>
      {error && <p className="board__error">{error}</p>}
    </div>
  );
}
