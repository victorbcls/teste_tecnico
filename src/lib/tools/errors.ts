export class NotFoundError extends Error {
  code = "NOT_FOUND" as const;
  constructor(id: string) {
    super(`Chamado não encontrado: ${id}`);
    this.name = "NotFoundError";
  }
}

export class InvalidInputError extends Error {
  code = "INVALID_INPUT" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class UnknownToolError extends Error {
  code = "UNKNOWN_TOOL" as const;
  constructor(toolName: string) {
    super(`Ferramenta desconhecida: ${toolName}`);
    this.name = "UnknownToolError";
  }
}

export class ToolNotAllowedError extends Error {
  code = "TOOL_NOT_ALLOWED" as const;
  constructor(toolName: string, assistantId: string) {
    super(
      `Ferramenta "${toolName}" não é permitida para o assistant "${assistantId}"`
    );
    this.name = "ToolNotAllowedError";
  }
}
