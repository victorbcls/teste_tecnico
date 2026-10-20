import { RagDocument } from "./loadDocs";
import { EmbeddingsLike } from "./embeddings";

export interface RagChunk {
  docId: string;
  country: string;
  nationality: string;
  purpose: string;
  duration: string;
  source: string;
  text: string;
  embedding: number[];
}

export interface SearchResult {
  text: string;
  source: string;
  country: string;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function buildVectorStore(
  docs: RagDocument[],
  embeddings: EmbeddingsLike
): Promise<RagChunk[]> {
  const vectors = await embeddings.embedDocuments(docs.map((d) => d.content));
  return docs.map((doc, i) => ({
    docId: doc.id,
    country: doc.country,
    nationality: doc.nationality,
    purpose: doc.purpose,
    duration: doc.duration,
    source: doc.source,
    text: doc.content,
    embedding: vectors[i],
  }));
}

export async function searchChunks(
  chunks: RagChunk[],
  query: string,
  embeddings: EmbeddingsLike,
  opts: { k?: number; country?: string; minScore?: number } = {}
): Promise<SearchResult[]> {
  const k = opts.k ?? 3;
  const minScore = opts.minScore ?? Number(process.env.RAG_MIN_SCORE ?? 0.3);
  const queryVector = await embeddings.embedQuery(query);

  const pool = opts.country
    ? chunks.filter(
        (c) => c.country.toLowerCase() === opts.country!.toLowerCase()
      )
    : chunks;

  return pool
    .map((chunk) => ({
      text: chunk.text,
      source: chunk.source,
      country: chunk.country,
      score: cosineSimilarity(queryVector, chunk.embedding),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
