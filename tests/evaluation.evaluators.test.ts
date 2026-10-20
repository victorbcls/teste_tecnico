import { describe, it, expect } from "vitest";
import {
  evaluateListarChamadosAbertos,
  evaluateNaoEscalonaResolvido,
  RunSummary,
} from "../evaluation/evaluators";

describe("evaluateListarChamadosAbertos", () => {
  it("approves a run that calls the tool and cites exactly CH-101 and CH-103", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "listar_chamados", args: { situacao: "aberto" } }],
      toolResults: [[{ id: "CH-101" }, { id: "CH-103" }]],
      finalAnswer: "Os chamados abertos são CH-101 e CH-103.",
    };
    expect(evaluateListarChamadosAbertos(run).score).toBe(1);
  });

  it("fails a run that skips the tool call entirely", () => {
    const run: RunSummary = {
      toolCalls: [],
      toolResults: [],
      finalAnswer: "Os chamados abertos são CH-101 e CH-103.",
    };
    const result = evaluateListarChamadosAbertos(run);
    expect(result.score).toBe(0);
    expect(result.comment).toContain("não foi chamada");
  });

  it("fails a run that invents a chamado not returned by the tool", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "listar_chamados", args: { situacao: "aberto" } }],
      toolResults: [[{ id: "CH-101" }, { id: "CH-103" }]],
      finalAnswer: "Os chamados abertos são CH-101, CH-103 e CH-104.",
    };
    const result = evaluateListarChamadosAbertos(run);
    expect(result.score).toBe(0);
    expect(result.comment).toContain("CH-104");
  });

  it("fails a run that omits CH-103", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "listar_chamados", args: { situacao: "aberto" } }],
      toolResults: [[{ id: "CH-101" }, { id: "CH-103" }]],
      finalAnswer: "O chamado aberto é CH-101.",
    };
    expect(evaluateListarChamadosAbertos(run).score).toBe(0);
  });

  it("fails a run called with the wrong situacao filter", () => {
    const run: RunSummary = {
      toolCalls: [
        { name: "listar_chamados", args: { situacao: "resolvido" } },
      ],
      toolResults: [[{ id: "CH-102" }]],
      finalAnswer: "O chamado resolvido é CH-102.",
    };
    const result = evaluateListarChamadosAbertos(run);
    expect(result.score).toBe(0);
    expect(result.comment).toContain('situacao="resolvido"');
  });
});

describe("evaluateNaoEscalonaResolvido", () => {
  it("approves a run that explains the chamado is already resolved", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "consultar_chamado", args: { id: "CH-102" } }],
      toolResults: [{ id: "CH-102", situacao: "resolvido" }],
      finalAnswer: "O CH-102 já está resolvido, não é possível escalonar.",
    };
    expect(evaluateNaoEscalonaResolvido(run).score).toBe(1);
  });

  it("fails a run that escalates a resolved chamado anyway", () => {
    const run: RunSummary = {
      toolCalls: [
        { name: "consultar_chamado", args: { id: "CH-102" } },
        { name: "registrar_escalonamento", args: { chamadoId: "CH-102" } },
      ],
      toolResults: [{ id: "CH-102", situacao: "resolvido" }],
      finalAnswer: "Escalonamento registrado para CH-102.",
    };
    expect(evaluateNaoEscalonaResolvido(run).score).toBe(0);
  });
});
