import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MODEL_OPTIONS, getSimpleMessage, getStreamOfMessages, type ChatMessage, type ChatRequest, type ModelId } from './launchAPIUtil.ts';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function parseRequest(input: any): ChatRequest {
  if (!input || !Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 100) throw new Error('Provide 1–100 messages.');
  const messages: ChatMessage[] = input.messages.map((m: any) => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 100_000) throw new Error('Invalid message format or length.');
    return { role: m.role, content: m.content.trim() };
  });
  if (messages[messages.length - 1].role !== 'user') throw new Error('Last message must be from user.');
  if (typeof input.model !== 'string' || !(input.model in MODEL_OPTIONS)) throw new Error('Unsupported model.');
  const maxTokens = Number(input.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 5000) throw new Error('maxTokens must be 1–5000.');
  const temperature = Number(input.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) throw new Error('temperature must be 0–1.');
  return { messages, model: input.model as ModelId, maxTokens, temperature };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') }));

app.post('/api/chat', async (req, res) => {
  try { const request = parseRequest(req.body); res.json(await getSimpleMessage(request)); }
  catch (error: any) { res.status(error?.status && Number.isInteger(error.status) ? error.status : 400).json({ error: error?.message || 'Request failed.' }); }
});

app.post('/api/chat/stream', async (req, res) => {
  let request: ChatRequest;
  try { request = parseRequest(req.body); }
  catch (error: any) { res.status(400).json({ error: error.message }); return; }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event: string, data: unknown) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  let disconnected = false;
  res.on('close', () => { disconnected = true; });
  try {
    const stream = getStreamOfMessages(request);
    for await (const chunk of stream) {
      if (disconnected) { stream.abort(); break; }
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') send('text', { text: chunk.delta.text });
      if (chunk.type === 'message_start') send('usage', chunk.message.usage);
      if (chunk.type === 'message_delta') send('usage', chunk.usage);
    }
    if (!disconnected) {
      const finalMessage = await stream.finalMessage();
      send('complete', { message: finalMessage });
    }
  } catch (error: any) {
    if (!disconnected) send('error', { error: error?.message || 'Claude API request failed.', status: error?.status });
  } finally { if (!res.writableEnded) res.end(); }
});

const port = Number(process.env.PORT || 3001);

app.listen(port, () => console.log(`AI Assistant server at http://localhost:${port}`));
