import { z } from 'zod';

/**
 * Normalized events emitted by AgentService.
 * The renderer process must never receive raw SDK objects.
 */

export const AssistantTextDeltaEventSchema = z.object({
  type: z.literal('assistant_text_delta'),
  sessionId: z.string(),
  textDelta: z.string(),
});
export type AssistantTextDeltaEvent = z.infer<typeof AssistantTextDeltaEventSchema>;

export const ToolCallStartedEventSchema = z.object({
  type: z.literal('tool_call_started'),
  sessionId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  isRisky: z.boolean(),
});
export type ToolCallStartedEvent = z.infer<typeof ToolCallStartedEventSchema>;

export const ToolCallResultEventSchema = z.object({
  type: z.literal('tool_call_result'),
  sessionId: z.string(),
  toolCallId: z.string(),
  output: z.unknown(),
});
export type ToolCallResultEvent = z.infer<typeof ToolCallResultEventSchema>;

export const ToolCallErrorEventSchema = z.object({
  type: z.literal('tool_call_error'),
  sessionId: z.string(),
  toolCallId: z.string(),
  error: z.string(),
});
export type ToolCallErrorEvent = z.infer<typeof ToolCallErrorEventSchema>;

export const PermissionRequestEventSchema = z.object({
  type: z.literal('permission_request'),
  approvalId: z.string(),
  sessionId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  description: z.string(),
  expiresAt: z.string(),
});
export type PermissionRequestEvent = z.infer<typeof PermissionRequestEventSchema>;

export const RunFinishedEventSchema = z.object({
  type: z.literal('run_finished'),
  sessionId: z.string(),
  fullText: z.string().optional(),
  durationMs: z.number().optional(),
});
export type RunFinishedEvent = z.infer<typeof RunFinishedEventSchema>;

export const RunErrorEventSchema = z.object({
  type: z.literal('run_error'),
  sessionId: z.string(),
  error: z.string(),
});
export type RunErrorEvent = z.infer<typeof RunErrorEventSchema>;

export type AgentEvent =
  | AssistantTextDeltaEvent
  | ToolCallStartedEvent
  | ToolCallResultEvent
  | ToolCallErrorEvent
  | PermissionRequestEvent
  | RunFinishedEvent
  | RunErrorEvent;
