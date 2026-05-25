import { z } from "zod";
import { env } from "@/lib/config";
import { logger } from "@/lib/logger";
import { createOpenAiClient } from "@/lib/openai";

export async function completeJson<T>({
  system,
  user,
  schema,
  fallback,
  trace
}: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  fallback: () => T;
  trace: { agent: string };
}): Promise<{ value: T; tokenUsage?: { input: number; output: number } }> {
  const client = createOpenAiClient();
  if (!client) return { value: fallback() };

  try {
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const content = response.choices[0]?.message.content;
    if (!content) return { value: fallback() };

    return {
      value: schema.parse(JSON.parse(content)),
      tokenUsage: response.usage
        ? {
            input: response.usage.prompt_tokens,
            output: response.usage.completion_tokens
          }
        : undefined
    };
  } catch (error) {
    logger.warn("llm.completion_fallback", {
      agent: trace.agent,
      error: error instanceof Error ? error.message : String(error)
    });
    return { value: fallback() };
  }
}
