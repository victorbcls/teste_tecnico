import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { consultarChamado } from "../../tools/mockChamados";
import {
  NotFoundError,
  InvalidInputError,
  ToolNotAllowedError,
} from "../../tools/errors";
import { RegistrarEscalonamentoInputSchema } from "../../tools/schemas";
import { AssistantConfig } from "../assistants";
import { GraphStateType } from "../state";

export interface EscalationProposal {
  chamadoId: string;
  resumo: string;
  justificativa: string;
}

export interface EscalationDecision {
  approved: boolean;
}

export async function proposeEscalationNode(
  state: GraphStateType,
  config: { configurable?: { assistant?: AssistantConfig } }
) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const escalationCall = lastMessage.tool_calls?.find(
    (c) => c.name === "registrar_escalonamento"
  );
  if (!escalationCall) {
    throw new InvalidInputError(
      "proposeEscalationNode chamado sem tool_call registrar_escalonamento"
    );
  }

  // A separação de tools é aplicada no backend: um assistant sem
  // `registrar_escalonamento` na allowlist nunca chega a propor (nem a pausar
  // para aprovação humana), independente do que o modelo tenha emitido.
  const assistant = config.configurable?.assistant;
  if (!assistant?.allowedTools.includes("registrar_escalonamento")) {
    const error = new ToolNotAllowedError(
      "registrar_escalonamento",
      assistant?.id ?? "desconhecido"
    );
    return {
      messages: [
        new ToolMessage({
          tool_call_id: escalationCall.id ?? "registrar_escalonamento",
          content: JSON.stringify({ error: error.message }),
        }),
      ],
    };
  }

  const parsed = RegistrarEscalonamentoInputSchema.safeParse(
    escalationCall.args
  );
  if (!parsed.success) {
    return {
      escalationApproved: false,
      messages: [
        new AIMessage({
          content: `Não consigo preparar o escalonamento: ${parsed.error.message}`,
        }),
      ],
    };
  }

  try {
    const chamado = consultarChamado({ id: parsed.data.chamadoId });
    if (chamado.situacao !== "aberto") {
      return {
        escalationApproved: false,
        messages: [
          new AIMessage({
            content:
              `Não é possível escalonar ${chamado.id}: a situação atual é ` +
              `"${chamado.situacao}", só chamados abertos podem ser escalonados.`,
          }),
        ],
      };
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        escalationApproved: false,
        messages: [new AIMessage({ content: err.message })],
      };
    }
    throw err;
  }

  const proposal: EscalationProposal = {
    chamadoId: parsed.data.chamadoId,
    resumo: parsed.data.resumo,
    justificativa: parsed.data.justificativa,
  };

  const decision = interrupt<EscalationProposal, EscalationDecision>(proposal);

  if (!decision.approved) {
    return {
      escalationApproved: false,
      messages: [
        new AIMessage({
          content: `Escalonamento de ${proposal.chamadoId} rejeitado. Nada foi registrado.`,
        }),
      ],
    };
  }

  return { escalationApproved: true, messages: [] };
}
