import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ChatModelLike, BoundChatModel } from "./graph/chatModel";
import { ToolDefinition } from "./graph/toolDefinitions";
import { EmbeddingsLike } from "./rag/embeddings";

export function createOllamaChatModel(): ChatModelLike {
  const model = new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    temperature: 0,
  });

  return {
    bindTools(tools: ToolDefinition[]): BoundChatModel {
      const bound = model.bindTools(
        tools.map((t) => ({
          name: t.name,
          description: t.description,
          schema: t.schema,
        }))
      );
      return {
        async invoke(messages: BaseMessage[]): Promise<AIMessage> {
          const response = await bound.invoke(messages);
          return response as AIMessage;
        },
      };
    },
  };
}

export function createOllamaEmbeddings(): EmbeddingsLike {
  const embeddings = new OllamaEmbeddings({
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
  });
  return {
    embedQuery: (text) => embeddings.embedQuery(text),
    embedDocuments: (texts) => embeddings.embedDocuments(texts),
  };
}
