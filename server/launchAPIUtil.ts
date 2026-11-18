/** Adapted from the user's launchAPIUtil.ts, keeping all credentials on the server. */
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

export const MODEL_OPTIONS = {
  'claude-haiku-4-5': { label: 'Haiku 4.5', supportsTemperature: true },
  'claude-sonnet-4-5': { label: 'Sonnet 4.5', supportsTemperature: true },
  'claude-opus-5-5': { label: 'Opus 5.5', supportsTemperature: false }
} as const;
export type ModelId = keyof typeof MODEL_OPTIONS;
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatRequest = {
  messages: ChatMessage[];
  model: ModelId;
  maxTokens: number;
  temperature: number;
};

let client: Anthropic | undefined;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY is missing. Add it to .env on the server.');
  }
  return client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getBaseParams(request: ChatRequest): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: request.model, max_tokens: request.maxTokens, messages: request.messages
  };
  if (MODEL_OPTIONS[request.model].supportsTemperature) params.temperature = request.temperature;
  return params;
}

export function getSimpleMessage(request: ChatRequest) {
  return getClient().messages.create(getBaseParams(request));
}

export function getStreamOfMessages(request: ChatRequest) {
  return getClient().messages.stream(getBaseParams(request));
}
