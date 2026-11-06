# Eclipse Vault Coursework Demo

Eclipse Vault is an interactive university coursework prototype. It uses demo credits only: there are no payments, deposits, login accounts, or real prizes.

## What is included

- A browser game interface (`index.html`, `styles.css`, and `game.js`)
- A Node.js backend (`server.js`) that creates server-side demo sessions, generates reel outcomes, evaluates wins, manages balances, and controls Free Spins
- Five local WAV sound files in `audio/` for background music, spinning, reel stops, wins, and bonus activation
- A sound button in the game header to pause or resume background music and sound effects
- A reproducible Node.js mathematical model for RTP and feature analysis
- Local account registration, hashed passwords, persistent demo-wallet data, and seven-day HttpOnly sessions

## Run locally

You need Node.js 18 or newer. From this folder, run:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:8000/
```

The server stores each account's demo balance, game state, and active session records locally, so they survive a server restart.

Create an account from the **SIGN IN** button before playing. Your account, demo-wallet state, and session records are stored locally in the SQLite database `data/eclipse-vault.db`, while the session cookie lasts for seven days. This is local demo authentication only; it has no password reset, email verification, payments, or real-money functionality.

## Audio files

The generated WAV files are ready to use in the `audio/` folder. If you want to recreate them, run:

```powershell
npm run generate-audio
```

## Mathematical model

The model in `tools/math-model.js` is the source used by `server.js` to evaluate paylines, symbols, Scatter counts, Wild counts, and every paid spin result. It also runs exact base-game RTP and Scatter-probability calculations, plus a seeded Monte Carlo simulation for overall RTP, including Free Spins, retriggers, and the persistent multiplier.

Every payline pays from left to right for three or more matching symbols. A symbol can match only the same symbol or a Wild; different letter symbols never combine. The primary-symbol payout order is `10 < J < Q < K < A`. Scatter symbols trigger Free Spins only and do not pay line wins.

```powershell
npm run math -- --spins 1000000 --seed 20261106
```

The default is 200,000 simulated base spins. Using the same seed and spin count produces the same simulated estimate.

## Frontend architecture

The current frontend architecture is documented in [`docs/frontend-architecture.svg`](docs/frontend-architecture.svg). It shows the relationship between the HTML structure, JavaScript controller, styling, local assets, audio files, and the Node.js game API.

## Deployment

This project now requires a Node.js host because the game API runs on the server. GitHub Pages cannot run this backend. Use a host that supports Node.js, such as Render, Railway, Fly.io, or a VPS.

## Limitations

This is an academic demo only. A production gambling system would also require certified RNG, persistent storage, authentication, secure wallet transactions, KYC, Responsible Gaming controls, monitoring, and regulatory approval.
