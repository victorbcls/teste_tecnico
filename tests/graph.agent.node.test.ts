import { describe, it, expect } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { agentNode } from "../src/lib/graph/nodes/agent";
import { createFakeChatModel } from "./fakeChatModel";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { GraphStateType } from "../src/lib/graph/state";

describe("agentNode", () => {
  it("invokes the bound model with the assistant system prompt and returns its response", async () => {
    const scripted = new AIMessage({ content: "Olá! Como posso ajudar?" });
    const model = createFakeChatModel([scripted]);
    const state = {
      messages: [],
      escalationRegistered: false,
      escalationRecord: null,
    } as unknown as GraphStateType;

    const result = await agentNode(state, {
      configurable: {
        assistant: ASSISTANTS.suporte,
        model,
        tools: TOOL_DEFINITIONS,
      },
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toBe(scripted);
  });

  it("throws a clear error when config.configurable is missing", async () => {
    const state = {
      messages: [],
      escalationRegistered: false,
      escalationRecord: null,
    } as unknown as GraphStateType;
    await expect(agentNode(state, {})).rejects.toThrow(/configurable/);
  });
});
