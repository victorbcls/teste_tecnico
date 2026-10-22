#!/usr/bin/env bash
# Baixa no Ollama local os modelos configurados em .env.local (ou os
# defaults do projeto, se o arquivo não existir ou a variável não estiver
# definida). Rode depois de trocar OLLAMA_MODEL / OLLAMA_EMBEDDING_MODEL.
set -euo pipefail

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

CHAT_MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct}"
EMBEDDING_MODEL="${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text}"

echo "Baixando modelo de chat: $CHAT_MODEL"
ollama pull "$CHAT_MODEL"

echo "Baixando modelo de embeddings: $EMBEDDING_MODEL"
ollama pull "$EMBEDDING_MODEL"

echo "Pronto. Modelos disponíveis:"
ollama list
