# Aurora Support Assistant

Assistente de suporte para a empresa fictícia Aurora: consulta chamados
mockados, lista por situação, e só registra um escalonamento depois de
aprovação humana explícita. Orquestrado em LangGraph.js, servido por
Next.js, instrumentado com LangSmith.

## Requisitos

- Node.js 20 (ver `.nvmrc`)
- pnpm
- [Ollama](https://ollama.com) rodando localmente, com o modelo de chat e o
  de embeddings baixados (veja [Trocando o modelo](#trocando-o-modelo))
- Conta gratuita no [LangSmith](https://smith.langchain.com) para rodar a
  avaliação e ver os traces (opcional para só rodar os testes offline)

Ou pule tudo isso e use [Docker](#rodando-com-docker).

## Instalação

```bash
pnpm install
cp .env.example .env.local
# edite .env.local e preencha LANGCHAIN_API_KEY (opcional)
pnpm models:pull   # baixa os modelos configurados em .env.local no Ollama
```

## Rodando

```bash
ollama serve &
pnpm dev
```

Abra `http://localhost:3000`.

## Rodando com Docker

Sobe o app e o Ollama (com os modelos já baixados automaticamente) num só
comando, sem precisar instalar Node nem Ollama na máquina:

```bash
cp .env.docker.example .env   # docker compose lê .env automaticamente
docker compose up --build
```

Abra `http://localhost:3000`. O serviço `ollama-pull` baixa os modelos
configurados e sai; o serviço `app` só sobe depois que ele terminar — a
primeira subida demora alguns minutos (download dos pesos). Os modelos
ficam num volume (`ollama_data`), então não baixam de novo nas próximas
subidas a menos que você troque de modelo.

Para usar GPU NVIDIA, descomente o bloco `deploy.resources` do serviço
`ollama` em `docker-compose.yml` (requer o
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
no host). Sem isso o Ollama roda em CPU — funciona, mas é bem mais lento.

## Trocando o modelo

O chat e os embeddings são 100% configuráveis por variável de ambiente —
nunca há um nome de modelo hardcoded no código
(`src/lib/llm.ts`):

| Variável                 | Papel                 | Default                |
| ------------------------ | ---------------------- | ----------------------- |
| `OLLAMA_MODEL`            | Modelo de chat (precisa suportar tool calling) | `qwen2.5:7b-instruct` |
| `OLLAMA_EMBEDDING_MODEL`  | Modelo de embeddings (bônus RAG) | `nomic-embed-text` |
| `OLLAMA_BASE_URL`         | Onde falar com o Ollama | `http://localhost:11434` |

Para trocar: edite a variável em `.env.local` (local) ou `.env` (Docker) e
rode `pnpm models:pull` (local) ou `docker compose up --build` de novo
(Docker) — o serviço `ollama-pull` baixa o modelo novo antes do app subir.

Modelos testados/recomendados (todos suportam tool calling, exigido pelo
grafo):

- `qwen2.5:7b-instruct` (default) — bom equilíbrio qualidade/velocidade.
- `qwen2.5:3b-instruct` ou `llama3.2:3b-instruct` — hardware modesto/CPU.
- `mistral-nemo` ou `llama3.1:8b` — mais robusto, se a máquina aguentar.

Se o modelo configurado não estiver puxado (ou o Ollama estiver fora do
ar), a API devolve um erro já traduzido explicando o que fazer, em vez de
uma mensagem de rede crua (`src/lib/ollamaErrors.ts`).

## Testes offline

```bash
pnpm test
```

Cobrem os 7 cenários exigidos (consulta/listagem, chamado resolvido,
aprovação/rejeição, aprovação repetida, falha transitória, saída
inválida/limites, sessões isoladas) com um modelo de chat fake
determinístico — nenhum teste chama rede ou o Ollama real.

## Avaliação no LangSmith

```bash
pnpm seed:dataset
pnpm eval
```

Usa o modelo real configurado em `OLLAMA_MODEL` (padrão
`qwen2.5:7b-instruct`). O dataset `aurora-support-eval` tem o caso
obrigatório ("Liste todos os chamados abertos.") e um caso adicional
("Consulte o CH-102 e prepare um escalonamento se ele estiver aberto.").
Os avaliadores (`evaluation/evaluators.ts`) checam os tool calls reais do
run, não só o texto final — reprovam qualquer resposta que pule a
consulta ou cite um chamado que a tool não retornou (testado em
`tests/evaluation.evaluators.test.ts`).

## Fluxo

Solicitação → consulta (tool real) → proposta de escalonamento → pausa do
LangGraph (`interrupt()`) aguardando aprovação → aprovado registra
(idempotente), rejeitado encerra sem registrar → confirmação final.

Detalhes de arquitetura em
`docs/superpowers/specs/2026-10-20-aurora-support-assistant-design.md`.

## Decisões

- Checkpoint em memória (`MemorySaver`) — suficiente para o desafio, sem
  banco de dados.
- Pausa/retomada via `interrupt()` dinâmico num nó dedicado, não
  `interruptBefore` estático — permite moldar o payload exibido e o
  payload de retomada.
- Regra "só chamado aberto escala" é checada em código antes do
  `interrupt()`, nunca delegada só ao prompt.
- Modelo local via Ollama para rodar sem custo nenhum; `OLLAMA_MODEL` e
  `OLLAMA_EMBEDDING_MODEL` são 100% trocáveis por variável de ambiente, sem
  nenhum nome de modelo hardcoded fora do default (veja
  [Trocando o modelo](#trocando-o-modelo)).
- `output: "standalone"` no Next.js + Dockerfile multi-stage para uma
  imagem de runtime enxuta; `docker-compose.yml` orquestra `app` + `ollama`
  + um serviço `ollama-pull` que baixa os modelos antes do app subir, pra
  não precisar instalar nada além do Docker.
- Erros de conexão/modelo do Ollama são traduzidos para uma mensagem
  acionável (`src/lib/ollamaErrors.ts`) em vez de vazar o erro de rede/SDK
  cru até a UI.

## Limitações conhecidas

- Checkpoint em memória: o histórico se perde ao reiniciar o servidor.
- Sem autenticação — uso local/demonstração.
- `qwen2.5:7b-instruct` em hardware modesto (ou CPU-only) pode levar
  dezenas de segundos a minutos por resposta; veja
  [Trocando o modelo](#trocando-o-modelo) para opções mais leves. A UI
  mostra um indicador com tempo decorrido durante a espera, pra ficar
  claro que não travou.
- Nos desvios de `proposeEscalation` que não chegam a pausar (chamado não
  aberto, não encontrado, argumentos inválidos ou proposta rejeitada), a
  resposta ao `tool_call` de `registrar_escalonamento` é uma `AIMessage`,
  não uma `ToolMessage` — isso pode quebrar a validação de histórico de
  alguns provedores de modelo reais (que exigem uma resposta de tool para
  cada tool_call) caso a mesma conversa continue depois de um
  bloqueio/rejeição. Não é exercitado pelos cenários obrigatórios.
- Se o modelo emitir `registrar_escalonamento` junto com outra tool call
  no mesmo turno, a tool call adicional nunca é executada nem respondida
  (só alcançável com um modelo real emitindo tool calls paralelas).
- `escalationRegistered`/`escalationRecord` são por thread, não por
  chamado: o estado lembra apenas o escalonamento mais recente. Um segundo
  escalonamento de outro chamado na mesma conversa é registrado de verdade e
  sobrescreve o registro anterior (a idempotência só vale para o mesmo
  chamado), mas o histórico dos registros anteriores não fica no estado.
- O `minScore` padrão do RAG (0.3) foi calibrado contra o dublê de
  embeddings falsos usado nos testes, não contra o `nomic-embed-text` real;
  convém calibrá-lo com embeddings reais (verificando que uma pergunta fora
  do escopo realmente retorna `found: false`), ajustável via `RAG_MIN_SCORE`.
- Testado de ponta a ponta com `qwen2.5:7b-instruct` real: quando
  `call_rag` retorna `found: false`, o modelo às vezes reconhece a lacuna
  ("não encontramos na base") mas ainda assim completa com informação
  genérica, inventada, na mesma resposta — mesmo com o system prompt
  pedindo explicitamente para não inventar. É uma limitação de aderência a
  instruções do modelo, não do código (a tool devolve `found: false`
  corretamente); modelos maiores tendem a seguir melhor, ou dá para forçar
  isso em código recusando chamar o LLM de novo quando `found: false`.

## Bônus: assistente de Viagens + RAG

Implementa o conceito de **Assistants** sobre o mesmo grafo LangGraph do
suporte: cada assistant é só uma configuração (`src/lib/graph/assistants.ts`)
de system prompt + lista de tools permitidas, resolvida por execução via
`config.configurable`. Não existe um segundo grafo.

- Base de conhecimento fictícia em `data/rag-docs/` (França e Japão),
  identificada como simulação, com frontmatter de
  nacionalidade/finalidade/duração.
- Embeddings via Ollama (`nomic-embed-text`, configurável por
  `OLLAMA_EMBEDDING_MODEL`) indexados em memória
  (`src/lib/rag/vectorStore.ts`) — sem banco vetorial externo.
- `call_rag` retorna os trechos recuperados com a fonte; quando a busca
  não encontra evidência suficiente, retorna `found: false` e o assistant
  reconhece a limitação em vez de inventar.
- A restrição de tools por assistant é validada no `toolsNode`
  (`src/lib/graph/nodes/tools.ts`), não só pelo prompt: suporte não pode
  chamar `call_rag`, viagens não pode chamar nenhuma tool de chamados.
  Comprovado em `tests/graph.assistants.flow.test.ts`.
- A UI tem um seletor de assistant; cada assistant mantém seu próprio
  `thread_id` (`sessionStorage`), então o histórico não se mistura.

Para rodar: `pnpm models:pull` baixa o modelo de chat e o de embeddings
juntos (ou `docker compose up --build`, que faz isso automaticamente),
depois `pnpm dev` e trocar o assistant no seletor da página.
