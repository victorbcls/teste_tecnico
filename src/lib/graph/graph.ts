import {
  StateGraph,
  MemorySaver,
  Annotation,
  END,
  START,
} from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { GraphState, GraphStateType } from "./state";
import { AssistantConfig } from "./assistants";
import { ChatModelLike } from "./chatModel";
import { ToolDefinition } from "./toolDefinitions";
import { agentNode } from "./nodes/agent";
import { toolsNode } from "./nodes/tools";
import { proposeEscalationNode } from "./nodes/proposeEscalation";
import { registerEscalationNode } from "./nodes/registerEscalation";

/**
 * Per-run configuration the nodes read from `config.configurable`.
 * Declaring it as the graph's context schema is what types the second argument
 * of every node as `Runtime<GraphContextType>` instead of an empty record.
 */
export const GraphContext = Annotation.Root({
  assistant: Annotation<AssistantConfig>,
  model: Annotation<ChatModelLike>,
  tools: Annotation<ToolDefinition[]>,
});

export type GraphContextType = typeof GraphContext.State;

function lastAiMessage(state: GraphStateType): AIMessage | undefined {
  const last = state.messages[state.messages.length - 1];
  return last instanceof AIMessage ? last : undefined;
}

function routeAfterAgent(
  state: GraphStateType
): "proposeEscalation" | "tools" | typeof END {
  const ai = lastAiMessage(state);
  const calls = ai?.tool_calls ?? [];
  if (calls.length === 0) return END;
  if (calls.some((c) => c.name === "registrar_escalonamento")) {
    return "proposeEscalation";
  }
  return "tools";
}

function routeAfterPropose(
  state: GraphStateType
): "registerEscalation" | typeof END {
  return state.escalationApproved === true ? "registerEscalation" : END;
}

export function buildGraph() {
  const graph = new StateGraph(GraphState, GraphContext)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addNode("proposeEscalation", proposeEscalationNode)
    .addNode("registerEscalation", registerEscalationNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      tools: "tools",
      proposeEscalation: "proposeEscalation",
      [END]: END,
    })
    .addEdge("tools", "agent")
    .addConditionalEdges("proposeEscalation", routeAfterPropose, {
      registerEscalation: "registerEscalation",
      [END]: END,
    })
    .addEdge("registerEscalation", "agent");

  return graph.compile({ checkpointer: new MemorySaver() });
}
