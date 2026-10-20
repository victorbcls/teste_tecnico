import { describe, it, expect } from "vitest";
import {
  ChamadoSchema,
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
  RegistrarEscalonamentoInputSchema,
} from "../src/lib/tools/schemas";

describe("tool schemas", () => {
  it("accepts a valid chamado", () => {
    const result = ChamadoSchema.safeParse({
      id: "CH-101",
      situacao: "aberto",
      titulo: "Erro de login",
      descricao: "Usuário não consegue logar",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a chamado with invalid situacao", () => {
    const result = ChamadoSchema.safeParse({
      id: "CH-101",
      situacao: "pendente",
      titulo: "x",
      descricao: "y",
    });
    expect(result.success).toBe(false);
  });

  it("accepts listar_chamados input with optional situacao", () => {
    expect(ListarChamadosInputSchema.safeParse({}).success).toBe(true);
    expect(
      ListarChamadosInputSchema.safeParse({ situacao: "aberto" }).success
    ).toBe(true);
    expect(
      ListarChamadosInputSchema.safeParse({ situacao: "invalida" }).success
    ).toBe(false);
  });

  it("requires id for consultar_chamado", () => {
    expect(ConsultarChamadoInputSchema.safeParse({}).success).toBe(false);
    expect(
      ConsultarChamadoInputSchema.safeParse({ id: "CH-101" }).success
    ).toBe(true);
  });

  it("requires chamadoId, resumo and justificativa for registrar_escalonamento", () => {
    expect(
      RegistrarEscalonamentoInputSchema.safeParse({
        chamadoId: "CH-101",
        resumo: "resumo",
        justificativa: "justificativa",
      }).success
    ).toBe(true);
    expect(
      RegistrarEscalonamentoInputSchema.safeParse({ chamadoId: "CH-101" })
        .success
    ).toBe(false);
  });
});
