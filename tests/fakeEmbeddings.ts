import { EmbeddingsLike } from "../src/lib/rag/embeddings";

const VOCAB = ["frança", "japão", "visto", "turismo", "passaporte", "seguro"];

function vectorize(text: string): number[] {
  const normalized = text.toLowerCase();
  return VOCAB.map((word) => (normalized.includes(word) ? 1 : 0));
}

export const fakeEmbeddings: EmbeddingsLike = {
  async embedQuery(text: string) {
    return vectorize(text);
  },
  async embedDocuments(texts: string[]) {
    return texts.map(vectorize);
  },
};
