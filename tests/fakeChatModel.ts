import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ChatModelLike, BoundChatModel } from "../src/lib/graph/chatModel";
import { ToolDefinition } from "../src/lib/graph/toolDefinitions";

export function createFakeChatModel(script: AIMessage[]): ChatModelLike {
  let callIndex = 0;
  return {
    bindTools(_tools: ToolDefinition[]): BoundChatModel {
      return {
        async invoke(_messages: BaseMessage[]): Promise<AIMessage> {
          const response = script[callIndex];
          if (!response) {
            throw new Error(
              `FakeChatModel: sem resposta roteirizada para chamada #${
                callIndex + 1
              }`
            );
          }
          callIndex += 1;
          return response;
        },
      };
    },
  };
}
