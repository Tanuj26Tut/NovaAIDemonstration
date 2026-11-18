# NOVA AI Assistant

## Requirements
- Node.js 20.19+ (Node 22 recommended)
- A Claude API key from Anthropic with access to the selected models

## Run locally

```bash
npm install
#set ANTHROPIC_API_KEY=... in .env file
npm run dev
```

Open **http://localhost:5173**. The development frontend proxies `/api` calls to **http://localhost:3001**.

## Production setup

```bash
npm run build
npm run start
```

The Express API starts on port 3001. To deploy both together, serve the `dist/` frontend via your preferred static hosting, forwarding `/api` to the Express server (or modify the server to serve the built `dist` directory). Keep `.env` server-side, never in browser code.

## Features
- Haiku 4.5 (default), Sonnet 4.5, Opus 5.5
- Five output-length presets (100, 300, 600, 1,000, 5,000 max tokens); *max_tokens* is a ceiling, not a guaranteed length
- Temperature control 0–1 (omitted on Opus 5.5, per API compatibility)
- Multi-turn chat, streamed SSE responses, optional non-streaming mode
- Token usage (input/output) per response and cumulatively
- Raw final Claude message JSON, copy and download buttons
- Light/dark toggle, reset conversation, responsive layout, rotating random fact
- API key stays on server

## API endpoints
- `GET /api/health` — whether the server is running and an API key is configured
- `POST /api/chat` — returns the complete Claude JSON response
- `POST /api/chat/stream` — SSE events: `text`, `usage`, `complete`, `error`

Example JSON POST body:

```json
{
  "model": "claude-haiku-4-5",
  "maxTokens": 600,
  "temperature": 0.5,
  "messages": [{"role": "user", "content": "Hello!"}]
}
```
