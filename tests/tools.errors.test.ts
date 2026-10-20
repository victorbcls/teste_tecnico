import { describe, it, expect } from "vitest";
import {
  NotFoundError,
  InvalidInputError,
  UnknownToolError,
  ToolNotAllowedError,
} from "../src/lib/tools/errors";

describe("tool errors", () => {
  it("NotFoundError carries code and message", () => {
    const err = new NotFoundError("CH-999");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("CH-999");
  });

  it("InvalidInputError carries code and details", () => {
    const err = new InvalidInputError("situacao inválida");
    expect(err.code).toBe("INVALID_INPUT");
    expect(err.message).toBe("situacao inválida");
  });

  it("UnknownToolError carries code and tool name", () => {
    const err = new UnknownToolError("apagar_chamado");
    expect(err.code).toBe("UNKNOWN_TOOL");
    expect(err.message).toContain("apagar_chamado");
  });

  it("ToolNotAllowedError carries code, tool and assistant", () => {
    const err = new ToolNotAllowedError("call_rag", "suporte");
    expect(err.code).toBe("TOOL_NOT_ALLOWED");
    expect(err.message).toContain("call_rag");
    expect(err.message).toContain("suporte");
  });
});
