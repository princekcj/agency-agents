# The Agency — Ultron Protocol Command Center

A menacing Ultron-themed command center for browsing, searching, deploying, and **chatting with** 249 specialized AI agent definitions across 17 divisions.

## Stack

- **Frontend**: React + Vite (port 5000)
- **Backend**: Express.js API + WebSocket server (port 3001)
- **Data**: Markdown files with YAML frontmatter, parsed at runtime via `gray-matter`

## How to Run

The workflow runs `npm run dev` which starts both servers concurrently:
- Vite dev server on port 5000 (user-facing, proxies `/api` + WebSocket to 3001)
- Express API server on port 3001

## Features

- **Ultron Boot Screen** — cinematic entry with Ultron voice greeting (UK timezone-aware)
- **Browse & Search** — all 249 agents by division, name, description, or vibe
- **Agent Detail View** — full markdown content with Chat, Deploy, and Brief buttons
- **Chat with Agents** — full conversation UI using OpenRouter free LLMs. Agent's markdown spec becomes the system prompt. API key stored in localStorage. Models: Llama 3.3 70B, DeepSeek R1, Gemma 3 27B, Mistral 7B, and more.
- **Per-Agent Deploy** — deploy any single agent to specific tools (Claude Code, Gemini CLI, Codex, Copilot, Cursor, etc.) with a tool picker modal and live terminal output
- **Agent Pipeline Builder** — chain multiple agents in sequence; each agent's output feeds the next. OpenRouter-powered. Access via the Pipeline nav tab.
- **Ultron Voice Interface** — Web Speech API TTS with Ultron persona; one-liners on agent activity
- **Real Activity Feed** — tracks genuine user interactions via POST `/api/activity` → broadcast to all WS clients
- **OpenClaw Deployment** — deploy all agents to OpenClaw workspace with live terminal output

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/agents` | List all agents (search, division filter) |
| `GET /api/agents/:division/:slug` | Single agent detail |
| `GET /api/divisions` | All divisions with agent counts |
| `GET /api/stats` | Total agent/division counts |
| `GET /api/activities` | Recent activity log |
| `GET /api/stats/24h` | 24-hour activity breakdown |
| `POST /api/activity` | Log an agent interaction |
| `POST /api/chat` | Proxy to OpenRouter (send `x-openrouter-key` header) |
| `POST /api/install/agent` | Deploy one agent to selected tools (streams via WS) |
| `POST /api/install/openclaw` | Deploy all agents to OpenClaw (streams via WS) |
| `POST /api/tts` | ElevenLabs TTS proxy (requires ELEVENLABS_API_KEY) |

## Chat Feature Setup

1. Get a free OpenRouter API key at https://openrouter.ai/keys
2. Open any agent → click **Chat** (or click the Chat button on any agent card)
3. Click the settings gear → enter your key → select a free model → start chatting

## Pipeline Feature

1. Navigate to **Pipeline** in the top nav
2. Click **Add Agent** to build a chain (search and select agents)
3. Enter your initial prompt
4. Click **Run Pipeline** — each agent processes the previous output in sequence

## Per-Agent Deploy

1. Open any agent → click **Deploy** (or the Deploy button on agent cards)
2. Select one or more target tools from the picker (Claude Code, Gemini CLI, Cursor, etc.)
3. Click **Deploy** — converts and installs with live terminal output

## Project Structure

```
/                 — repo root (agent markdown files live here)
├── server.js     — Express API + WebSocket server
├── vite.config.js — Vite config with /api proxy (ws:true) to Express
├── src/
│   ├── App.jsx         — main UI, activity tracking, view routing
│   ├── hooks/
│   │   ├── useVoice.js      — Ultron voice (ElevenLabs + Web Speech fallback)
│   │   └── useWebSocket.js  — WS with polling fallback
│   ├── components/
│   │   ├── ChatPanel.jsx       — OpenRouter chat UI with BYOK key management
│   │   ├── DeployModal.jsx     — Per-agent tool picker + install terminal
│   │   ├── PipelineBuilder.jsx — Multi-agent pipeline runner
│   │   ├── JarvisBackground.jsx — Ultron red procedural canvas background
│   │   └── UltronBootScreen.jsx — Cinematic boot sequence
│   └── styles/jarvis.css — Ultron red HUD theme
├── engineering/   — agent markdown files by division
├── marketing/
├── ...
└── scripts/      — convert.sh, install.sh (tool deployment)
```

## Design

Full Ultron red aesthetic: `#dc2626` primary, dark near-black backgrounds, red glow effects. Chat panel slides in from the right. Deploy modal is a centered overlay. Pipeline view is a split left/right layout.

## User Preferences

- Ultron / red-threat aesthetic (not JARVIS)
- UK timezone for greeting
- Real activity tracking only (no simulation)
- Deep menacing voice: pitch 0.2, rate 0.85, prefers Google UK English Male
- OpenRouter for LLM (free tier, BYOK via localStorage)
