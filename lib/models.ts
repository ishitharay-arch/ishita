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
    model: 'claude-sonnet-4-6',
  },
  judge: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  },
  optimizer: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  },
  bot: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
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
 * Anthropic API adapter
 */
async function callAnthropic(
  config: ModelConfig,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
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
