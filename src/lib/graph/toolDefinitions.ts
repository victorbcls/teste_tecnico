import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
  RegistrarEscalonamentoInputSchema,
} from "../tools/schemas";
import { CallRagInputSchema } from "../tools/ragTool";

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
  {
    name: "call_rag",
    description:
      "Recupera trechos da base própria de documentação de viagens, opcionalmente " +
      "filtrando por país. Retorna found=false quando não há evidência suficiente.",
    schema: CallRagInputSchema,
  },
];
