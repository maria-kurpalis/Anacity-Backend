import { ApiError } from '../../types/api';
import type { AIProvider } from '../../types/agent';
import { invalidAgentOutput } from '../../validation/agent';
import { isObject } from '../../validation/move-request';
import {
  assessmentInstructions, assessmentSchema, boundaries, chatInstructions, chatSchema,
  logProviderDiagnostic, logProviderException, logProviderHttpError, normalizeChatResult,
  parseProviderJson, serializeAIInput, unavailableAI, unreachableAI,
} from './shared';

interface GeminiConfig { apiKey: string; model: string; timeoutMs: number }

export function createGeminiProvider(config: GeminiConfig): AIProvider {
  async function generate(operation: string, schema: object, instructions: string, input: unknown): Promise<unknown> {
    const serialized = serializeAIInput(input);
    const model = encodeURIComponent(config.model);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs),
        headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${boundaries}\n${instructions}` }] },
          contents: [{ role: 'user', parts: [{ text: serialized }] }],
          generationConfig: {
            responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 4000,
          },
        }),
      });
      const responseText = await response.text();
      if (!response.ok) {
        logProviderHttpError('gemini', operation, response, responseText, config.apiKey);
        return unavailableAI();
      }

      const result = parseProviderJson(responseText, 'gemini', operation, 'response_envelope');
      if (!isObject(result) || !Array.isArray(result.candidates) || result.candidates.length !== 1) {
        logProviderDiagnostic({ provider: 'gemini', operation, stage: 'response_shape', reason: 'Expected exactly one response candidate.' });
        return invalidAgentOutput();
      }
      const candidate = result.candidates[0];
      if (!isObject(candidate) || candidate.finishReason !== 'STOP' || !isObject(candidate.content) || !Array.isArray(candidate.content.parts)) {
        const finishReason = isObject(candidate) && typeof candidate.finishReason === 'string' ? candidate.finishReason : 'missing';
        logProviderDiagnostic({ provider: 'gemini', operation, stage: 'response_shape', reason: `Response was incomplete or unusable; finish reason: ${finishReason}.` });
        return invalidAgentOutput();
      }
      const texts = candidate.content.parts
        .filter((part): part is Record<string, unknown> => isObject(part) && typeof part.text === 'string')
        .map((part) => part.text as string);
      if (texts.length !== 1) {
        logProviderDiagnostic({ provider: 'gemini', operation, stage: 'response_shape', reason: `Expected one text part; received ${texts.length}.` });
        return invalidAgentOutput();
      }
      return parseProviderJson(texts[0], 'gemini', operation, 'structured_output');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logProviderException('gemini', operation, error, config.apiKey);
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
