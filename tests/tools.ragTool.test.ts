import { describe, it, expect, beforeEach } from "vitest";
import { callRag, resetRagCache } from "../src/lib/tools/ragTool";
import { fakeEmbeddings } from "./fakeEmbeddings";

describe("callRag", () => {
  beforeEach(() => resetRagCache());

  it("returns found=true with sources for a query covered by the base", async () => {
    const result = await callRag(
      { query: "Preciso de visto e seguro para a França?" },
      fakeEmbeddings
    );
    expect(result.found).toBe(true);
    expect(result.chunks[0].source).toBe("franca.md");
  });

  it("returns found=false when there is no evidence in the base", async () => {
    const result = await callRag(
      { query: "previsão do tempo amanhã" },
      fakeEmbeddings
    );
    expect(result.found).toBe(false);
    expect(result.chunks).toEqual([]);
  });
});
