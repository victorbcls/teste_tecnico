const BASE_URL = () => process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/**
 * Traduz erros comuns de conexão/modelo do Ollama para uma mensagem acionável,
 * em vez de expor o erro de rede/SDK cru até a UI.
 */
export function describeOllamaError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/not found|404/i.test(message) && /model/i.test(message)) {
    return (
      `Modelo não encontrado no Ollama (${BASE_URL()}). ` +
      `Confira OLLAMA_MODEL/OLLAMA_EMBEDDING_MODEL no .env.local e rode ` +
      `"pnpm models:pull" para baixá-los. Detalhe original: ${message}`
    );
  }

  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) {
    return (
      `Não foi possível conectar ao Ollama em ${BASE_URL()}. ` +
      `Confirme que "ollama serve" está rodando (ou o serviço "ollama" do ` +
      `docker compose) e que OLLAMA_BASE_URL aponta para o lugar certo. ` +
      `Detalhe original: ${message}`
    );
  }

  return message;
}
