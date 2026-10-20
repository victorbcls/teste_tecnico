# Aurora Support Assistant — Design

**Data:** 2026-10-20
**Origem:** Desafio técnico Qwantyco (`qwantyco-desafio-tecnico.pdf`)

## Contexto e objetivo

Construir um assistente de suporte para a empresa fictícia Aurora que:
consulta chamados mockados, lista chamados por situação, e prepara
escalonamentos que só são registrados após aprovação humana explícita.
A orquestração roda em LangGraph, com estado tipado, pausa/retomada reais
(não simuladas), instrumentação obrigatória via LangSmith, e uma avaliação
automatizada rodando contra um modelo real.

Como extensão opcional (bônus), o mesmo grafo serve um segundo assistente
("Viagens") especializado em consulta de documentação de viagem via RAG
sobre uma base de conhecimento fictícia local, com a restrição de tools
por assistente aplicada no backend.

Prazo: 5 dias corridos a partir da confirmação de recebimento.

## Escopo deste documento

Cobre dois subprojetos sequenciados, construídos sobre a mesma base:

1. **Núcleo** — assistente de suporte (obrigatório).
2. **Bônus** — assistente de viagens + RAG + conceito de Assistants
   (opcional, implementado depois do núcleo estar completo e testado).

Ambos compartilham o mesmo grafo LangGraph e o mesmo executor; o bônus não
introduz um grafo separado.

## Stack

- **Framework:** Next.js (App Router), TypeScript estrito.
- **Orquestração:** LangGraph.js.
- **Observabilidade:** LangSmith (tracing obrigatório + dataset/evaluation).
- **Modelo:** Ollama local. Padrão `qwen2.5:7b-instruct` (quantizado
  Q4_K_M, ~4.7GB, cabe em 8GB RAM/VRAM) por ter suporte a function/tool
  calling mais estável que modelos menores. Fallback documentado:
  `llama3.2:3b-instruct`, trocável via variável de ambiente, para máquinas
  mais limitadas ou se a latência do 7b for proibitiva.
- **Embeddings (bônus/RAG):** `nomic-embed-text` via Ollama (local, grátis).
- **UI:** Tailwind CSS.
- **Gerenciador de pacotes:** pnpm.
- **Testes offline:** Vitest.

## Arquitetura

### Visão geral

Next.js expõe uma única rota de API (`/api/chat`) que recebe mensagens do
usuário ou decisões de aprovação/rejeição e invoca um grafo LangGraph
compilado. O grafo usa `MemorySaver` como checkpointer, chaveado por
`thread_id`, o que mantém contexto por sessão sem precisar de banco de
dados (checkpoint em memória é suficiente, conforme especificado).

```
[Next.js UI] --POST /api/chat--> [API Route] --invoke/resume--> [Grafo LangGraph]
                                                         |
                                            agent <-> tools (listar/consultar)
                                                         |
                                        (chamada a registrar_escalonamento)
                                                         v
                                              proposeEscalation (interrupt)
                                                         |
                                         <--- proposta exibida na UI ---
                                                         |
                                   aprovar/rejeitar  -> resume (Command)
                                                         |
                                rejeitar: encerra sem gravar
                                aprovar:  registerEscalation (grava mock, idempotente)
```

### Sessões e contexto

`thread_id` é gerado no cliente (`crypto.randomUUID()`) na primeira
interação e persistido em `sessionStorage`. Toda chamada a `/api/chat`
carrega esse `thread_id`, que vira a chave do checkpoint no `MemorySaver`.
Isso garante isolamento entre sessões diferentes e continuidade dentro da
mesma conversa. Um botão "Nova conversa" gera um novo `thread_id`.

### Fluxo do grafo (núcleo)

Nós:

- **agent** — chama o LLM com as tools permitidas para o assistant ativo
  bindadas. Decide se responde diretamente ou emite uma tool call.
- **tools** — executa `listar_chamados` e `consultar_chamado` via tool
  node padrão do LangGraph, com validação de schema (zod) na entrada e na
  saída.
- **proposeEscalation** — nó dedicado, ativado quando o agent chama
  `registrar_escalonamento`. Valida que o chamado referenciado está
  aberto (reprovando CH-102 e qualquer chamado resolvido já nesta etapa,
  antes mesmo de chegar à aprovação humana) e então chama `interrupt()`
  com um payload contendo a proposta exata (chamado, resumo,
  justificativa). O grafo pausa aqui — essa é a pausa real do LangGraph
  exigida pelo desafio, não uma simulação no chat.
- **registerEscalation** — só executado após retomada com aprovação.
  Grava o escalonamento mockado usando os mesmos argumentos da proposta
  original. Guardado por uma flag no estado (`escalationRegistered`) para
  garantir que uma retomada repetida da mesma aprovação não duplique o
  registro.

Resumo da decisão de design para o mecanismo de pausa: optei por
`interrupt()` dinâmico dentro de um nó dedicado, em vez de
`interruptBefore` estático no compile do grafo ou de um controle manual
via flag de estado fora da API do LangGraph. `interrupt()` dinâmico
permite moldar livremente o payload exibido na UI e o payload de retomada
(aprovado/rejeitado), e atende literalmente ao requisito "use
interrupção e retomada do LangGraph" — uma flag manual reimplementaria por
fora o que o LangGraph já resolve nativamente.

### Assistants (bônus)

Cada assistant é uma configuração, não um grafo novo:

```ts
type AssistantConfig = {
  id: "suporte" | "viagens";
  systemPrompt: string;
  allowedTools: string[];
};
```

A configuração do assistant ativo entra via `config.configurable` na
invocação do grafo. O nó `agent` só binda ao LLM as tools da allowlist do
assistant ativo. Como defesa em profundidade (o requisito do desafio é
explícito: "a restrição deve existir no backend", não só no prompt), o
executor de tools valida novamente o nome da tool chamada contra a
allowlist antes de executar — se o LLM alucinar uma tool fora da lista
(ex.: "viagens" tentando chamar `listar_chamados`), a execução é recusada
com um erro controlado, sem rodar nada.

## Tools

| Tool | Args | Retorno |
|---|---|---|
| `listar_chamados` | `{ situacao?: "aberto" \| "resolvido" }` | lista de chamados mockados filtrada |
| `consultar_chamado` | `{ id: string }` | chamado mockado ou erro "não encontrado" |
| `registrar_escalonamento` | `{ chamadoId, resumo, justificativa }` | confirmação simulada, só após aprovação |
| `call_rag` (bônus) | `{ query: string, country?: string }` | trechos recuperados + fontes, ou sinal de "sem evidência" |

Massa de dados mockada (núcleo): CH-101 (aberto), CH-102 (resolvido),
CH-103 (aberto).

`registrar_escalonamento` é chamada pelo LLM com argumentos completos
(exigido: "o modelo deve chamar a ferramenta com argumentos") para montar
a proposta, mas o tool executor intercepta essa chamada específica e não
executa a escrita mockada imediatamente — ela só roda dentro de
`registerEscalation`, após aprovação.

## Tratamento de erros e limites

- Erros tipados: `NotFoundError` (chamado inexistente), `InvalidInputError`
  (entrada/saída fora do schema zod), `UnknownToolError` (tool não
  reconhecida ou fora da allowlist do assistant). Sempre devolvidos ao
  `agent` como resultado de tool, nunca como resposta fixa no chat.
- Retry: wrapper de execução de tool com até 3 tentativas e timeout por
  chamada (`AbortController`, 5s). Falha transitória é simulável via uma
  flag de injeção determinística (não aleatória), para que os testes
  offline sejam reprodutíveis.
- Limite de execução ativa: contador em memória (semáforo simples) que
  limita quantas invocações do grafo rodam concorrentemente. O slot é
  liberado quando a execução pausa aguardando aprovação humana — a espera
  humana não consome esse limite — e reocupado na retomada.
- Backend nunca confia só no prompt para bloquear ações: tanto a regra
  "só chamado aberto escala" quanto a restrição de tools por assistant são
  checadas em código, fora do LLM.

## Observabilidade (LangSmith)

- `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY`, projeto
  `aurora-support-assistant`.
- Tracing nativo de nós, chamadas ao modelo e tools via integração
  LangGraph/LangChain.
- Metadados de correlação por execução: `thread_id` e `run_id` em tags/
  metadata de cada invocação, incluindo o momento de pausa e de retomada
  com a decisão (aprovado/rejeitado), para que o trace permita reconstruir
  o fluxo completo sem expor segredos.

## Avaliação (LangSmith)

- Dataset `aurora-support-eval` com:
  1. Caso obrigatório: "Liste todos os chamados abertos." — critério:
     `listar_chamados` executada de fato com `{"situacao":"aberto"}`,
     sucesso da consulta, resposta final cita CH-101 e CH-103, sem
     omissão nem invenção.
  2. Caso adicional: "Consulte o CH-102 e prepare um escalonamento se ele
     estiver aberto." — critério: `consultar_chamado` executada, chamado
     identificado como resolvido, `registrar_escalonamento` **não**
     chamada / proposta não gerada, resposta explica que não é possível
     escalonar.
- Avaliador por código (não por julgamento de texto): inspeciona os
  passos intermediários do run (tool calls reais e seus retornos), não
  só a resposta final. Reprova runs que pulam a consulta, chamam a tool
  errada, ou mencionam chamados que a tool não retornou.
- Execução de pelo menos uma rodada do experimento com o modelo real
  (Ollama local), modelo e configuração documentados no README.

## Testes offline (Vitest)

Usam um `FakeChatModel` determinístico (implementa a interface mínima de
chat model do LangChain, sem chamar rede/Ollama), passando pelo mesmo
grafo e executor de produção. Cobrem os 7 cenários da tabela do desafio:

1. Consulta e listagem — tool executada com argumentos, retorno mockado
   usado, identificador inexistente tratado.
2. Chamado resolvido — CH-102 nunca escalado, inclusive no backend.
3. Aprovação e rejeição — rejeitar não escreve; aprovar executa a
   proposta exibida.
4. Aprovação repetida — um único registro para a mesma operação.
5. Falha transitória — erro simulado e recuperação dentro do limite de
   tentativas.
6. Saída inválida e limites — tool indevida não executa; erro controlado
   ao atingir o limite de execuções ativas.
7. Contexto e sessões — duas conversas (`thread_id` distintos) não
   misturam contexto.

Esses testes são separados da avaliação com modelo real no LangSmith.

## Bônus: assistente de Viagens + RAG

- Base de conhecimento local em Markdown (`data/rag-docs/`), conteúdo
  fictício e identificado como simulação, cobrindo França e Japão, com
  frontmatter explícito de nacionalidade/passaporte, finalidade e duração
  da viagem a que cada documento se aplica.
- Embeddings gerados localmente via Ollama (`nomic-embed-text`) e
  indexados em um `MemoryVectorStore` do LangChain, construído uma vez no
  boot do servidor (sem banco vetorial externo).
- `call_rag` é chamada pelo modelo com a pergunta (e opcionalmente
  filtros de país); retorna os trechos recuperados junto da fonte, para
  que a resposta final cite a origem. Quando a busca não traz evidência
  suficiente, a tool sinaliza isso explicitamente e o assistant deve
  reconhecer a limitação em vez de inventar.
- O assistant "Suporte" não tem `call_rag` na allowlist; o assistant
  "Viagens" não tem as tools de chamados na allowlist — reforçado no
  backend, testado explicitamente (tentativa cruzada deve falhar de forma
  controlada).
- UI ganha um seletor de assistant; histórico e `thread_id` são separados
  por assistant + sessão.

## UI

Página única (`/`): seletor de assistant, lista de mensagens, campo de
input, botão "Nova conversa". Quando o grafo pausa em
`proposeEscalation`, a UI renderiza um card de proposta (chamado, resumo,
justificativa) com botões Aprovar/Rejeitar — a aprovação é validada no
backend e vinculada ao `thread_id`/proposta em curso, nunca confiada
apenas ao clique do botão.

## Entregáveis

- Repositório Git com código, lockfile (`pnpm-lock.yaml`), `.nvmrc` com a
  versão do Node, `.env.example` sem segredos.
- README: instalação, comandos de execução, como rodar os testes
  offline, como rodar a avaliação no LangSmith, descrição do fluxo,
  decisões de design e limitações conhecidas.
- Projeto, dataset e experimento mantidos na conta pessoal do LangSmith
  (sem necessidade de export/compartilhamento — demonstração ao vivo na
  apresentação técnica).

## Fora de escopo

- Deploy público.
- Autenticação/autorização de usuários.
- Banco de dados persistente (checkpoint em memória é suficiente).
- Banco vetorial externo ou pago.
- API HTTP separada para os mocks (tools acessam dados locais
  diretamente).
