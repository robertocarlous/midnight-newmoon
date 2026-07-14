import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { connectWhisperWallClient, type WhisperWallClient, type WhisperWallLedgerState } from '../midnight/contractClient';
import { provesAuthorship, bytesToHex } from '../midnight/privacyProof';
import { CONTRACT_ADDRESS } from '../midnight/network';
import { describeError } from '../midnight/errors';
import { CopyableCode } from './CopyableCode';

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
  const [dustRetry, setDustRetry] = useState<{ attempt: number; max: number } | null>(null);

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
      setDustRetry(null);
      try {
        const { txId } = await client.postMessage(message.trim(), (attempt, max) => setDustRetry({ attempt, max }));
        setLastTxId(txId);
        setMessage('');
        await refresh();
      } catch (err) {
        setPostError(describeError(err));
      } finally {
        setDustRetry(null);
        setPosting(false);
      }
    },
    [client, message, refresh],
  );

  if (walletStatus !== 'connected') {
    return (
      <div className="card card--empty">
        <p className="board__hint">Connect a Lace wallet to read and post to the wall.</p>
      </div>
    );
  }

  if (clientStatus === 'connecting' || clientStatus === 'idle') {
    return (
      <div className="card card--empty">
        <span className="spinner" aria-hidden="true" />
        <p className="board__hint">Connecting to whisper-wall on {networkId}…</p>
      </div>
    );
  }

  if (clientStatus === 'error') {
    return (
      <div className="banner banner--error">
        <strong>Failed to connect to the contract</strong>
        <p>{clientError}</p>
      </div>
    );
  }

  const provesIsAuthor = ledger && unshieldedAddress ? provesAuthorship(unshieldedAddress, ledger.lastAuthorCommitment) : false;

  return (
    <div className="board">
      <form className="card board__form" onSubmit={handlePost}>
        <input
          type="text"
          placeholder="Say something anonymous…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          disabled={posting}
        />
        <button className="btn btn--primary" type="submit" disabled={posting || !message.trim()}>
          {posting
            ? dustRetry
              ? `Waiting for DUST… (${dustRetry.attempt}/${dustRetry.max})`
              : 'Proving + submitting…'
            : 'Post anonymously'}
        </button>
      </form>

      {postError && (
        <div className="banner banner--error">
          <strong>Couldn't post</strong>
          <p>{postError}</p>
        </div>
      )}
      {lastTxId && (
        <div className="banner banner--success">
          <strong>✅ Posted</strong>
          <CopyableCode value={lastTxId} />
        </div>
      )}

      <div className="card board__state">
        <h3>Public ledger state</h3>
        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-tile__label">feedbackCount</span>
            <span className="stat-tile__value">{ledger?.feedbackCount.toString() ?? '—'}</span>
          </div>
          <div className="stat-tile stat-tile--wide">
            <span className="stat-tile__label">lastAuthorCommitment</span>
            {ledger ? <CopyableCode value={bytesToHex(ledger.lastAuthorCommitment)} /> : <span className="stat-tile__value">—</span>}
          </div>
        </div>
        <blockquote className="board__quote">{ledger ? `"${ledger.lastMessage}"` : 'No messages yet.'}</blockquote>
        <button onClick={refresh} className="btn btn--ghost btn--small">
          ↻ Refresh
        </button>
      </div>

      {ledger && (
        <div className={`card privacy-proof ${provesIsAuthor ? 'privacy-proof--yes' : 'privacy-proof--no'}`}>
          <h3>
            <span className="privacy-proof__badge">{provesIsAuthor ? '✓' : '✗'}</span> Observable privacy behavior
          </h3>
          <p>
            {provesIsAuthor
              ? 'This browser can prove it authored the last post above — without ever sending its secret anywhere.'
              : "This browser cannot prove authorship of the last post (posted by a different wallet/secret)."}
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
