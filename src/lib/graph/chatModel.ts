import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ToolDefinition } from "./toolDefinitions";

export interface BoundChatModel {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
}

export interface ChatModelLike {
  bindTools(tools: ToolDefinition[]): BoundChatModel;
}
