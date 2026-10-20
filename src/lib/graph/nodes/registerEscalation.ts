import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { RegistrarEscalonamentoInputSchema } from "../../tools/schemas";
import { InvalidInputError } from "../../tools/errors";
import { GraphStateType, EscalationRecord } from "../state";

function buildEscalationRecord(rawArgs: unknown): EscalationRecord {
  const parsed = RegistrarEscalonamentoInputSchema.safeParse(rawArgs);
  if (!parsed.success) throw new InvalidInputError(parsed.error.message);
  return {
    chamadoId: parsed.data.chamadoId,
    resumo: parsed.data.resumo,
    justificativa: parsed.data.justificativa,
    registeredAt: new Date().toISOString(),
  };
}

function findPendingEscalationCall(state: GraphStateType) {
  const lastAiMessage = [...state.messages]
    .reverse()
    .find(
      (m) => m instanceof AIMessage && (m.tool_calls?.length ?? 0) > 0
    ) as AIMessage | undefined;
  return lastAiMessage?.tool_calls?.find(
    (c) => c.name === "registrar_escalonamento"
  );
}

export async function registerEscalationNode(state: GraphStateType) {
  const escalationCall = findPendingEscalationCall(state);
  if (!escalationCall) {
    throw new InvalidInputError(
      "registerEscalationNode chamado sem uma proposta de registrar_escalonamento pendente"
    );
  }

  const record = buildEscalationRecord(escalationCall.args);

  // Idempotência só vale para o MESMO chamado: um resume repetido da mesma
  // proposta devolve o registro em cache, mas um escalonamento de outro
  // chamado nunca pode ser confirmado com o registro anterior.
  if (
    state.escalationRegistered &&
    state.escalationRecord &&
    state.escalationRecord.chamadoId === record.chamadoId
  ) {
    return {
      messages: [
        new ToolMessage({
          tool_call_id: escalationCall.id ?? "registrar_escalonamento",
          content: JSON.stringify({
            alreadyRegistered: true,
            record: state.escalationRecord,
          }),
        }),
      ],
    };
  }

  return {
    escalationRegistered: true,
    escalationRecord: record,
    messages: [
      new ToolMessage({
        tool_call_id: escalationCall.id ?? "registrar_escalonamento",
        content: JSON.stringify({ registered: true, record }),
      }),
    ],
  };
}
