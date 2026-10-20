import { describe, it, expect } from "vitest";
import { buildVectorStore, searchChunks } from "../src/lib/rag/vectorStore";
import { fakeEmbeddings } from "./fakeEmbeddings";
import { RagDocument } from "../src/lib/rag/loadDocs";

const docs: RagDocument[] = [
  {
    id: "franca",
    country: "França",
    nationality: "Brasileira",
    purpose: "Turismo",
    duration: "até 90 dias",
    content:
      "Documentação para a França: passaporte e seguro exigidos para turismo.",
    source: "franca.md",
  },
  {
    id: "japao",
    country: "Japão",
    nationality: "Brasileira",
    purpose: "Turismo",
    duration: "até 90 dias",
    content:
      "Documentação para o Japão: passaporte válido, sem visto exigido para turismo.",
    source: "japao.md",
  },
];

describe("vectorStore", () => {
  it("retrieves the most relevant chunk for a country-specific query", async () => {
    const chunks = await buildVectorStore(docs, fakeEmbeddings);
    const results = await searchChunks(
      chunks,
      "Preciso de visto e seguro para a França?",
      fakeEmbeddings
    );
    expect(results[0].country).toBe("França");
  });

  it("filters results by country when provided", async () => {
    const chunks = await buildVectorStore(docs, fakeEmbeddings);
    const results = await searchChunks(chunks, "passaporte", fakeEmbeddings, {
      country: "Japão",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.country === "Japão")).toBe(true);
  });

  it("returns no results when the query has no overlap with the base (sem evidência)", async () => {
    const chunks = await buildVectorStore(docs, fakeEmbeddings);
    const results = await searchChunks(
      chunks,
      "previsão do tempo amanhã",
      fakeEmbeddings
    );
    expect(results).toEqual([]);
  });
});
