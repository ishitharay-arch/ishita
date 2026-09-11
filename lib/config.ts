import dotenv from 'dotenv';
import { defaultConfig, type RunConfig, type ModelConfig } from './models';

// Load environment variables from .env file
dotenv.config();

/**
 * Get model configuration from environment variables
 */
export function getModelConfig(): RunConfig {
  const config = { ...defaultConfig };

  // Override with environment variables if present
  if (process.env.GENERATOR_MODEL) {
    config.generator.model = process.env.GENERATOR_MODEL;
  }
  if (process.env.JUDGE_MODEL) {
    config.judge.model = process.env.JUDGE_MODEL;
  }
  if (process.env.OPTIMIZER_MODEL) {
    config.optimizer.model = process.env.OPTIMIZER_MODEL;
  }
  if (process.env.BOT_MODEL) {
    config.bot.model = process.env.BOT_MODEL;
  }

  // Set API keys from environment
  if (process.env.ANTHROPIC_API_KEY) {
    config.generator.apiKey = process.env.ANTHROPIC_API_KEY;
    config.judge.apiKey = process.env.ANTHROPIC_API_KEY;
    config.optimizer.apiKey = process.env.ANTHROPIC_API_KEY;
    config.bot.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.OPENAI_API_KEY) {
    // If using OpenAI-compatible, update all configs
    config.generator.apiKey = process.env.OPENAI_API_KEY;
    config.judge.apiKey = process.env.OPENAI_API_KEY;
    config.optimizer.apiKey = process.env.OPENAI_API_KEY;
    config.bot.apiKey = process.env.OPENAI_API_KEY;
  }

  if (process.env.OPENAI_BASE_URL) {
    config.generator.baseUrl = process.env.OPENAI_BASE_URL;
    config.judge.baseUrl = process.env.OPENAI_BASE_URL;
    config.optimizer.baseUrl = process.env.OPENAI_BASE_URL;
    config.bot.baseUrl = process.env.OPENAI_BASE_URL;
  }

  return config;
}

/**
 * Validate required environment variables
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    missing.push('ANTHROPIC_API_KEY or OPENAI_API_KEY');
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
