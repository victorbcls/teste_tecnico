import { z } from "zod";
import { loadDocs } from "../rag/loadDocs";
import { buildVectorStore, searchChunks, RagChunk } from "../rag/vectorStore";
import { EmbeddingsLike } from "../rag/embeddings";

export const CallRagInputSchema = z.object({
  query: z.string().min(1),
  country: z.string().optional(),
});
export type CallRagInput = z.infer<typeof CallRagInputSchema>;

export interface CallRagOutput {
  found: boolean;
  chunks: Array<{ text: string; source: string; country: string }>;
}

let cachedChunks: RagChunk[] | null = null;

export async function callRag(
  input: CallRagInput,
  embeddings: EmbeddingsLike
): Promise<CallRagOutput> {
  if (!cachedChunks) {
    cachedChunks = await buildVectorStore(loadDocs(), embeddings);
  }
  const results = await searchChunks(cachedChunks, input.query, embeddings, {
    country: input.country,
  });
  if (results.length === 0) {
    return { found: false, chunks: [] };
  }
  return {
    found: true,
    chunks: results.map((r) => ({
      text: r.text,
      source: r.source,
      country: r.country,
    })),
  };
}

export function resetRagCache(): void {
  cachedChunks = null;
}
