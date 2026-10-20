import { describe, it, expect } from "vitest";
import {
  MOCK_CHAMADOS,
  listarChamados,
  consultarChamado,
} from "../src/lib/tools/mockChamados";
import { NotFoundError } from "../src/lib/tools/errors";

describe("mockChamados", () => {
  it("contains CH-101 and CH-103 aberto, CH-102 resolvido", () => {
    expect(MOCK_CHAMADOS.find((c) => c.id === "CH-101")?.situacao).toBe(
      "aberto"
    );
    expect(MOCK_CHAMADOS.find((c) => c.id === "CH-102")?.situacao).toBe(
      "resolvido"
    );
    expect(MOCK_CHAMADOS.find((c) => c.id === "CH-103")?.situacao).toBe(
      "aberto"
    );
  });

  it("listarChamados with no filter returns all chamados", () => {
    expect(listarChamados({})).toHaveLength(MOCK_CHAMADOS.length);
  });

  it("listarChamados filters by situacao=aberto to CH-101 and CH-103 only", () => {
    const result = listarChamados({ situacao: "aberto" });
    expect(result.map((c) => c.id).sort()).toEqual(["CH-101", "CH-103"]);
  });

  it("consultarChamado returns the matching chamado", () => {
    expect(consultarChamado({ id: "CH-102" }).situacao).toBe("resolvido");
  });

  it("consultarChamado throws NotFoundError for unknown id", () => {
    expect(() => consultarChamado({ id: "CH-999" })).toThrow(NotFoundError);
  });
});
