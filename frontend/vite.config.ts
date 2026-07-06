import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // The Midnight SDK packages (compact-runtime, ledger-v8, abstract-level,
    // midnight-js-*) were written Node-first: they reference Buffer, the
    // Node `events`/`crypto` core modules, and the `global` object. Vite
    // doesn't polyfill any of that for a browser build by default, and
    // without it the bundle throws at runtime (e.g. `class extends
    // EventEmitter` when `events` resolves to nothing).
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
})
