# whisper-wall frontend

React + Vite UI for the [whisper-wall](../contracts/whisper-wall.compact)
Compact contract — connects to a Lace wallet via the [Midnight DApp
Connector API](https://docs.midnight.network/develop/reference/midnight-api/dapp-connector-api)
and calls its `submitFeedback` circuit directly from the browser. See the
[repo root README](../README.md#level-2--waxing-crescent) for the full
Level 2 writeup (privacy claim, live demo link, known issues).

## Prerequisites

- A [Lace](https://www.lace.io/) wallet with the Midnight network enabled,
  funded on whichever network you're targeting (faucet links in the root
  README's [Networks](../README.md#networks) section).
- A local ZK proof-server, since Lace doesn't yet delegate proving to
  itself for testnets: `docker compose up -d proof-server` from the repo
  root (uses the same `docker-compose.yml` as the root CLI).
- The contract already compiled and, for a fresh contract, deployed - or
  just point at an existing deployment via `VITE_CONTRACT_ADDRESS` (see
  below). Re-sync compiled artifacts into this app with
  `npm run sync-contract` after recompiling the `.compact` source.

## Environment variables

| Variable | Effect | Default |
|---|---|---|
| `VITE_NETWORK` | Which network to connect Lace to: `preview`, `preprod`, or `undeployed`. | `preview` |
| `VITE_CONTRACT_ADDRESS` | Address of an already-deployed whisper-wall instance to connect to. Leave unset to show the in-app deploy flow instead. | unset |
| `VITE_PROOF_SERVER_URL` | Proof-server the app sends proving requests to. | `http://127.0.0.1:6300` |

Set these in a `.env.local` file for local dev, or as project environment
variables in Vercel/Netlify for a deployed build.

## Local development

```bash
npm install
npm run sync-contract   # vendors contracts/managed/whisper-wall into src/generated + public/managed
npm run dev
```

## Build & deploy

```bash
npm run build            # tsc -b && vite build -> dist/
npx vercel --prod         # or drag-and-drop dist/ into Netlify
```

The build is fully static - `contracts/managed/whisper-wall`'s JS bindings
and zk assets are vendored into this app (`src/generated/`,
`public/managed/`) rather than compiled at build time, so no Compact
toolchain is required in CI/Vercel/Netlify.
