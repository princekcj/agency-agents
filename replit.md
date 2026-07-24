# The Agency — Ultron Protocol Command Center

A menacing Ultron-themed command center for browsing, searching, and deploying **The Agency** — 249 specialized AI agent definitions across 17 divisions.

## Stack

- **Frontend**: React + Vite (port 5000)
- **Backend**: Express.js API + WebSocket server (port 3001)
- **Data**: Markdown files with YAML frontmatter, parsed at runtime via `gray-matter`

## How to Run

The workflow runs `npm run dev` which starts both servers concurrently:
- Vite dev server on port 5000 (user-facing, proxies `/api` + WebSocket to 3001)
- Express API server on port 3001

## Features

- **Browse & Search** — all 249 agents by division, name, description, or vibe
- **Ultron Voice Interface** — Web Speech API TTS with deep menacing Ultron persona; UK timezone-aware greeting on load
- **Real Activity Feed** — tracks genuine user interactions (agent views, briefings) via POST `/api/activity` → broadcast to all WS clients
- **Agent Detail View** — full markdown content for any agent
- **OpenClaw Deployment** — run `scripts/convert.sh` + `scripts/install.sh --tool openclaw` with live terminal output streamed via WebSocket

## Activity Tracking

Real events only — no simulation. When a user opens an agent or requests a voice brief, the client POSTs to `/api/activity`. The server broadcasts the event to all connected WebSocket clients and stores it in an in-memory log (last 100 events). The WS hook falls back to polling `/api/activities` every 3 seconds if WebSocket is unavailable.

## Project Structure

```
/                 — repo root (agent markdown files live here)
├── server.js     — Express API + WebSocket server
├── vite.config.js — Vite config with /api proxy (ws:true) to Express
├── src/
│   ├── App.jsx         — main UI, activity tracking
│   ├── hooks/
│   │   ├── useVoice.js    — Ultron voice (pitch 0.2, deep male voice)
│   │   └── useWebSocket.js — WS with polling fallback
│   ├── components/
│   │   ├── GreetingOverlay.jsx  — Ultron greeting, UK timezone
│   │   └── JarvisBackground.jsx — Ultron red procedural canvas
│   └── styles/jarvis.css — Ultron red HUD theme
├── engineering/   — agent markdown files by division
├── marketing/
├── ...
└── scripts/      — convert.sh, install.sh (OpenClaw deployment)
```

## Design

Full Ultron red aesthetic: `#dc2626` primary, dark near-black backgrounds, red glow effects, spinning arc-reactor rings in red. Replaces the original JARVIS cyan/blue scheme.

## User Preferences

- Ultron / red-threat aesthetic (not JARVIS)
- UK timezone for greeting
- Real activity tracking only (no simulation)
- Deep menacing voice: pitch 0.2, rate 0.85, prefers Google UK English Male
