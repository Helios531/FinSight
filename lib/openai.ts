import OpenAI from "openai";
import { env, hasOpenAi } from "@/lib/config";

export function createOpenAiClient() {
  if (!hasOpenAi || !env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}
