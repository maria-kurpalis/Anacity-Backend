import { getAIConfig } from '../../config/ai';
import type { AIProvider } from '../../types/agent';
import { createGeminiProvider } from './gemini.provider';
import { createOpenAIProvider } from './openai.provider';

export function getAIProvider(): AIProvider {
  const config = getAIConfig();
  return config.provider === 'gemini' ? createGeminiProvider(config) : createOpenAIProvider(config);
}
