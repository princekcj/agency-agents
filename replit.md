# The Agency — JARVIS Command Center

A Jarvis-style web command center for browsing, searching, and deploying **The Agency** — a collection of 230+ specialized AI agent definitions across 17 divisions.

## Stack

- **Frontend**: React + Vite (port 5000)
- **Backend**: Express.js API + WebSocket server (port 3001)
- **Data**: Markdown files with YAML frontmatter, parsed at runtime via `gray-matter`

## How to Run

The workflow runs `npm run dev` which starts both servers concurrently:
- Vite dev server on port 5000 (user-facing)
- Express API server on port 3001 (proxied via Vite)

## Features

- **Browse & Search** — all 230+ agents by division, name, description, or vibe
- **JARVIS Voice Interface** — Web Speech API TTS + STT for agent briefings and voice commands
- **Live Activity Tracker** — real-time WebSocket feed showing simulated agent activity
- **Agent Detail View** — full markdown content for any agent
- **OpenClaw Deployment** — run `scripts/convert.sh` + `scripts/install.sh --tool openclaw` with live terminal output streamed via WebSocket

## Project Structure

```
/                 — repo root (agent markdown files live here)
├── server.js     — Express API + WebSocket server
├── vite.config.js — Vite config with /api proxy to Express
├── src/
│   ├── App.jsx   — main UI (HUD layout, agent grid, modals)
│   ├── hooks/    — useVoice, useWebSocket
│   └── styles/   — jarvis.css (Iron Man HUD aesthetic)
├── engineering/  — agent markdown files by division
├── marketing/
├── ...
└── scripts/      — convert.sh, install.sh (OpenClaw deployment)
```

## User Preferences

- Use OpenClaw as the primary tool integration (not Claude Code default)
- Jarvis/Iron Man HUD aesthetic for the UI
- Dark theme with cyan/blue accents
