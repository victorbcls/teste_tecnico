import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
  RegistrarEscalonamentoInputSchema,
} from "../tools/schemas";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: unknown;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "listar_chamados",
    description:
      "Lista chamados mockados, com filtro opcional de situacao ('aberto' ou 'resolvido').",
    schema: ListarChamadosInputSchema,
  },
  {
    name: "consultar_chamado",
    description: "Busca um chamado mockado pelo identificador (ex: CH-101).",
    schema: ConsultarChamadoInputSchema,
  },
  {
    name: "registrar_escalonamento",
    description:
      "Prepara um escalonamento para um chamado aberto, com resumo e justificativa. " +
      "Só é efetivado após aprovação humana.",
    schema: RegistrarEscalonamentoInputSchema,
  },
];
