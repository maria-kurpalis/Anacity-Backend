import { ApiError } from '../../types/api';
import type { AIProvider } from '../../types/agent';
import { invalidAgentOutput } from '../../validation/agent';
import { isObject } from '../../validation/move-request';
import {
  assessmentInstructions, assessmentSchema, boundaries, chatInstructions, chatSchema,
  logProviderDiagnostic, logProviderException, logProviderHttpError, normalizeChatResult,
  parseProviderJson, serializeAIInput, unavailableAI, unreachableAI,
} from './shared';

interface OpenAIConfig { apiKey: string; model: string; timeoutMs: number }

export function createOpenAIProvider(config: OpenAIConfig): AIProvider {
  async function generate(name: string, schema: object, instructions: string, input: unknown): Promise<unknown> {
    const serialized = serializeAIInput(input);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs),
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model, store: false, max_output_tokens: 4000,
          instructions: `${boundaries}\n${instructions}`,
          input: [{ role: 'user', content: [{ type: 'input_text', text: serialized }] }],
          text: { format: { type: 'json_schema', name, strict: true, schema } },
        }),
      });
      const responseText = await response.text();
      if (!response.ok) {
        logProviderHttpError('openai', name, response, responseText, config.apiKey);
        return unavailableAI();
      }

      const result = parseProviderJson(responseText, 'openai', name, 'response_envelope');
      if (!isObject(result) || result.status !== 'completed' || !Array.isArray(result.output)) {
        logProviderDiagnostic({ provider: 'openai', operation: name, stage: 'response_shape', reason: 'Response was not completed or had no output array.' });
        return invalidAgentOutput();
      }
      const texts: string[] = [];
      for (const item of result.output) {
        if (!isObject(item) || item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (isObject(part) && part.type === 'refusal') {
            logProviderDiagnostic({ provider: 'openai', operation: name, stage: 'response_refusal', reason: 'Provider refused the structured request.' });
            return invalidAgentOutput();
          }
          if (isObject(part) && part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
        }
      }
      if (texts.length !== 1) {
        logProviderDiagnostic({ provider: 'openai', operation: name, stage: 'response_shape', reason: `Expected one output text part; received ${texts.length}.` });
        return invalidAgentOutput();
      }
      return parseProviderJson(texts[0], 'openai', name, 'structured_output');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logProviderException('openai', name, error, config.apiKey);
      return unreachableAI();
    }
  }

  return {
    async chat(input) {
      return normalizeChatResult(await generate('resident_chat', chatSchema, chatInstructions, input));
    },
    generateAssessment(input) {
      return generate('admin_assessment', assessmentSchema, assessmentInstructions, input);
    },
  };
}
