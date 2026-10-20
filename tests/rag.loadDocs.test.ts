import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDocs } from "../src/lib/rag/loadDocs";

describe("loadDocs", () => {
  it("loads França and Japão with required frontmatter fields", () => {
    const docs = loadDocs();
    const franca = docs.find((d) => d.country === "França");
    const japao = docs.find((d) => d.country === "Japão");
    expect(franca).toBeDefined();
    expect(japao).toBeDefined();
    expect(franca?.nationality).toBe("Brasileira");
    expect(franca?.content.length).toBeGreaterThan(0);
  });

  it("throws a clear error when a required frontmatter field is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-docs-"));
    fs.writeFileSync(
      path.join(dir, "incompleto.md"),
      "---\ncountry: Teste\n---\nConteúdo sem os demais campos.\n"
    );
    expect(() => loadDocs(dir)).toThrow(/frontmatter ausente/);
  });
});
