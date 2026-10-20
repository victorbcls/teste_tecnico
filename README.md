# Aurora Support Assistant

Assistente de suporte para a empresa fictícia Aurora: consulta chamados
mockados, lista por situação, e só registra um escalonamento depois de
aprovação humana explícita. Orquestrado em LangGraph.js, servido por
Next.js, instrumentado com LangSmith.

## Requisitos

- Node.js 20 (ver `.nvmrc`)
- pnpm
- [Ollama](https://ollama.com) rodando localmente, com o modelo:
  `ollama pull qwen2.5:7b-instruct`
- Conta gratuita no [LangSmith](https://smith.langchain.com) para rodar a
  avaliação e ver os traces (opcional para só rodar os testes offline)

## Instalação

```bash
pnpm install
cp .env.example .env.local
# edite .env.local e preencha LANGCHAIN_API_KEY
```

## Rodando

```bash
ollama serve &
pnpm dev
```

Abra `http://localhost:3000`.

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
- Modelo local via Ollama para rodar sem custo nenhum; `OLLAMA_MODEL` é
  trocável por variável de ambiente.

## Limitações conhecidas

- Checkpoint em memória: o histórico se perde ao reiniciar o servidor.
- Sem autenticação — uso local/demonstração.
- `qwen2.5:7b-instruct` em hardware modesto pode ser lento; trocar para
  `llama3.2:3b-instruct` via `OLLAMA_MODEL` se necessário.
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
  chamado: um segundo escalonamento legitimamente diferente na mesma
  conversa retorna o registro do primeiro em vez de registrar o novo.
