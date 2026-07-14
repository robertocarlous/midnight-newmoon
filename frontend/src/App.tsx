import { WalletProvider } from './context/WalletContext';
import { WalletBar } from './components/WalletBar';
import { WhisperWallBoard } from './components/WhisperWallBoard';
import { DeployPanel } from './components/DeployPanel';
import { CONTRACT_ADDRESS, DEFAULT_NETWORK } from './midnight/network';
import './App.css';

function App() {
  return (
    <WalletProvider>
      <div className="page">
        <header className="page__header">
          <h1>
            <span className="moon">🌒</span> <span className="brand-text">Whisper Wall</span>
          </h1>
          <p className="page__tagline">An anonymous feedback board on Midnight — {DEFAULT_NETWORK}.</p>
        </header>
        <WalletBar />
        <main className="page__main">
          {CONTRACT_ADDRESS ? <WhisperWallBoard /> : <DeployPanel />}
        </main>
        <footer className="page__footer">
          <a href="https://github.com/robertocarlous/midnight-newmoon" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </footer>
      </div>
    </WalletProvider>
  );
}

export default App;
