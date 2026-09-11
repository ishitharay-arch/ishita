import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export type Role = 'generator' | 'judge' | 'optimizer' | 'bot';

export type Provider = 'anthropic' | 'openai_compatible';

export interface ModelConfig {
  provider: Provider;
  model: string;
  baseUrl?: string; // For openai_compatible
  apiKey?: string;
}

export interface RunConfig {
  generator: ModelConfig;
  judge: ModelConfig;
  optimizer: ModelConfig;
  bot: ModelConfig;
}

// Default configuration
export const defaultConfig: RunConfig = {
  generator: {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
  },
  judge: {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
  },
  optimizer: {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
  },
  bot: {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
  },
};

/**
 * Call a model with the given role, system prompt, and messages.
 * This is the main entry point for all model interactions.
 */
export async function callModel(
  role: Role,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  config: RunConfig
): Promise<string> {
  const modelConfig = config[role];

  if (modelConfig.provider === 'anthropic') {
    return callAnthropic(modelConfig, system, messages);
  } else if (modelConfig.provider === 'openai_compatible') {
    return callOpenAICompatible(modelConfig, system, messages);
  } else {
    throw new Error(`Unknown provider: ${(modelConfig as any).provider}`);
  }
}

/**
 * Call a model and validate its response against a schema (structured outputs).
 * Guarantees the returned value matches `schema` - no manual JSON parsing
 * or markdown-fence stripping needed.
 *
 * Only the Anthropic provider gets guaranteed schema-conformant output via
 * the API's native structured outputs. For openai_compatible providers we
 * fall back to asking for JSON in the prompt and validating the result -
 * support for a native structured-output mode varies by provider.
 */
export async function callModelStructured<T>(
  role: Role,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  config: RunConfig,
  schema: z.ZodType<T>
): Promise<T> {
  const modelConfig = config[role];

  if (modelConfig.provider === 'anthropic') {
    const client = getAnthropicClient(modelConfig);
    const response = await client.messages.parse({
      model: modelConfig.model,
      max_tokens: 4096,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { format: zodOutputFormat(schema) },
    });

    if (response.parsed_output === null) {
      throw new Error('Claude response did not match the expected schema');
    }
    return response.parsed_output;
  }

  // openai_compatible fallback: prompt for JSON, then validate.
  const raw = await callOpenAICompatible(modelConfig, system, messages);
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }
  return schema.parse(JSON.parse(jsonStr));
}

function getAnthropicClient(config: ModelConfig): Anthropic {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
  }

  return new Anthropic({ apiKey });
}

/**
 * Anthropic API adapter
 */
async function callAnthropic(
  config: ModelConfig,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const client = getAnthropicClient(config);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    if (!textBlock) {
      throw new Error('Anthropic response contained no text block');
    }
    return textBlock.text;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Anthropic API error: invalid API key');
    } else if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Anthropic API error: rate limited, please retry later');
    } else if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error: ${error.status} - ${error.message}`);
    }
    throw error;
  }
}

/**
 * OpenAI-compatible API adapter (covers Ollama, Groq, OpenRouter, vLLM, etc.)
 */
async function callOpenAICompatible(
  config: ModelConfig,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  if (!baseUrl) {
    throw new Error('baseUrl is required for openai_compatible provider');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Convert Anthropic-style messages to OpenAI format
  const openAIMessages = [
    { role: 'system' as const, content: system },
    ...messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: openAIMessages,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Check if the bot role is using a Claude model (for warning banner)
 */
export function isBotUsingClaude(config: RunConfig): boolean {
  return config.bot.provider === 'anthropic' &&
         config.bot.model.toLowerCase().includes('claude');
}
