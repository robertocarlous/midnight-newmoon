import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { connectWhisperWallClient, type WhisperWallClient, type WhisperWallLedgerState } from '../midnight/contractClient';
import { provesAuthorship, bytesToHex } from '../midnight/privacyProof';
import { CONTRACT_ADDRESS } from '../midnight/network';
import { describeError } from '../midnight/errors';

type ClientStatus = 'idle' | 'connecting' | 'ready' | 'error';

export function WhisperWallBoard() {
  const { status: walletStatus, api, unshieldedAddress, networkId } = useWallet();

  const [clientStatus, setClientStatus] = useState<ClientStatus>('idle');
  const [clientError, setClientError] = useState<string | null>(null);
  const [client, setClient] = useState<WhisperWallClient | null>(null);
  const [ledger, setLedger] = useState<WhisperWallLedgerState | null>(null);

  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  // Connect the contract client whenever the wallet connects.
  useEffect(() => {
    if (walletStatus !== 'connected' || !api) {
      setClient(null);
      setClientStatus('idle');
      return;
    }
    let cancelled = false;
    setClientStatus('connecting');
    setClientError(null);
    connectWhisperWallClient(api, CONTRACT_ADDRESS, networkId)
      .then((c) => {
        if (cancelled) return;
        setClient(c);
        setClientStatus('ready');
        return c.readLedger();
      })
      .then((state) => {
        if (!cancelled && state) setLedger(state);
      })
      .catch((err) => {
        if (cancelled) return;
        setClientError(err instanceof Error ? err.message : String(err));
        setClientStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [walletStatus, api, networkId]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const state = await client.readLedger();
    if (state) setLedger(state);
  }, [client]);

  const handlePost = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!client || !message.trim()) return;
      setPosting(true);
      setPostError(null);
      setLastTxId(null);
      try {
        const { txId } = await client.postMessage(message.trim());
        setLastTxId(txId);
        setMessage('');
        await refresh();
      } catch (err) {
        setPostError(describeError(err));
      } finally {
        setPosting(false);
      }
    },
    [client, message, refresh],
  );

  if (walletStatus !== 'connected') {
    return <p className="board__hint">Connect a Lace wallet to read and post to the wall.</p>;
  }

  if (clientStatus === 'connecting' || clientStatus === 'idle') {
    return <p className="board__hint">Connecting to whisper-wall on {networkId}…</p>;
  }

  if (clientStatus === 'error') {
    return <p className="board__error">Failed to connect to the contract: {clientError}</p>;
  }

  const provesIsAuthor = ledger && unshieldedAddress ? provesAuthorship(unshieldedAddress, ledger.lastAuthorCommitment) : false;

  return (
    <div className="board">
      <form className="board__form" onSubmit={handlePost}>
        <input
          type="text"
          placeholder="Say something anonymous…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          disabled={posting}
        />
        <button type="submit" disabled={posting || !message.trim()}>
          {posting ? 'Proving + submitting…' : 'Post anonymously'}
        </button>
      </form>
      {postError && <p className="board__error">{postError}</p>}
      {lastTxId && (
        <p className="board__tx">
          ✅ Posted. Tx: <code>{lastTxId}</code>
        </p>
      )}

      <div className="board__state">
        <h3>Public ledger state</h3>
        <dl>
          <dt>feedbackCount</dt>
          <dd>{ledger?.feedbackCount.toString() ?? '—'}</dd>
          <dt>lastMessage</dt>
          <dd>{ledger ? `"${ledger.lastMessage}"` : '—'}</dd>
          <dt>lastAuthorCommitment</dt>
          <dd className="mono">{ledger ? bytesToHex(ledger.lastAuthorCommitment) : '—'}</dd>
        </dl>
        <button onClick={refresh} className="board__refresh">
          Refresh
        </button>
      </div>

      {ledger && (
        <div className={`privacy-proof ${provesIsAuthor ? 'privacy-proof--yes' : 'privacy-proof--no'}`}>
          <h3>Observable privacy behavior</h3>
          <p>
            {provesIsAuthor
              ? '✓ This browser can prove it authored the last post above — without ever sending its secret anywhere.'
              : '✗ This browser cannot prove authorship of the last post (posted by a different wallet/secret).'}
          </p>
          <p className="privacy-proof__detail">
            The check: recompute <code>persistentHash(authorSecret)</code> locally, using the secret that has never
            left this browser, and compare it to the public <code>lastAuthorCommitment</code> above. Nobody reading
            the chain — not the indexer, not other users, not this app's own backend (there isn't one) — can run
            that check without the secret. Only the wallet that holds it can.
          </p>
        </div>
      )}
    </div>
  );
}
