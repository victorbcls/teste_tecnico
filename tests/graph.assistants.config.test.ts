import { describe, it, expect } from "vitest";
import { ASSISTANTS } from "../src/lib/graph/assistants";

describe("ASSISTANTS config", () => {
  it("defines suporte with chamados tools and no call_rag", () => {
    const suporte = ASSISTANTS.suporte;
    expect(suporte.id).toBe("suporte");
    expect(suporte.allowedTools).toEqual(
      expect.arrayContaining([
        "listar_chamados",
        "consultar_chamado",
        "registrar_escalonamento",
      ])
    );
    expect(suporte.allowedTools).not.toContain("call_rag");
    expect(suporte.systemPrompt.length).toBeGreaterThan(0);
  });

  it("defines viagens with only call_rag", () => {
    const viagens = ASSISTANTS.viagens;
    expect(viagens.id).toBe("viagens");
    expect(viagens.allowedTools).toEqual(["call_rag"]);
    expect(viagens.systemPrompt.length).toBeGreaterThan(0);
  });

  it("keeps suporte and viagens tool sets disjoint", () => {
    const overlap = ASSISTANTS.suporte.allowedTools.filter((t) =>
      ASSISTANTS.viagens.allowedTools.includes(t)
    );
    expect(overlap).toEqual([]);
  });
});
