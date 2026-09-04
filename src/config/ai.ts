import 'dotenv/config';
import { ApiError } from '../types/api';

export type AIProviderName = 'openai' | 'gemini';

export interface AIConfig {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  timeoutMs: number;
  timeZone: string;
}

const configurationError = () => new ApiError(503, [{
  field: 'ai',
  message: 'AI is not configured correctly. Configure the provider, key, model, timeout and time zone, then retry.',
}]);

function configuredProvider(logErrors: boolean): AIProviderName {
  const provider = (process.env.AI_PROVIDER ?? 'openai').trim().toLowerCase();
  if (provider !== 'openai' && provider !== 'gemini') {
    if (logErrors) console.error('AI configuration invalid', { reason: 'AI_PROVIDER must be openai or gemini.' });
    throw configurationError();
  }
  return provider;
}

// Resolve lazily: normal APIs continue working when AI is not configured.
export function getAIConfig(options: { logErrors?: boolean } = {}): AIConfig {
  const logErrors = options.logErrors ?? true;
  const provider = configuredProvider(logErrors);
  const apiKey = (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)?.trim();
  const model = process.env.AI_MODEL?.trim();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 30000);
  const timeZone = (process.env.AI_TIME_ZONE ?? 'Asia/Kolkata').trim();
  let validZone = true;
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { validZone = false; }
  if (!apiKey || !model || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000 || !validZone) {
    if (logErrors) {
      const issues: string[] = [];
      if (!apiKey) issues.push(`${provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} is missing.`);
      if (!model) issues.push('AI_MODEL is missing.');
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) issues.push('AI_TIMEOUT_MS must be an integer from 1000 through 60000.');
      if (!validZone) issues.push('AI_TIME_ZONE is not a valid IANA time zone.');
      console.error('AI configuration invalid', { provider, issues });
    }
    throw configurationError();
  }

  return { provider, apiKey, model, timeoutMs, timeZone };
}

export function getAIConfigurationStatus(): { agentConfigured: boolean; provider: AIProviderName | null } {
  const rawProvider = (process.env.AI_PROVIDER ?? 'openai').trim().toLowerCase();
  const provider: AIProviderName | null = rawProvider === 'openai' || rawProvider === 'gemini' ? rawProvider : null;
  try {
    getAIConfig({ logErrors: false });
    return { agentConfigured: true, provider };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { agentConfigured: false, provider };
  }
}
