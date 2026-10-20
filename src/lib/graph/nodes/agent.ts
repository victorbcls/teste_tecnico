import { SystemMessage } from "@langchain/core/messages";
import { GraphStateType } from "../state";
import { AssistantConfig } from "../assistants";
import { ChatModelLike } from "../chatModel";
import { ToolDefinition } from "../toolDefinitions";

export interface AgentConfigurable {
  assistant: AssistantConfig;
  model: ChatModelLike;
  tools: ToolDefinition[];
}

export async function agentNode(
  state: GraphStateType,
  config: { configurable?: AgentConfigurable }
) {
  const configurable = config.configurable;
  if (!configurable) {
    throw new Error(
      "agentNode requer config.configurable.{assistant,model,tools}"
    );
  }
  const { assistant, model, tools } = configurable;
  const allowedTools = tools.filter((t) =>
    assistant.allowedTools.includes(t.name)
  );
  const bound = model.bindTools(allowedTools);
  const messages = [
    new SystemMessage(assistant.systemPrompt),
    ...state.messages,
  ];
  const response = await bound.invoke(messages);
  return { messages: [response] };
}
