import type { AiProvider } from './provider';

/** Claude via the Messages API with tool use. Server-side only; the key never reaches the browser. */
export function anthropicProvider(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): AiProvider {
  return {
    name: 'anthropic',
    model,
    async complete({ system, messages, tools, maxTokens, signal }) {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, system, messages, tools, max_tokens: maxTokens, temperature: 0 }),
      });
      if (!res.ok) throw new Error(`AI provider error ${res.status}`);
      const j: any = await res.json();
      return { content: j.content ?? [], stopReason: j.stop_reason, usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 } };
    },
  };
}
