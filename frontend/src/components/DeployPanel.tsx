import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { deployWhisperWallContract } from '../midnight/contractClient';
import { describeError } from '../midnight/errors';

// deployContract waits indefinitely for the indexer to see the transaction
// confirmed, with no built-in timeout - if the tx never lands (most often:
// not enough DUST yet to pay fees), it hangs forever with no error at all.
// This wraps it with our own timeout so the UI can say something useful
// instead of spinning silently.
const DEPLOY_TIMEOUT_MS = 3 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Shown instead of the board when no contract address is configured
 * (VITE_CONTRACT_ADDRESS unset). Deploys a fresh whisper-wall instance using
 * the connected Lace wallet - avoids the slow from-seed sync the Node CLI
 * needs, since a Lace wallet that's already used this network stays synced.
 */
export function DeployPanel() {
  const { status, api, networkId } = useWallet();
  const [deploying, setDeploying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dust, setDust] = useState<{ cap: bigint; balance: bigint } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== 'connected' || !api) {
      setDust(null);
      return;
    }
    let cancelled = false;
    api
      .getDustBalance()
      .then((d) => {
        if (!cancelled) setDust(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, api]);

  if (status !== 'connected' || !api) {
    return <p className="board__hint">Connect a Lace wallet (funded on {networkId}) to deploy whisper-wall.</p>;
  }

  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const { address } = await withTimeout(deployWhisperWallContract(api, networkId), DEPLOY_TIMEOUT_MS);
      setAddress(address);
    } catch (err) {
      if (err instanceof Error && err.message === 'timeout') {
        setError(
          `No response after ${Math.round(DEPLOY_TIMEOUT_MS / 1000)}s. The transaction may still land later, but ` +
            `this most often means the wallet doesn't have enough DUST yet to pay fees - DUST only starts ` +
            `generating a few minutes after NIGHT registration, and needs to accumulate before it can cover a ` +
            `deploy transaction. Wait a bit and try again, or check Lace's own activity/transaction view.`,
        );
      } else {
        setError(describeError(err));
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
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
      {dust && (
        <p className="deploy-panel__detail">
          DUST balance: {dust.balance.toString()} (cap {dust.cap.toString()})
          {dust.balance === 0n && ' — likely too low to pay fees yet; deploy may hang until some has generated.'}
        </p>
      )}
      <button onClick={handleDeploy} disabled={deploying}>
        {deploying ? `Deploying… (${elapsed}s, this can take a few minutes)` : 'Deploy whisper-wall'}
      </button>
      {error && <p className="board__error">{error}</p>}
    </div>
  );
}
