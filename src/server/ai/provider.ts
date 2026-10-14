// Model-provider abstraction. The marketplace never depends on a specific vendor.
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
export type ChatMessage =
  | { role: 'user'; content: string | ContentBlock[] }
  | { role: 'assistant'; content: ContentBlock[] };
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ModelTurn { content: ContentBlock[]; stopReason: string; usage?: { input: number; output: number } }

export interface AiProvider {
  name: string;
  model: string;
  complete(args: { system: string; messages: ChatMessage[]; tools: ToolDef[]; maxTokens: number; signal?: AbortSignal }): Promise<ModelTurn>;
}
