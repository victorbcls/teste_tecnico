import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export interface EscalationRecord {
  chamadoId: string;
  resumo: string;
  justificativa: string;
  registeredAt: string;
}

export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  escalationApproved: Annotation<boolean | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  escalationRegistered: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  escalationRecord: Annotation<EscalationRecord | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type GraphStateType = typeof GraphState.State;
