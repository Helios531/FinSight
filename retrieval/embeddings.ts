import { createHash } from "node:crypto";
import { env } from "@/lib/config";
import { createOpenAiClient } from "@/lib/openai";

const fallbackDimensions = 256;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = createOpenAiClient();
  if (client) {
    const response = await client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: texts
    });

    return response.data.map((item) => item.embedding);
  }

  return texts.map(hashEmbedding);
}

export function hashEmbedding(text: string) {
  const vector = new Array<number>(fallbackDimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9$%.]+/g) ?? [];

  for (const token of tokens) {
    const hash = createHash("sha256").update(token).digest();
    vector[hash[0] % fallbackDimensions] += 1;
  }

  return normalize(vector);
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;

  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aMag += a[index] * a[index];
    bMag += b[index] * b[index];
  }

  return aMag === 0 || bMag === 0 ? 0 : dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}
