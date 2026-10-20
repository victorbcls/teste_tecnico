# Aurora Support Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Aurora support assistant (LangGraph + Next.js + LangSmith) that lists/queries mocked chamados and escalates only after human approval, plus the optional travel/RAG assistant bonus on the same graph.

**Architecture:** A single Next.js API route invokes a compiled LangGraph graph (`agent` ⇄ `tools`, with a dedicated `proposeEscalation` node that calls `interrupt()` to pause for human approval and a `registerEscalation` node that performs the idempotent mock write on resume). `MemorySaver` checkpoints by `thread_id`. A second assistant ("viagens") reuses the same graph with a different system prompt and tool allowlist, enforced in the executor, backed by a local RAG tool over Ollama embeddings.

**Tech Stack:** Next.js (App Router) + TypeScript, `@langchain/langgraph`, `@langchain/core`, `@langchain/ollama`, `langsmith`, `zod`, `gray-matter`, Tailwind CSS, pnpm, Vitest.

## Global Constraints

- Node version pinned in `.nvmrc`: `20`.
- Package manager: pnpm only (no npm/yarn lockfiles).
- Model: `ChatOllama` with model name read from `OLLAMA_MODEL` env var, default `qwen2.5:7b-instruct`.
- Embeddings: `OllamaEmbeddings` with model name read from `OLLAMA_EMBEDDING_MODEL`, default `nomic-embed-text`.
- Checkpointer: `MemorySaver` only — no external database.
- `.env.example` must list every env var used, with no real secret values.
- Mock chamados fixture exactly: `CH-101` aberto, `CH-102` resolvido, `CH-103` aberto.
- Tool name for listing is exactly `listar_chamados` with argument `situacao`.
- Offline tests (Vitest) never call a network or a real Ollama instance — always use fakes/doubles.
- Every tool input/output is validated with `zod`.

---

## File Structure

```
.nvmrc
.env.example
package.json
src/
  app/
    page.tsx
    api/chat/route.ts
  components/
    ChatWindow.tsx
    ApprovalCard.tsx
    AssistantSelector.tsx
  lib/
    llm.ts
    tools/
      schemas.ts
      errors.ts
      mockChamados.ts
      escalonamento.ts
      executeWithRetry.ts
      concurrencyLimiter.ts
      ragTool.ts
    rag/
      loadDocs.ts
      vectorStore.ts
    graph/
      state.ts
      assistants.ts
      graph.ts
      nodes/
        agent.ts
        tools.ts
        registerEscalation.ts
data/
  rag-docs/
    franca.md
    japao.md
tests/
  fakeChatModel.ts
  fakeEmbeddings.ts
  tools.schemas.test.ts
  tools.errors.test.ts
  tools.mockChamados.test.ts
  tools.executeWithRetry.test.ts
  tools.concurrencyLimiter.test.ts
  graph.assistants.config.test.ts
  graph.agent.node.test.ts
  graph.tools.node.test.ts
  graph.registerEscalation.test.ts
  graph.core.test.ts
  api.chat.test.ts
  rag.loadDocs.test.ts
  rag.vectorStore.test.ts
  tools.ragTool.test.ts
  graph.assistants.flow.test.ts
  evaluation.evaluators.test.ts
evaluation/
  dataset.ts
  evaluators.ts
  runEval.ts
README.md
```

---

## Phase 1 — Project setup

### Task 1: Scaffold Next.js project and install dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `.nvmrc`, `.env.example`, `tailwind.config.ts`, `postcss.config.js`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: a runnable Next.js + TypeScript + Tailwind project with `pnpm dev`, `pnpm build`, `pnpm test` scripts, and the dependencies every later task imports from.

- [ ] **Step 1: Scaffold with create-next-app**

```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --eslint
```

When prompted, accept defaults. This creates `src/app`, `tailwind.config.ts`, `tsconfig.json`, `package.json`.

- [ ] **Step 2: Set Node version**

Create `.nvmrc`:

```
20
```

- [ ] **Step 3: Install LangGraph/LangChain/LangSmith/zod/gray-matter**

```bash
pnpm add @langchain/langgraph @langchain/core @langchain/ollama langsmith zod gray-matter uuid
pnpm add -D vitest @types/uuid tsx
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
  },
});
```

- [ ] **Step 5: Add test/eval scripts to package.json**

Edit `package.json` `"scripts"` block to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "eval": "tsx evaluation/runEval.ts",
    "seed:dataset": "tsx evaluation/dataset.ts"
  }
}
```

- [ ] **Step 6: Create `.env.example`**

```bash
# LLM
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=aurora-support-assistant

# Limits
MAX_ACTIVE_EXECUTIONS=5
TOOL_TIMEOUT_MS=5000
TOOL_MAX_ATTEMPTS=3
```

- [ ] **Step 7: Verify the app boots**

```bash
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
kill %1
```

Expected: prints `200`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with LangGraph/LangSmith deps"
```

---

### Task 2: Tool input/output schemas (zod)

**Files:**
- Create: `src/lib/tools/schemas.ts`
- Test: `tests/tools.schemas.test.ts`

**Interfaces:**
- Produces: `ChamadoSchema`, `Chamado` type, `ListarChamadosInputSchema`, `ConsultarChamadoInputSchema`, `RegistrarEscalonamentoInputSchema`, and their inferred TS types (`ListarChamadosInput`, `ConsultarChamadoInput`, `RegistrarEscalonamentoInput`) — consumed by Tasks 4, 5, 10, 11.

- [ ] **Step 1: Write the failing test**

Create `tests/tools.schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ChamadoSchema,
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
  RegistrarEscalonamentoInputSchema,
} from "../src/lib/tools/schemas";

describe("tool schemas", () => {
  it("accepts a valid chamado", () => {
    const result = ChamadoSchema.safeParse({
      id: "CH-101",
      situacao: "aberto",
      titulo: "Erro de login",
      descricao: "Usuário não consegue logar",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a chamado with invalid situacao", () => {
    const result = ChamadoSchema.safeParse({
      id: "CH-101",
      situacao: "pendente",
      titulo: "x",
      descricao: "y",
    });
    expect(result.success).toBe(false);
  });

  it("accepts listar_chamados input with optional situacao", () => {
    expect(ListarChamadosInputSchema.safeParse({}).success).toBe(true);
    expect(
      ListarChamadosInputSchema.safeParse({ situacao: "aberto" }).success
    ).toBe(true);
    expect(
      ListarChamadosInputSchema.safeParse({ situacao: "invalida" }).success
    ).toBe(false);
  });

  it("requires id for consultar_chamado", () => {
    expect(ConsultarChamadoInputSchema.safeParse({}).success).toBe(false);
    expect(
      ConsultarChamadoInputSchema.safeParse({ id: "CH-101" }).success
    ).toBe(true);
  });

  it("requires chamadoId, resumo and justificativa for registrar_escalonamento", () => {
    expect(
      RegistrarEscalonamentoInputSchema.safeParse({
        chamadoId: "CH-101",
        resumo: "resumo",
        justificativa: "justificativa",
      }).success
    ).toBe(true);
    expect(
      RegistrarEscalonamentoInputSchema.safeParse({ chamadoId: "CH-101" })
        .success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tools.schemas.test.ts`
Expected: FAIL — `src/lib/tools/schemas.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tools/schemas.ts`:

```ts
import { z } from "zod";

export const SituacaoSchema = z.enum(["aberto", "resolvido"]);
export type Situacao = z.infer<typeof SituacaoSchema>;

export const ChamadoSchema = z.object({
  id: z.string(),
  situacao: SituacaoSchema,
  titulo: z.string(),
  descricao: z.string(),
});
export type Chamado = z.infer<typeof ChamadoSchema>;

export const ListarChamadosInputSchema = z.object({
  situacao: SituacaoSchema.optional(),
});
export type ListarChamadosInput = z.infer<typeof ListarChamadosInputSchema>;

export const ConsultarChamadoInputSchema = z.object({
  id: z.string().min(1),
});
export type ConsultarChamadoInput = z.infer<
  typeof ConsultarChamadoInputSchema
>;

export const RegistrarEscalonamentoInputSchema = z.object({
  chamadoId: z.string().min(1),
  resumo: z.string().min(1),
  justificativa: z.string().min(1),
});
export type RegistrarEscalonamentoInput = z.infer<
  typeof RegistrarEscalonamentoInputSchema
>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tools.schemas.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/schemas.ts tests/tools.schemas.test.ts
git commit -m "feat: add zod schemas for chamado tools"
```

---

### Task 3: Typed tool errors

**Files:**
- Create: `src/lib/tools/errors.ts`
- Test: `tests/tools.errors.test.ts`

**Interfaces:**
- Produces: `NotFoundError`, `InvalidInputError`, `UnknownToolError`, `ToolNotAllowedError` classes (all extend `Error`, all carry a `code` string property) — consumed by Tasks 4, 10, 23.

- [ ] **Step 1: Write the failing test**

Create `tests/tools.errors.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tools.errors.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tools/errors.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tools.errors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/errors.ts tests/tools.errors.test.ts
git commit -m "feat: add typed tool errors"
```

---

### Task 4: Mock chamados data store + listar/consultar

**Files:**
- Create: `src/lib/tools/mockChamados.ts`
- Test: `tests/tools.mockChamados.test.ts`

**Interfaces:**
- Consumes: `Chamado`, `ListarChamadosInput`, `ConsultarChamadoInput` from `src/lib/tools/schemas.ts` (Task 2); `NotFoundError` from `src/lib/tools/errors.ts` (Task 3).
- Produces: `MOCK_CHAMADOS: Chamado[]`, `listarChamados(input: ListarChamadosInput): Chamado[]`, `consultarChamado(input: ConsultarChamadoInput): Chamado` (throws `NotFoundError`) — consumed by Tasks 5, 10, 11.

- [ ] **Step 1: Write the failing test**

Create `tests/tools.mockChamados.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MOCK_CHAMADOS,
  listarChamados,
  consultarChamado,
} from "../src/lib/tools/mockChamados";
import { NotFoundError } from "../src/lib/tools/errors";

describe("mockChamados", () => {
  it("contains CH-101 and CH-103 aberto, CH-102 resolvido", () => {
    expect(MOCK_CHAMADOS.find((c) => c.id === "CH-101")?.situacao).toBe(
      "aberto"
    );
    expect(MOCK_CHAMADOS.find((c) => c.id === "CH-102")?.situacao).toBe(
      "resolvido"
    );
    expect(MOCK_CHAMADOS.find((c) => c.id === "CH-103")?.situacao).toBe(
      "aberto"
    );
  });

  it("listarChamados with no filter returns all chamados", () => {
    expect(listarChamados({})).toHaveLength(MOCK_CHAMADOS.length);
  });

  it("listarChamados filters by situacao=aberto to CH-101 and CH-103 only", () => {
    const result = listarChamados({ situacao: "aberto" });
    expect(result.map((c) => c.id).sort()).toEqual(["CH-101", "CH-103"]);
  });

  it("consultarChamado returns the matching chamado", () => {
    expect(consultarChamado({ id: "CH-102" }).situacao).toBe("resolvido");
  });

  it("consultarChamado throws NotFoundError for unknown id", () => {
    expect(() => consultarChamado({ id: "CH-999" })).toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tools.mockChamados.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tools/mockChamados.ts`:

```ts
import {
  Chamado,
  ListarChamadosInput,
  ConsultarChamadoInput,
} from "./schemas";
import { NotFoundError } from "./errors";

export const MOCK_CHAMADOS: Chamado[] = [
  {
    id: "CH-101",
    situacao: "aberto",
    titulo: "Erro de login intermitente",
    descricao: "Usuário relata falha de autenticação ao tentar logar.",
  },
  {
    id: "CH-102",
    situacao: "resolvido",
    titulo: "Fatura duplicada",
    descricao: "Cobrança duplicada identificada e estornada.",
  },
  {
    id: "CH-103",
    situacao: "aberto",
    titulo: "Lentidão no painel",
    descricao: "Painel administrativo demora para carregar relatórios.",
  },
];

export function listarChamados(input: ListarChamadosInput): Chamado[] {
  if (!input.situacao) return [...MOCK_CHAMADOS];
  return MOCK_CHAMADOS.filter((c) => c.situacao === input.situacao);
}

export function consultarChamado(input: ConsultarChamadoInput): Chamado {
  const chamado = MOCK_CHAMADOS.find((c) => c.id === input.id);
  if (!chamado) throw new NotFoundError(input.id);
  return chamado;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tools.mockChamados.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/mockChamados.ts tests/tools.mockChamados.test.ts
git commit -m "feat: add mock chamados data and listar/consultar functions"
```

---

### Task 5: Retry + timeout wrapper for tool execution

**Files:**
- Create: `src/lib/tools/executeWithRetry.ts`
- Test: `tests/tools.executeWithRetry.test.ts`

**Interfaces:**
- Produces: `executeWithRetry<T>(fn: () => Promise<T>, opts?: { maxAttempts?: number; timeoutMs?: number }): Promise<T>` — consumed by Task 13.

- [ ] **Step 1: Write the failing test**

Create `tests/tools.executeWithRetry.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { executeWithRetry } from "../src/lib/tools/executeWithRetry";

describe("executeWithRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await executeWithRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and succeeds within maxAttempts", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error("transient"));
      return Promise.resolve("recovered");
    });
    const result = await executeWithRetry(fn, { maxAttempts: 3 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(executeWithRetry(fn, { maxAttempts: 2 })).rejects.toThrow(
      "always fails"
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("times out a call that never resolves", async () => {
    const fn = () => new Promise<string>(() => {});
    await expect(
      executeWithRetry(fn, { maxAttempts: 1, timeoutMs: 20 })
    ).rejects.toThrow(/timeout/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tools.executeWithRetry.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tools/executeWithRetry.ts`:

```ts
export interface ExecuteWithRetryOptions {
  maxAttempts?: number;
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  opts: ExecuteWithRetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 5000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tools.executeWithRetry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executeWithRetry.ts tests/tools.executeWithRetry.test.ts
git commit -m "feat: add retry+timeout wrapper for tool execution"
```

---

### Task 6: Concurrency limiter for active executions

**Files:**
- Create: `src/lib/tools/concurrencyLimiter.ts`
- Test: `tests/tools.concurrencyLimiter.test.ts`

**Interfaces:**
- Produces: `createLimiter(maxConcurrent: number): { acquire(): Promise<() => void>; activeCount(): number }` — consumed by Task 14 (API route wraps graph invocation).

- [ ] **Step 1: Write the failing test**

Create `tests/tools.concurrencyLimiter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createLimiter } from "../src/lib/tools/concurrencyLimiter";

describe("createLimiter", () => {
  it("allows up to maxConcurrent acquisitions without blocking", async () => {
    const limiter = createLimiter(2);
    const release1 = await limiter.acquire();
    const release2 = await limiter.acquire();
    expect(limiter.activeCount()).toBe(2);
    release1();
    release2();
  });

  it("blocks a third acquisition until a slot is released", async () => {
    const limiter = createLimiter(1);
    const release1 = await limiter.acquire();

    let acquired = false;
    const pending = limiter.acquire().then((release2) => {
      acquired = true;
      release2();
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(acquired).toBe(false);

    release1();
    await pending;
    expect(acquired).toBe(true);
  });

  it("activeCount drops back to 0 after all slots released", async () => {
    const limiter = createLimiter(3);
    const release = await limiter.acquire();
    expect(limiter.activeCount()).toBe(1);
    release();
    expect(limiter.activeCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tools.concurrencyLimiter.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tools/concurrencyLimiter.ts`:

```ts
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  function acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => resolve(release);
      if (active < maxConcurrent) {
        active += 1;
        grant();
      } else {
        queue.push(grant);
      }
    });
  }

  return {
    acquire,
    activeCount: () => active,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tools.concurrencyLimiter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/concurrencyLimiter.ts tests/tools.concurrencyLimiter.test.ts
git commit -m "feat: add concurrency limiter for active graph executions"
```

---

## Phase 2 — Graph core

### Task 7: LangGraph state schema

**Files:**
- Create: `src/lib/graph/state.ts`

**Interfaces:**
- Produces: `GraphState` (an `Annotation.Root`), `GraphStateType`, `EscalationRecord` — consumed by Tasks 9, 10, 11, 12.

- [ ] **Step 1: Write the implementation**

Create `src/lib/graph/state.ts`:

```ts
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export interface EscalationRecord {
  chamadoId: string;
  resumo: string;
  justificativa: string;
  registeredAt: string;
}

export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  escalationApproved: Annotation<boolean | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  escalationRegistered: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  escalationRecord: Annotation<EscalationRecord | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type GraphStateType = typeof GraphState.State;
```

`escalationApproved` is set by `proposeEscalationNode` (Task 12) after the human decision resumes the graph, and read by the conditional edge that routes to `registerEscalation` only when it is `true`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `src/lib/graph/state.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/graph/state.ts
git commit -m "feat: add LangGraph state annotation"
```

---

### Task 8: Assistant configurations

**Files:**
- Create: `src/lib/graph/assistants.ts`
- Test: `tests/graph.assistants.config.test.ts`

**Interfaces:**
- Produces: `AssistantId` (`"suporte" | "viagens"`), `AssistantConfig`, `ASSISTANTS: Record<AssistantId, AssistantConfig>` — consumed by Tasks 9, 10, 12, 13, 14.

- [ ] **Step 1: Write the failing test**

Create `tests/graph.assistants.config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ASSISTANTS } from "../src/lib/graph/assistants";

describe("ASSISTANTS config", () => {
  it("defines suporte with chamados tools and no call_rag", () => {
    const suporte = ASSISTANTS.suporte;
    expect(suporte.id).toBe("suporte");
    expect(suporte.allowedTools).toEqual(
      expect.arrayContaining([
        "listar_chamados",
        "consultar_chamado",
        "registrar_escalonamento",
      ])
    );
    expect(suporte.allowedTools).not.toContain("call_rag");
    expect(suporte.systemPrompt.length).toBeGreaterThan(0);
  });

  it("defines viagens with only call_rag", () => {
    const viagens = ASSISTANTS.viagens;
    expect(viagens.id).toBe("viagens");
    expect(viagens.allowedTools).toEqual(["call_rag"]);
    expect(viagens.systemPrompt.length).toBeGreaterThan(0);
  });

  it("keeps suporte and viagens tool sets disjoint", () => {
    const overlap = ASSISTANTS.suporte.allowedTools.filter((t) =>
      ASSISTANTS.viagens.allowedTools.includes(t)
    );
    expect(overlap).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/graph.assistants.config.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/graph/assistants.ts`:

```ts
export type AssistantId = "suporte" | "viagens";

export interface AssistantConfig {
  id: AssistantId;
  systemPrompt: string;
  allowedTools: string[];
}

export const ASSISTANTS: Record<AssistantId, AssistantConfig> = {
  suporte: {
    id: "suporte",
    systemPrompt:
      "Você é o assistente de suporte da empresa fictícia Aurora. " +
      "Você é especialista em chamados: pode listar chamados, consultar um chamado pelo identificador " +
      "e propor o escalonamento de um chamado aberto para revisão humana. " +
      "Somente chamados com situacao 'aberto' podem ser escalonados. " +
      "Nunca invente dados de chamados nem confirme uma operação que não ocorreu de fato. " +
      "Você não tem acesso a nenhuma base de documentação de viagens.",
    allowedTools: [
      "listar_chamados",
      "consultar_chamado",
      "registrar_escalonamento",
    ],
  },
  viagens: {
    id: "viagens",
    systemPrompt:
      "Você é o assistente de documentação de viagens da empresa fictícia Aurora. " +
      "Você só pode responder com base em trechos recuperados da base própria via a ferramenta call_rag, " +
      "sempre citando a fonte. Se a base não tiver evidência suficiente para a pergunta, diga isso " +
      "claramente e peça mais detalhes em vez de inventar uma resposta. " +
      "Você não tem acesso a nenhuma ferramenta de chamados de suporte.",
    allowedTools: ["call_rag"],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/graph.assistants.config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/assistants.ts tests/graph.assistants.config.test.ts
git commit -m "feat: add suporte and viagens assistant configs"
```

---

### Task 9: Chat model interface, tool definitions, agent node, fake chat model

**Files:**
- Create: `src/lib/graph/toolDefinitions.ts`, `src/lib/graph/chatModel.ts`, `src/lib/graph/nodes/agent.ts`
- Create: `tests/fakeChatModel.ts` (test double, not a test file)
- Test: `tests/graph.agent.node.test.ts`

**Interfaces:**
- Consumes: `ListarChamadosInputSchema`, `ConsultarChamadoInputSchema`, `RegistrarEscalonamentoInputSchema` (Task 2); `GraphStateType` (Task 7); `AssistantConfig`, `ASSISTANTS` (Task 8).
- Produces: `ToolDefinition`, `TOOL_DEFINITIONS` (listar_chamados, consultar_chamado, registrar_escalonamento — `call_rag` appended in Task 21); `ChatModelLike`, `BoundChatModel`; `agentNode(state, config)`; `createFakeChatModel(script: AIMessage[]): ChatModelLike` — consumed by Tasks 10, 12, 13.

- [ ] **Step 1: Write the failing test**

Create `tests/fakeChatModel.ts`:

```ts
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
```

Create `tests/graph.agent.node.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/graph.agent.node.test.ts`
Expected: FAIL — `src/lib/graph/toolDefinitions.ts`, `src/lib/graph/chatModel.ts` and `src/lib/graph/nodes/agent.ts` do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/graph/toolDefinitions.ts`:

```ts
import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
  RegistrarEscalonamentoInputSchema,
} from "../tools/schemas";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: unknown;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "listar_chamados",
    description:
      "Lista chamados mockados, com filtro opcional de situacao ('aberto' ou 'resolvido').",
    schema: ListarChamadosInputSchema,
  },
  {
    name: "consultar_chamado",
    description: "Busca um chamado mockado pelo identificador (ex: CH-101).",
    schema: ConsultarChamadoInputSchema,
  },
  {
    name: "registrar_escalonamento",
    description:
      "Prepara um escalonamento para um chamado aberto, com resumo e justificativa. " +
      "Só é efetivado após aprovação humana.",
    schema: RegistrarEscalonamentoInputSchema,
  },
];
```

Create `src/lib/graph/chatModel.ts`:

```ts
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ToolDefinition } from "./toolDefinitions";

export interface BoundChatModel {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
}

export interface ChatModelLike {
  bindTools(tools: ToolDefinition[]): BoundChatModel;
}
```

Create `src/lib/graph/nodes/agent.ts`:

```ts
import { SystemMessage } from "@langchain/core/messages";
import { GraphStateType } from "../state";
import { AssistantConfig } from "../assistants";
import { ChatModelLike } from "../chatModel";
import { ToolDefinition } from "../toolDefinitions";

export interface AgentConfigurable {
  assistant: AssistantConfig;
  model: ChatModelLike;
  tools: ToolDefinition[];
}

export async function agentNode(
  state: GraphStateType,
  config: { configurable?: AgentConfigurable }
) {
  const configurable = config.configurable;
  if (!configurable) {
    throw new Error(
      "agentNode requer config.configurable.{assistant,model,tools}"
    );
  }
  const { assistant, model, tools } = configurable;
  const allowedTools = tools.filter((t) =>
    assistant.allowedTools.includes(t.name)
  );
  const bound = model.bindTools(allowedTools);
  const messages = [
    new SystemMessage(assistant.systemPrompt),
    ...state.messages,
  ];
  const response = await bound.invoke(messages);
  return { messages: [response] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/graph.agent.node.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/toolDefinitions.ts src/lib/graph/chatModel.ts \
  src/lib/graph/nodes/agent.ts tests/fakeChatModel.ts tests/graph.agent.node.test.ts
git commit -m "feat: add agent node with pluggable chat model and fake double"
```

---

### Task 10: Tools node (executor with allowlist + retry + typed errors)

**Files:**
- Create: `src/lib/graph/nodes/tools.ts`
- Test: `tests/graph.tools.node.test.ts`

**Interfaces:**
- Consumes: `listarChamados`, `consultarChamado` (Task 4); `InvalidInputError`, `UnknownToolError`, `ToolNotAllowedError` (Task 3); `executeWithRetry` (Task 5); `AssistantConfig`, `ASSISTANTS` (Task 8); `GraphStateType` (Task 7, amended).
- Produces: `toolsNode(state, config)` — consumed by Task 12. The `call_rag` case is added later by Task 21 (modifies this file).

- [ ] **Step 1: Write the failing test**

Create `tests/graph.tools.node.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { toolsNode } from "../src/lib/graph/nodes/tools";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { GraphStateType } from "../src/lib/graph/state";

function stateWithToolCall(
  name: string,
  args: Record<string, unknown>
): GraphStateType {
  const aiMessage = new AIMessage({
    content: "",
    tool_calls: [{ name, args, id: "call-1" }],
  });
  return {
    messages: [aiMessage],
    escalationApproved: null,
    escalationRegistered: false,
    escalationRecord: null,
  } as unknown as GraphStateType;
}

describe("toolsNode", () => {
  it("executes listar_chamados and returns the filtered result as JSON", async () => {
    const state = stateWithToolCall("listar_chamados", {
      situacao: "aberto",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.map((c: { id: string }) => c.id).sort()).toEqual([
      "CH-101",
      "CH-103",
    ]);
  });

  it("returns a NotFoundError payload for an unknown chamado id", async () => {
    const state = stateWithToolCall("consultar_chamado", { id: "CH-999" });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("CH-999");
  });

  it("blocks a tool outside the assistant's allowlist", async () => {
    const state = stateWithToolCall("listar_chamados", {
      situacao: "aberto",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.viagens },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("não é permitida");
  });

  it("returns an UnknownToolError payload for an unrecognized tool name", async () => {
    const state = stateWithToolCall("apagar_chamado", {});
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("desconhecida");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/graph.tools.node.test.ts`
Expected: FAIL — `src/lib/graph/nodes/tools.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/graph/nodes/tools.ts`:

```ts
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
} from "../../tools/schemas";
import { listarChamados, consultarChamado } from "../../tools/mockChamados";
import {
  InvalidInputError,
  UnknownToolError,
  ToolNotAllowedError,
} from "../../tools/errors";
import { executeWithRetry } from "../../tools/executeWithRetry";
import { AssistantConfig } from "../assistants";
import { GraphStateType } from "../state";

async function runTool(name: string, rawArgs: unknown): Promise<unknown> {
  switch (name) {
    case "listar_chamados": {
      const parsed = ListarChamadosInputSchema.safeParse(rawArgs);
      if (!parsed.success) throw new InvalidInputError(parsed.error.message);
      return listarChamados(parsed.data);
    }
    case "consultar_chamado": {
      const parsed = ConsultarChamadoInputSchema.safeParse(rawArgs);
      if (!parsed.success) throw new InvalidInputError(parsed.error.message);
      return consultarChamado(parsed.data);
    }
    default:
      throw new UnknownToolError(name);
  }
}

export async function toolsNode(
  state: GraphStateType,
  config: { configurable?: { assistant?: AssistantConfig } }
): Promise<{ messages: BaseMessage[] }> {
  const assistant = config.configurable?.assistant;
  if (!assistant) {
    throw new Error("toolsNode requer config.configurable.assistant");
  }
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls ?? [];
  const results: ToolMessage[] = [];

  for (const call of toolCalls) {
    const toolCallId = call.id ?? call.name;
    try {
      if (!assistant.allowedTools.includes(call.name)) {
        throw new ToolNotAllowedError(call.name, assistant.id);
      }
      const output = await executeWithRetry(() =>
        runTool(call.name, call.args)
      );
      results.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify(output),
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      results.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: message }),
        })
      );
    }
  }

  return { messages: results };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/graph.tools.node.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/nodes/tools.ts tests/graph.tools.node.test.ts
git commit -m "feat: add tools node with allowlist enforcement and retry"
```

---

### Task 11: registerEscalation node (idempotent mock write)

**Files:**
- Create: `src/lib/graph/nodes/registerEscalation.ts`
- Test: `tests/graph.registerEscalation.test.ts`

**Interfaces:**
- Consumes: `RegistrarEscalonamentoInputSchema` (Task 2); `InvalidInputError` (Task 3); `GraphStateType`, `EscalationRecord` (Task 7).
- Produces: `registerEscalationNode(state)` — consumed by Task 12. Guarantees that if `state.escalationRegistered` is already `true`, it returns the existing `escalationRecord` unchanged instead of creating a new one.

- [ ] **Step 1: Write the failing test**

Create `tests/graph.registerEscalation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { registerEscalationNode } from "../src/lib/graph/nodes/registerEscalation";
import { GraphStateType } from "../src/lib/graph/state";

function stateWithEscalationCall(): GraphStateType {
  const aiMessage = new AIMessage({
    content: "",
    tool_calls: [
      {
        name: "registrar_escalonamento",
        args: {
          chamadoId: "CH-101",
          resumo: "Login falhando para múltiplos usuários",
          justificativa: "Impacto recorrente, requer atenção humana",
        },
        id: "call-esc-1",
      },
    ],
  });
  return {
    messages: [aiMessage],
    escalationApproved: true,
    escalationRegistered: false,
    escalationRecord: null,
  } as unknown as GraphStateType;
}

describe("registerEscalationNode", () => {
  it("registers the escalation from the pending tool call", async () => {
    const result = await registerEscalationNode(stateWithEscalationCall());
    expect(result.escalationRegistered).toBe(true);
    expect(result.escalationRecord?.chamadoId).toBe("CH-101");
    const content = JSON.parse(
      (result.messages?.[0]?.content as string) ?? "{}"
    );
    expect(content.registered).toBe(true);
  });

  it("does not create a new record when already registered (idempotent resume)", async () => {
    const existingRecord = {
      chamadoId: "CH-101",
      resumo: "Login falhando",
      justificativa: "Impacto recorrente",
      registeredAt: "2026-10-20T10:00:00.000Z",
    };
    const state = {
      ...stateWithEscalationCall(),
      escalationRegistered: true,
      escalationRecord: existingRecord,
    } as unknown as GraphStateType;

    const result = await registerEscalationNode(state);
    const content = JSON.parse(
      (result.messages?.[0]?.content as string) ?? "{}"
    );
    expect(content.alreadyRegistered).toBe(true);
    expect(content.record).toEqual(existingRecord);
  });

  it("throws when there is no pending registrar_escalonamento call", async () => {
    const state = {
      messages: [new AIMessage({ content: "oi" })],
      escalationApproved: null,
      escalationRegistered: false,
      escalationRecord: null,
    } as unknown as GraphStateType;
    await expect(registerEscalationNode(state)).rejects.toThrow(
      /sem uma proposta/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/graph.registerEscalation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/graph/nodes/registerEscalation.ts`:

```ts
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { RegistrarEscalonamentoInputSchema } from "../../tools/schemas";
import { InvalidInputError } from "../../tools/errors";
import { GraphStateType, EscalationRecord } from "../state";

function buildEscalationRecord(rawArgs: unknown): EscalationRecord {
  const parsed = RegistrarEscalonamentoInputSchema.safeParse(rawArgs);
  if (!parsed.success) throw new InvalidInputError(parsed.error.message);
  return {
    chamadoId: parsed.data.chamadoId,
    resumo: parsed.data.resumo,
    justificativa: parsed.data.justificativa,
    registeredAt: new Date().toISOString(),
  };
}

export async function registerEscalationNode(state: GraphStateType) {
  if (state.escalationRegistered && state.escalationRecord) {
    return {
      messages: [
        new ToolMessage({
          tool_call_id: "registrar_escalonamento",
          content: JSON.stringify({
            alreadyRegistered: true,
            record: state.escalationRecord,
          }),
        }),
      ],
    };
  }

  const lastAiMessage = [...state.messages]
    .reverse()
    .find(
      (m) => m instanceof AIMessage && (m.tool_calls?.length ?? 0) > 0
    ) as AIMessage | undefined;
  const escalationCall = lastAiMessage?.tool_calls?.find(
    (c) => c.name === "registrar_escalonamento"
  );
  if (!escalationCall) {
    throw new InvalidInputError(
      "registerEscalationNode chamado sem uma proposta de registrar_escalonamento pendente"
    );
  }

  const record = buildEscalationRecord(escalationCall.args);

  return {
    escalationRegistered: true,
    escalationRecord: record,
    messages: [
      new ToolMessage({
        tool_call_id: escalationCall.id ?? "registrar_escalonamento",
        content: JSON.stringify({ registered: true, record }),
      }),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/graph.registerEscalation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/nodes/registerEscalation.ts tests/graph.registerEscalation.test.ts
git commit -m "feat: add idempotent registerEscalation node"
```

---

### Task 12: proposeEscalation node, full graph wiring, and the 7-scenario integration test

This is the central deliverable of the core project: the real pause/resume behavior, the "only open chamados escalate" rule enforced before any interrupt, and every scenario from the challenge's required test table.

**Files:**
- Create: `src/lib/graph/nodes/proposeEscalation.ts`, `src/lib/graph/graph.ts`
- Test: `tests/graph.core.test.ts`

**Interfaces:**
- Consumes: `consultarChamado` (Task 4); `NotFoundError`, `InvalidInputError` (Task 3); `RegistrarEscalonamentoInputSchema` (Task 2); `GraphStateType` (Task 7); `agentNode` (Task 9); `toolsNode` (Task 10); `registerEscalationNode` (Task 11); `ASSISTANTS` (Task 8); `TOOL_DEFINITIONS` (Task 9); `createFakeChatModel` (Task 9).
- Produces: `proposeEscalationNode(state)`; `buildGraph(): CompiledGraph` — consumed by Task 13 (API route) and Task 21/22 (bonus flow tests).

- [ ] **Step 1: Write the failing test**

Create `tests/graph.core.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { buildGraph } from "../src/lib/graph/graph";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { createFakeChatModel } from "./fakeChatModel";
import * as mockChamadosModule from "../src/lib/tools/mockChamados";

function configFor(threadId: string, script: AIMessage[]) {
  return {
    configurable: {
      thread_id: threadId,
      assistant: ASSISTANTS.suporte,
      model: createFakeChatModel(script),
      tools: TOOL_DEFINITIONS,
    },
  };
}

describe("Aurora support graph — required scenarios", () => {
  it("scenario 1a: lists open chamados using the real tool result", async () => {
    const graph = buildGraph();
    const config = configFor("t-list", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "listar_chamados", args: { situacao: "aberto" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content: "Os chamados abertos são CH-101 e CH-103.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Liste todos os chamados abertos.")] },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("CH-101");
    expect(finalMessage.content).toContain("CH-103");
    expect(finalMessage.content).not.toContain("CH-102");
  });

  it("scenario 1b: handles an unknown chamado id without inventing data", async () => {
    const graph = buildGraph();
    const config = configFor("t-notfound", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "consultar_chamado", args: { id: "CH-999" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content: "Não encontrei o chamado CH-999 na nossa base.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Consulte o CH-999.")] },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("Não encontrei");
  });

  it("scenario 2: blocks escalation of a resolved chamado before any approval step", async () => {
    const graph = buildGraph();
    const config = configFor("t-resolved", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-102",
              resumo: "Cliente insiste em reabrir",
              justificativa: "Pedido do cliente",
            },
            id: "c1",
          },
        ],
      }),
    ]);

    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage(
            "Consulte o CH-102 e prepare um escalonamento se ele estiver aberto."
          ),
        ],
      },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("resolvido");

    const state = await graph.getState(config);
    expect(state.values.escalationRegistered).toBe(false);
  });

  it("scenario 3a: rejecting the proposal ends the flow without registering anything", async () => {
    const graph = buildGraph();
    const config = configFor("t-reject", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente de login",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
    ]);

    await graph.invoke(
      { messages: [new HumanMessage("Escalone o CH-101.")] },
      config
    );

    const pausedState = await graph.getState(config);
    const proposal = pausedState.tasks[0]?.interrupts?.[0]?.value;
    expect(proposal).toEqual({
      chamadoId: "CH-101",
      resumo: "Falha recorrente de login",
      justificativa: "Vários usuários afetados",
    });

    const result = await graph.invoke(
      new Command({ resume: { approved: false } }),
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("rejeitado");

    const finalState = await graph.getState(config);
    expect(finalState.values.escalationRegistered).toBe(false);
  });

  it("scenario 3b/4: approving registers once, and a repeated resume does not duplicate it", async () => {
    const graph = buildGraph();
    const config = configFor("t-approve", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente de login",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
      new AIMessage({
        content: "Escalonamento do CH-101 registrado com sucesso.",
      }),
    ]);

    await graph.invoke(
      { messages: [new HumanMessage("Escalone o CH-101.")] },
      config
    );

    const result = await graph.invoke(
      new Command({ resume: { approved: true } }),
      config
    );
    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("registrado");

    const stateAfterFirstApproval = await graph.getState(config);
    const firstRecord = stateAfterFirstApproval.values.escalationRecord;
    expect(firstRecord?.chamadoId).toBe("CH-101");

    let secondAttemptError: unknown = null;
    try {
      await graph.invoke(new Command({ resume: { approved: true } }), config);
    } catch (err) {
      secondAttemptError = err;
    }

    const stateAfterSecondAttempt = await graph.getState(config);
    expect(stateAfterSecondAttempt.values.escalationRecord).toEqual(
      firstRecord
    );
    if (!secondAttemptError) {
      expect(stateAfterSecondAttempt.values.escalationRegistered).toBe(true);
    }
  });

  it("scenario 5: recovers from a transient tool failure within the retry limit", async () => {
    const spy = vi.spyOn(mockChamadosModule, "consultarChamado");
    let calls = 0;
    spy.mockImplementation((input) => {
      calls += 1;
      if (calls === 1) throw new Error("falha transitória simulada");
      const chamado = mockChamadosModule.MOCK_CHAMADOS.find(
        (c) => c.id === input.id
      );
      if (!chamado) throw new Error("not found in test fixture");
      return chamado;
    });

    const graph = buildGraph();
    const config = configFor("t-flaky", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "consultar_chamado", args: { id: "CH-101" }, id: "c1" },
        ],
      }),
      new AIMessage({ content: "O chamado CH-101 está aberto." }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Consulte o CH-101.")] },
      config
    );

    expect(calls).toBe(2);
    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("aberto");

    spy.mockRestore();
  });

  it("scenario 6: does not execute an unrecognized tool", async () => {
    const graph = buildGraph();
    const config = configFor("t-unknown-tool", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "apagar_chamado", args: { id: "CH-101" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content:
          "Não tenho uma ferramenta para apagar chamados, só posso listar, consultar e escalonar.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Apague o CH-101.")] },
      config
    );

    const toolMessage = result.messages.find(
      (m) => (m as { _getType?: () => string })._getType?.() === "tool"
    );
    const content = JSON.parse((toolMessage?.content as string) ?? "{}");
    expect(content.error).toContain("desconhecida");

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).not.toContain("CH-101 apagado");
  });

  it("scenario 7: does not mix context between different thread_ids", async () => {
    const graph = buildGraph();
    const configA = configFor("session-a", [
      new AIMessage({ content: "Olá, aqui é a sessão A." }),
    ]);
    const configB = configFor("session-b", [
      new AIMessage({ content: "Olá, aqui é a sessão B." }),
    ]);

    await graph.invoke(
      { messages: [new HumanMessage("oi, sou da sessão A")] },
      configA
    );
    await graph.invoke(
      { messages: [new HumanMessage("oi, sou da sessão B")] },
      configB
    );

    const stateA = await graph.getState(configA);
    const stateB = await graph.getState(configB);

    const textA = stateA.values.messages
      .map((m: { content: unknown }) => m.content)
      .join(" | ");
    const textB = stateB.values.messages
      .map((m: { content: unknown }) => m.content)
      .join(" | ");

    expect(textA).toContain("sessão A");
    expect(textA).not.toContain("sessão B");
    expect(textB).toContain("sessão B");
    expect(textB).not.toContain("sessão A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/graph.core.test.ts`
Expected: FAIL — `src/lib/graph/graph.ts` and `src/lib/graph/nodes/proposeEscalation.ts` do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/graph/nodes/proposeEscalation.ts`:

```ts
import { AIMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { consultarChamado } from "../../tools/mockChamados";
import { NotFoundError, InvalidInputError } from "../../tools/errors";
import { RegistrarEscalonamentoInputSchema } from "../../tools/schemas";
import { GraphStateType } from "../state";

export interface EscalationProposal {
  chamadoId: string;
  resumo: string;
  justificativa: string;
}

export interface EscalationDecision {
  approved: boolean;
}

export async function proposeEscalationNode(state: GraphStateType) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const escalationCall = lastMessage.tool_calls?.find(
    (c) => c.name === "registrar_escalonamento"
  );
  if (!escalationCall) {
    throw new InvalidInputError(
      "proposeEscalationNode chamado sem tool_call registrar_escalonamento"
    );
  }

  const parsed = RegistrarEscalonamentoInputSchema.safeParse(
    escalationCall.args
  );
  if (!parsed.success) {
    return {
      messages: [
        new AIMessage({
          content: `Não consigo preparar o escalonamento: ${parsed.error.message}`,
        }),
      ],
    };
  }

  try {
    const chamado = consultarChamado({ id: parsed.data.chamadoId });
    if (chamado.situacao !== "aberto") {
      return {
        messages: [
          new AIMessage({
            content:
              `Não é possível escalonar ${chamado.id}: a situação atual é ` +
              `"${chamado.situacao}", só chamados abertos podem ser escalonados.`,
          }),
        ],
      };
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { messages: [new AIMessage({ content: err.message })] };
    }
    throw err;
  }

  const proposal: EscalationProposal = {
    chamadoId: parsed.data.chamadoId,
    resumo: parsed.data.resumo,
    justificativa: parsed.data.justificativa,
  };

  const decision = interrupt<EscalationProposal, EscalationDecision>(
    proposal
  );

  if (!decision.approved) {
    return {
      escalationApproved: false,
      messages: [
        new AIMessage({
          content: `Escalonamento de ${proposal.chamadoId} rejeitado. Nada foi registrado.`,
        }),
      ],
    };
  }

  return { escalationApproved: true, messages: [] };
}
```

Create `src/lib/graph/graph.ts`:

```ts
import { StateGraph, MemorySaver, END, START } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { GraphState, GraphStateType } from "./state";
import { agentNode } from "./nodes/agent";
import { toolsNode } from "./nodes/tools";
import { proposeEscalationNode } from "./nodes/proposeEscalation";
import { registerEscalationNode } from "./nodes/registerEscalation";

function lastAiMessage(state: GraphStateType): AIMessage | undefined {
  const last = state.messages[state.messages.length - 1];
  return last instanceof AIMessage ? last : undefined;
}

function routeAfterAgent(
  state: GraphStateType
): "proposeEscalation" | "tools" | typeof END {
  const ai = lastAiMessage(state);
  const calls = ai?.tool_calls ?? [];
  if (calls.length === 0) return END;
  if (calls.some((c) => c.name === "registrar_escalonamento")) {
    return "proposeEscalation";
  }
  return "tools";
}

function routeAfterPropose(
  state: GraphStateType
): "registerEscalation" | typeof END {
  return state.escalationApproved === true ? "registerEscalation" : END;
}

export function buildGraph() {
  const graph = new StateGraph(GraphState)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addNode("proposeEscalation", proposeEscalationNode)
    .addNode("registerEscalation", registerEscalationNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      tools: "tools",
      proposeEscalation: "proposeEscalation",
      [END]: END,
    })
    .addEdge("tools", "agent")
    .addConditionalEdges("proposeEscalation", routeAfterPropose, {
      registerEscalation: "registerEscalation",
      [END]: END,
    })
    .addEdge("registerEscalation", "agent");

  return graph.compile({ checkpointer: new MemorySaver() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/graph.core.test.ts`
Expected: PASS (9 tests). If `scenario 3a`/`3b` fail on the shape of `pausedState.tasks[0].interrupts[0].value`, run `pnpm ls @langchain/langgraph` to confirm the installed version and check that version's `getState()`/`interrupt()` docs — the interrupt payload location is stable across the 0.2.x line used here, but log `JSON.stringify(pausedState, null, 2)` to confirm the exact path if it differs.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `pnpm test`
Expected: all test files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/graph/nodes/proposeEscalation.ts src/lib/graph/graph.ts tests/graph.core.test.ts
git commit -m "feat: wire full support graph with interrupt-based approval"
```

---

### Task 13: Ollama chat model + `/api/chat` route (thread_id, resume, concurrency limit)

**Files:**
- Create: `src/lib/llm.ts`, `src/app/api/chat/route.ts`
- Test: `tests/api.chat.test.ts`

**Interfaces:**
- Consumes: `ChatModelLike`, `BoundChatModel` (Task 9); `buildGraph` (Task 12); `ASSISTANTS`, `AssistantId` (Task 8); `TOOL_DEFINITIONS` (Task 9); `createLimiter` (Task 6).
- Produces: `createOllamaChatModel(): ChatModelLike`; the `POST` handler at `src/app/api/chat/route.ts` — consumed by Task 14 (UI) and manually by the LangSmith walkthrough (Task 15).

- [ ] **Step 1: Write the failing test**

Create `tests/api.chat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { createFakeChatModel } from "./fakeChatModel";

let scriptedResponses: AIMessage[] = [];

vi.mock("../src/lib/llm", () => ({
  createOllamaChatModel: () => createFakeChatModel(scriptedResponses),
}));

const { POST } = await import("../src/app/api/chat/route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    scriptedResponses = [];
  });

  it("returns 400 when threadId is missing", async () => {
    const res = await POST(
      jsonRequest({ assistantId: "suporte", message: "oi" }) as any
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown assistantId", async () => {
    const res = await POST(
      jsonRequest({
        threadId: "t1",
        assistantId: "financeiro",
        message: "oi",
      }) as any
    );
    expect(res.status).toBe(400);
  });

  it("answers a simple query end to end", async () => {
    scriptedResponses = [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "listar_chamados", args: { situacao: "aberto" }, id: "c1" },
        ],
      }),
      new AIMessage({ content: "CH-101 e CH-103 estão abertos." }),
    ];
    const res = await POST(
      jsonRequest({
        threadId: "api-test-1",
        assistantId: "suporte",
        message: "Liste os chamados abertos.",
      }) as any
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.proposal).toBeNull();
    expect(json.message).toContain("CH-101");
  });

  it("returns a pending proposal when the graph pauses for approval", async () => {
    scriptedResponses = [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
    ];
    const res = await POST(
      jsonRequest({
        threadId: "api-test-2",
        assistantId: "suporte",
        message: "Escalone o CH-101.",
      }) as any
    );
    const json = await res.json();
    expect(json.proposal).toEqual({
      chamadoId: "CH-101",
      resumo: "Falha recorrente",
      justificativa: "Vários usuários afetados",
    });
  });

  it("resumes a paused thread with an approval decision", async () => {
    scriptedResponses = [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
      new AIMessage({ content: "Escalonamento do CH-101 registrado." }),
    ];
    await POST(
      jsonRequest({
        threadId: "api-test-3",
        assistantId: "suporte",
        message: "Escalone o CH-101.",
      }) as any
    );
    const res = await POST(
      jsonRequest({
        threadId: "api-test-3",
        assistantId: "suporte",
        resume: { approved: true },
      }) as any
    );
    const json = await res.json();
    expect(json.message).toContain("registrado");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/api.chat.test.ts`
Expected: FAIL — `src/lib/llm.ts` and `src/app/api/chat/route.ts` do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/llm.ts`:

```ts
import { ChatOllama } from "@langchain/ollama";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ChatModelLike, BoundChatModel } from "./graph/chatModel";
import { ToolDefinition } from "./graph/toolDefinitions";

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
```

> `ChatOllama.bindTools()`'s expected tool shape can differ slightly between
> `@langchain/ollama` versions. After installing, run `pnpm exec tsc --noEmit`
> and fix any type mismatch here against the installed version's
> `node_modules/@langchain/ollama/dist/*.d.ts`.

Create `src/app/api/chat/route.ts`:

```ts
import { NextResponse } from "next/server";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../../../lib/graph/graph";
import { ASSISTANTS, AssistantId } from "../../../lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../../../lib/graph/toolDefinitions";
import { createOllamaChatModel } from "../../../lib/llm";
import { createLimiter } from "../../../lib/tools/concurrencyLimiter";

const MAX_ACTIVE = Number(process.env.MAX_ACTIVE_EXECUTIONS ?? 5);
const limiter = createLimiter(MAX_ACTIVE);
const graph = buildGraph();

interface ChatRequestBody {
  threadId: string;
  assistantId: AssistantId;
  message?: string;
  resume?: { approved: boolean };
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.threadId || !body.assistantId) {
    return NextResponse.json(
      { error: "threadId e assistantId são obrigatórios" },
      { status: 400 }
    );
  }
  const assistant = ASSISTANTS[body.assistantId];
  if (!assistant) {
    return NextResponse.json(
      { error: `assistantId desconhecido: ${body.assistantId}` },
      { status: 400 }
    );
  }
  if (!body.message && !body.resume) {
    return NextResponse.json(
      { error: "informe message ou resume" },
      { status: 400 }
    );
  }

  const config = {
    configurable: {
      thread_id: body.threadId,
      assistant,
      model: createOllamaChatModel(),
      tools: TOOL_DEFINITIONS,
    },
  };

  let release: (() => void) | null = null;
  try {
    release = await limiter.acquire();

    const input = body.resume
      ? new Command({ resume: body.resume })
      : { messages: [new HumanMessage(body.message as string)] };

    await graph.invoke(input, config);
    release();
    release = null;

    const state = await graph.getState(config);
    const pendingInterrupt = state.tasks[0]?.interrupts?.[0]?.value ?? null;
    const messages = state.values.messages as Array<{ content: unknown }>;
    const lastMessage = messages[messages.length - 1];

    return NextResponse.json({
      proposal: pendingInterrupt,
      message: pendingInterrupt ? null : lastMessage?.content ?? null,
    });
  } catch (err) {
    if (release) release();
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/api.chat.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: all test files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm.ts src/app/api/chat/route.ts tests/api.chat.test.ts
git commit -m "feat: add /api/chat route with Ollama model and concurrency limit"
```

---

### Task 14: Chat UI (single page, approval card)

**Files:**
- Create: `src/components/ChatWindow.tsx`, `src/components/ApprovalCard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/chat` (Task 13) — request `{threadId, assistantId, message?}` or `{threadId, assistantId, resume: {approved}}`, response `{proposal: Proposal | null, message: string | null, error?: string}`.
- Produces: the browsable UI — manually verified, consumed by the bonus UI work in Task 22.

- [ ] **Step 1: Create the chat message list component**

Create `src/components/ChatWindow.tsx`:

```tsx
export interface ChatEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatWindow({ entries }: { entries: ChatEntry[] }) {
  return (
    <div className="flex-1 overflow-y-auto rounded border border-slate-200 p-3">
      {entries.length === 0 && (
        <p className="text-sm text-slate-400">
          Pergunte algo, por exemplo: &quot;Liste todos os chamados
          abertos.&quot;
        </p>
      )}
      {entries.map((entry, index) => (
        <div
          key={index}
          className={`mb-2 max-w-[80%] rounded px-3 py-2 text-sm ${
            entry.role === "user"
              ? "ml-auto bg-blue-600 text-white"
              : entry.role === "system"
                ? "bg-red-100 text-red-800"
                : "bg-slate-100 text-slate-900"
          }`}
        >
          {entry.content}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the approval card component**

Create `src/components/ApprovalCard.tsx`:

```tsx
export interface Proposal {
  chamadoId: string;
  resumo: string;
  justificativa: string;
}

export function ApprovalCard({
  proposal,
  onDecide,
}: {
  proposal: Proposal;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">
        Proposta de escalonamento — {proposal.chamadoId}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        <span className="font-medium">Resumo:</span> {proposal.resumo}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        <span className="font-medium">Justificativa:</span>{" "}
        {proposal.justificativa}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
          onClick={() => onDecide(true)}
        >
          Aprovar
        </button>
        <button
          className="rounded bg-red-600 px-3 py-1 text-sm text-white"
          onClick={() => onDecide(false)}
        >
          Rejeitar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the page**

Replace the contents of `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ChatWindow, ChatEntry } from "../components/ChatWindow";
import { ApprovalCard, Proposal } from "../components/ApprovalCard";

type AssistantId = "suporte" | "viagens";

function newThreadId(): string {
  return crypto.randomUUID();
}

function threadKey(assistantId: AssistantId): string {
  return `aurora-thread-${assistantId}`;
}

export default function Home() {
  const assistantId: AssistantId = "suporte";
  const [threadId, setThreadId] = useState<string>("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(
    null
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const key = threadKey(assistantId);
    const existing = sessionStorage.getItem(key);
    const id = existing ?? newThreadId();
    if (!existing) sessionStorage.setItem(key, id);
    setThreadId(id);
  }, [assistantId]);

  async function send(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, assistantId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEntries((prev) => [
          ...prev,
          { role: "system", content: json.error },
        ]);
        return;
      }
      if (json.proposal) {
        setPendingProposal(json.proposal);
      } else {
        setPendingProposal(null);
        if (json.message) {
          setEntries((prev) => [
            ...prev,
            { role: "assistant", content: json.message },
          ]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !threadId) return;
    setEntries((prev) => [...prev, { role: "user", content: input }]);
    const message = input;
    setInput("");
    await send({ message });
  }

  async function handleDecision(approved: boolean) {
    setPendingProposal(null);
    await send({ resume: { approved } });
  }

  function handleNewConversation() {
    const id = newThreadId();
    sessionStorage.setItem(threadKey(assistantId), id);
    setThreadId(id);
    setEntries([]);
    setPendingProposal(null);
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Aurora — Assistente de Suporte</h1>
        <button
          className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300"
          onClick={handleNewConversation}
        >
          Nova conversa
        </button>
      </div>

      <ChatWindow entries={entries} />

      {pendingProposal && (
        <ApprovalCard proposal={pendingProposal} onDecide={handleDecision} />
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          value={input}
          disabled={loading || !!pendingProposal}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Digite sua mensagem..."
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={handleSend}
          disabled={loading || !!pendingProposal}
        >
          Enviar
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Manual verification in the browser**

Prerequisite: Ollama running locally with the model pulled:

```bash
ollama pull qwen2.5:7b-instruct
ollama serve &
```

```bash
pnpm dev
```

Open `http://localhost:3000` and:
1. Send "Liste todos os chamados abertos." — confirm the reply mentions CH-101 and CH-103, not CH-102.
2. Send "Consulte o CH-102 e prepare um escalonamento se ele estiver aberto." — confirm the reply explains it is already resolved and no approval card appears.
3. Send "Escalone o CH-101, resumo: falha recorrente, justificativa: vários usuários afetados." — confirm the approval card appears with that exact chamado/resumo/justificativa.
4. Click **Rejeitar** — confirm a rejection message appears and the input re-enables.
5. Click **Nova conversa**, repeat step 3, click **Aprovar** — confirm a success confirmation appears.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatWindow.tsx src/components/ApprovalCard.tsx src/app/page.tsx
git commit -m "feat: add chat UI with approval card"
```

---

### Task 15: LangSmith trace correlation by thread/run

**Files:**
- Modify: `src/app/api/chat/route.ts:` the `graph.invoke(input, config)` call

**Interfaces:**
- Consumes: `body.threadId`, `body.assistantId` (already in scope in Task 13's route).
- Produces: every graph run tagged and tied to its `thread_id`/assistant in LangSmith, so a trace can be found by session and the pause/resume pair can be matched.

- [ ] **Step 1: Add tags and metadata to the invocation config**

In `src/app/api/chat/route.ts`, change the `config` object to:

```ts
const config = {
  configurable: {
    thread_id: body.threadId,
    assistant,
    model: createOllamaChatModel(),
    tools: TOOL_DEFINITIONS,
  },
  tags: [assistant.id, body.resume ? "resume" : "new-turn"],
  metadata: {
    thread_id: body.threadId,
    assistant_id: assistant.id,
  },
};
```

(This is the same `config` object already passed to both `graph.invoke` and `graph.getState` later in the function — no other line changes.)

- [ ] **Step 2: Confirm environment variables are set**

Check `.env.example` (Task 1) already lists `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`. Copy it to `.env.local` and fill in a real `LANGCHAIN_API_KEY` from a free LangSmith account.

```bash
cp .env.example .env.local
```

- [ ] **Step 3: Manual verification in LangSmith**

```bash
pnpm dev
```

Send a message that triggers a tool call, then an escalation that gets approved. In the LangSmith UI, open the `aurora-support-assistant` project and confirm:
1. A trace exists for the first turn, tagged `suporte` and `new-turn`, with `thread_id` in its metadata, showing the `agent` → `tools` → `agent` node sequence.
2. A second trace exists for the resume call, tagged `resume`, with the **same** `thread_id` in its metadata, showing `proposeEscalation` → `registerEscalation` → `agent`.
3. No tool arguments or outputs contain secrets (they won't — the tools only touch the local mock fixture).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: tag LangSmith traces with thread_id and assistant_id"
```

---

### Task 16: Evaluation dataset and code-based evaluators

**Files:**
- Create: `evaluation/evaluators.ts`, `evaluation/dataset.ts`, `evaluation/runEval.ts`
- Test: `tests/evaluation.evaluators.test.ts`

**Interfaces:**
- Produces: `RunSummary`, `EvalResult`, `evaluateListarChamadosAbertos(run: RunSummary): EvalResult`, `evaluateNaoEscalonaResolvido(run: RunSummary): EvalResult` — pure, unit-tested, and reused by `runEval.ts` against the real graph/Ollama.

- [ ] **Step 1: Write the failing test**

Create `tests/evaluation.evaluators.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  evaluateListarChamadosAbertos,
  evaluateNaoEscalonaResolvido,
  RunSummary,
} from "../evaluation/evaluators";

describe("evaluateListarChamadosAbertos", () => {
  it("approves a run that calls the tool and cites exactly CH-101 and CH-103", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "listar_chamados", args: { situacao: "aberto" } }],
      toolResults: [[{ id: "CH-101" }, { id: "CH-103" }]],
      finalAnswer: "Os chamados abertos são CH-101 e CH-103.",
    };
    expect(evaluateListarChamadosAbertos(run).score).toBe(1);
  });

  it("fails a run that skips the tool call entirely", () => {
    const run: RunSummary = {
      toolCalls: [],
      toolResults: [],
      finalAnswer: "Os chamados abertos são CH-101 e CH-103.",
    };
    const result = evaluateListarChamadosAbertos(run);
    expect(result.score).toBe(0);
    expect(result.comment).toContain("não foi chamada");
  });

  it("fails a run that invents a chamado not returned by the tool", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "listar_chamados", args: { situacao: "aberto" } }],
      toolResults: [[{ id: "CH-101" }, { id: "CH-103" }]],
      finalAnswer: "Os chamados abertos são CH-101, CH-103 e CH-104.",
    };
    const result = evaluateListarChamadosAbertos(run);
    expect(result.score).toBe(0);
    expect(result.comment).toContain("CH-104");
  });

  it("fails a run that omits CH-103", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "listar_chamados", args: { situacao: "aberto" } }],
      toolResults: [[{ id: "CH-101" }, { id: "CH-103" }]],
      finalAnswer: "O chamado aberto é CH-101.",
    };
    expect(evaluateListarChamadosAbertos(run).score).toBe(0);
  });

  it("fails a run called with the wrong situacao filter", () => {
    const run: RunSummary = {
      toolCalls: [
        { name: "listar_chamados", args: { situacao: "resolvido" } },
      ],
      toolResults: [[{ id: "CH-102" }]],
      finalAnswer: "O chamado resolvido é CH-102.",
    };
    const result = evaluateListarChamadosAbertos(run);
    expect(result.score).toBe(0);
    expect(result.comment).toContain('situacao="resolvido"');
  });
});

describe("evaluateNaoEscalonaResolvido", () => {
  it("approves a run that explains the chamado is already resolved", () => {
    const run: RunSummary = {
      toolCalls: [{ name: "consultar_chamado", args: { id: "CH-102" } }],
      toolResults: [{ id: "CH-102", situacao: "resolvido" }],
      finalAnswer: "O CH-102 já está resolvido, não é possível escalonar.",
    };
    expect(evaluateNaoEscalonaResolvido(run).score).toBe(1);
  });

  it("fails a run that escalates a resolved chamado anyway", () => {
    const run: RunSummary = {
      toolCalls: [
        { name: "consultar_chamado", args: { id: "CH-102" } },
        { name: "registrar_escalonamento", args: { chamadoId: "CH-102" } },
      ],
      toolResults: [{ id: "CH-102", situacao: "resolvido" }],
      finalAnswer: "Escalonamento registrado para CH-102.",
    };
    expect(evaluateNaoEscalonaResolvido(run).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/evaluation.evaluators.test.ts`
Expected: FAIL — `evaluation/evaluators.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `evaluation/evaluators.ts`:

```ts
export interface RunSummary {
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults: unknown[];
  finalAnswer: string;
}

export interface EvalResult {
  key: string;
  score: number;
  comment: string;
}

export function evaluateListarChamadosAbertos(run: RunSummary): EvalResult {
  const listCall = run.toolCalls.find((c) => c.name === "listar_chamados");
  if (!listCall) {
    return {
      key: "executa_listar_chamados_aberto",
      score: 0,
      comment: "listar_chamados não foi chamada.",
    };
  }
  if (listCall.args.situacao !== "aberto") {
    return {
      key: "executa_listar_chamados_aberto",
      score: 0,
      comment: `listar_chamados foi chamada com situacao="${listCall.args.situacao}", esperado "aberto".`,
    };
  }

  const mentionsCH101 = run.finalAnswer.includes("CH-101");
  const mentionsCH103 = run.finalAnswer.includes("CH-103");
  const mentionsCH102 = run.finalAnswer.includes("CH-102");
  const inventedIds = (run.finalAnswer.match(/CH-\d{3}/g) ?? []).filter(
    (id) => id !== "CH-101" && id !== "CH-103"
  );

  if (
    !mentionsCH101 ||
    !mentionsCH103 ||
    mentionsCH102 ||
    inventedIds.length > 0
  ) {
    return {
      key: "executa_listar_chamados_aberto",
      score: 0,
      comment:
        `Resposta final não corresponde ao retorno da tool. ` +
        `CH-101=${mentionsCH101} CH-103=${mentionsCH103} CH-102=${mentionsCH102} ` +
        `inventados=${inventedIds.join(",")}`,
    };
  }

  return {
    key: "executa_listar_chamados_aberto",
    score: 1,
    comment:
      "listar_chamados executada com situacao=aberto e resposta cita exatamente CH-101 e CH-103.",
  };
}

export function evaluateNaoEscalonaResolvido(run: RunSummary): EvalResult {
  const escalated = run.toolCalls.some(
    (c) => c.name === "registrar_escalonamento"
  );
  if (escalated) {
    return {
      key: "nao_escalona_resolvido",
      score: 0,
      comment: "registrar_escalonamento foi chamada para um chamado resolvido.",
    };
  }
  if (!run.finalAnswer.toLowerCase().includes("resolvido")) {
    return {
      key: "nao_escalona_resolvido",
      score: 0,
      comment: "Resposta final não explica que o chamado já está resolvido.",
    };
  }
  return {
    key: "nao_escalona_resolvido",
    score: 1,
    comment:
      "Nenhum escalonamento foi proposto para o chamado resolvido, e a resposta explica o motivo.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/evaluation.evaluators.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the dataset seed script**

Create `evaluation/dataset.ts`:

```ts
import { Client } from "langsmith";

const DATASET_NAME = "aurora-support-eval";

async function main() {
  const client = new Client();

  const existing = await client
    .readDataset({ datasetName: DATASET_NAME })
    .catch(() => null);
  const dataset =
    existing ??
    (await client.createDataset(DATASET_NAME, {
      description: "Casos de avaliação do assistente de suporte Aurora.",
    }));

  await client.createExamples({
    inputs: [
      { question: "Liste todos os chamados abertos." },
      {
        question:
          "Consulte o CH-102 e prepare um escalonamento se ele estiver aberto.",
      },
    ],
    outputs: [
      { expectedChamados: ["CH-101", "CH-103"] },
      { expectedBehavior: "não escalonar, chamado já resolvido" },
    ],
    datasetId: dataset.id,
  });

  console.log(`Dataset "${DATASET_NAME}" (${dataset.id}) populado com 2 exemplos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Add the evaluation runner**

Create `evaluation/runEval.ts`:

```ts
import { evaluate } from "langsmith/evaluation";
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/lib/graph/graph";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { createOllamaChatModel } from "../src/lib/llm";
import {
  evaluateListarChamadosAbertos,
  evaluateNaoEscalonaResolvido,
  RunSummary,
} from "./evaluators";

const DATASET_NAME = "aurora-support-eval";

async function runSupportGraph(input: { question: string }): Promise<RunSummary> {
  const graph = buildGraph();
  const threadId = `eval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const config = {
    configurable: {
      thread_id: threadId,
      assistant: ASSISTANTS.suporte,
      model: createOllamaChatModel(),
      tools: TOOL_DEFINITIONS,
    },
  };

  const result = await graph.invoke(
    { messages: [new HumanMessage(input.question)] },
    config
  );

  const toolCalls: RunSummary["toolCalls"] = [];
  const toolResults: unknown[] = [];
  for (const message of result.messages as Array<{
    tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
    content?: unknown;
    tool_call_id?: string;
  }>) {
    if (message.tool_calls?.length) toolCalls.push(...message.tool_calls);
    if (message.tool_call_id) {
      try {
        toolResults.push(JSON.parse(message.content as string));
      } catch {
        toolResults.push(message.content);
      }
    }
  }

  const messages = result.messages as Array<{ content?: unknown }>;
  const finalMessage = messages[messages.length - 1];

  return {
    toolCalls,
    toolResults,
    finalAnswer: String(finalMessage?.content ?? ""),
  };
}

function pickEvaluator(question: string) {
  return question.includes("CH-102")
    ? evaluateNaoEscalonaResolvido
    : evaluateListarChamadosAbertos;
}

async function main() {
  await evaluate(async (input: { question: string }) => runSupportGraph(input), {
    data: DATASET_NAME,
    evaluators: [
      (run, example) => {
        const question = (example?.inputs as { question: string }).question;
        const evaluator = pickEvaluator(question);
        return evaluator(run.outputs as unknown as RunSummary);
      },
    ],
    experimentPrefix: "aurora-support",
    metadata: {
      model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

> The exact shape of `evaluate()`'s options and the evaluator callback's
> `(run, example)` arguments can differ slightly across `langsmith` SDK
> versions. After installing, check
> `node_modules/langsmith/dist/evaluation/*.d.ts` for the installed
> version and adjust field names here if `tsc --noEmit` flags a mismatch.

- [ ] **Step 7: Seed the dataset and run the experiment**

```bash
pnpm seed:dataset
pnpm eval
```

Expected: console confirms the dataset was created/found, then the experiment run completes and prints a LangSmith experiment URL. Open it and confirm both examples show a score (1 for a correct run, 0 with a comment for any skipped/invented case).

- [ ] **Step 8: Commit**

```bash
git add evaluation/evaluators.ts evaluation/dataset.ts evaluation/runEval.ts \
  tests/evaluation.evaluators.test.ts
git commit -m "feat: add LangSmith dataset, code evaluators and eval runner"
```

---

### Task 17: Core README

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: the delivery document required by the challenge ("O que entregar" — installation, run commands, offline tests, evaluation, flow, decisions, limitations). Extended with a bonus section in Task 23.

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
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

\`\`\`bash
pnpm install
cp .env.example .env.local
# edite .env.local e preencha LANGCHAIN_API_KEY
\`\`\`

## Rodando

\`\`\`bash
ollama serve &
pnpm dev
\`\`\`

Abra `http://localhost:3000`.

## Testes offline

\`\`\`bash
pnpm test
\`\`\`

Cobrem os 7 cenários exigidos (consulta/listagem, chamado resolvido,
aprovação/rejeição, aprovação repetida, falha transitória, saída
inválida/limites, sessões isoladas) com um modelo de chat fake
determinístico — nenhum teste chama rede ou o Ollama real.

## Avaliação no LangSmith

\`\`\`bash
pnpm seed:dataset
pnpm eval
\`\`\`

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
```

- [ ] **Step 2: Verify every delivery requirement is covered**

Re-read the "O que entregar" section of `qwantyco-desafio-tecnico.pdf`
(page 3) against this README. Confirm: installation ✓, run commands ✓,
offline tests ✓, evaluation ✓, flow ✓, decisions ✓, limitations ✓.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add core README covering install, run, tests, eval, decisions"
```

---

## Phase 3 — Bonus: travel assistant + RAG

Everything below is optional. Start it only once Phase 2 is complete, tested, and demoable.

### Task 18: Fictitious visa knowledge base (França + Japão)

**Files:**
- Create: `data/rag-docs/franca.md`, `data/rag-docs/japao.md`

**Interfaces:**
- Produces: the markdown knowledge base — consumed by Task 19's `loadDocs`.

- [ ] **Step 1: Create the France document**

Create `data/rag-docs/franca.md`:

```markdown
---
country: França
nationality: Brasileira
purpose: Turismo
duration: "até 90 dias"
---

# Documentação para viagem à França (turismo, até 90 dias) — CONTEÚDO FICTÍCIO PARA SIMULAÇÃO

Este documento é fictício, criado apenas para fins deste exercício técnico.
Não representa orientação migratória real.

Para viajantes brasileiros em viagem de turismo de até 90 dias à França:

- Passaporte válido por pelo menos 3 meses após a data prevista de saída
  do espaço Schengen.
- Comprovante de reserva de hospedagem ou carta-convite.
- Comprovante de passagem de volta ou continuação de viagem.
- Seguro-viagem com cobertura mínima fictícia de 30.000 EUR para toda a
  estadia no espaço Schengen.
- Comprovante de meios de subsistência (extrato bancário fictício).
- Não é exigido visto de turismo para estadias de até 90 dias nesta
  simulação.

Fonte simulada: guia interno fictício "Aurora Travel Docs — França v1".
```

- [ ] **Step 2: Create the Japan document**

Create `data/rag-docs/japao.md`:

```markdown
---
country: Japão
nationality: Brasileira
purpose: Turismo
duration: "até 90 dias"
---

# Documentação para viagem ao Japão (turismo, até 90 dias) — CONTEÚDO FICTÍCIO PARA SIMULAÇÃO

Este documento é fictício, criado apenas para fins deste exercício técnico.
Não representa orientação migratória real.

Para viajantes brasileiros em viagem de turismo de até 90 dias ao Japão:

- Passaporte válido por todo o período da estadia.
- Passagem aérea de volta confirmada.
- Comprovante de hospedagem para os primeiros dias da viagem.
- Comprovante de meios de subsistência (extrato bancário fictício).
- Não é exigido visto de turismo para estadias de até 90 dias nesta
  simulação.

Fonte simulada: guia interno fictício "Aurora Travel Docs — Japão v1".
```

- [ ] **Step 3: Commit**

```bash
git add data/rag-docs/franca.md data/rag-docs/japao.md
git commit -m "feat: add fictitious travel-docs knowledge base (França, Japão)"
```

---

### Task 19: Load and parse the knowledge base

**Files:**
- Create: `src/lib/rag/loadDocs.ts`
- Test: `tests/rag.loadDocs.test.ts`

**Interfaces:**
- Consumes: the markdown files from Task 18.
- Produces: `RagDocument`, `loadDocs(dir?: string): RagDocument[]` — consumed by Task 20.

- [ ] **Step 1: Write the failing test**

Create `tests/rag.loadDocs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDocs } from "../src/lib/rag/loadDocs";

describe("loadDocs", () => {
  it("loads França and Japão with required frontmatter fields", () => {
    const docs = loadDocs();
    const franca = docs.find((d) => d.country === "França");
    const japao = docs.find((d) => d.country === "Japão");
    expect(franca).toBeDefined();
    expect(japao).toBeDefined();
    expect(franca?.nationality).toBe("Brasileira");
    expect(franca?.content.length).toBeGreaterThan(0);
  });

  it("throws a clear error when a required frontmatter field is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-docs-"));
    fs.writeFileSync(
      path.join(dir, "incompleto.md"),
      "---\ncountry: Teste\n---\nConteúdo sem os demais campos.\n"
    );
    expect(() => loadDocs(dir)).toThrow(/frontmatter ausente/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/rag.loadDocs.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/rag/loadDocs.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface RagDocument {
  id: string;
  country: string;
  nationality: string;
  purpose: string;
  duration: string;
  content: string;
  source: string;
}

const DOCS_DIR = path.join(process.cwd(), "data", "rag-docs");
const REQUIRED_FIELDS = ["country", "nationality", "purpose", "duration"] as const;

export function loadDocs(dir: string = DOCS_DIR): RagDocument[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, string>;
    for (const field of REQUIRED_FIELDS) {
      if (!data[field]) {
        throw new Error(`${file}: campo de frontmatter ausente: ${field}`);
      }
    }
    return {
      id: file.replace(/\.md$/, ""),
      country: data.country,
      nationality: data.nationality,
      purpose: data.purpose,
      duration: data.duration,
      content: parsed.content.trim(),
      source: file,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/rag.loadDocs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/loadDocs.ts tests/rag.loadDocs.test.ts
git commit -m "feat: parse the travel-docs knowledge base with gray-matter"
```

---

### Task 20: In-memory vector store and `call_rag` tool

**Files:**
- Create: `src/lib/rag/embeddings.ts`, `src/lib/rag/vectorStore.ts`, `src/lib/tools/ragTool.ts`
- Create: `tests/fakeEmbeddings.ts` (test double)
- Test: `tests/rag.vectorStore.test.ts`, `tests/tools.ragTool.test.ts`

**Interfaces:**
- Consumes: `RagDocument`, `loadDocs` (Task 19).
- Produces: `EmbeddingsLike`; `buildVectorStore`, `searchChunks`, `RagChunk`, `SearchResult`; `CallRagInputSchema`, `CallRagInput`, `CallRagOutput`, `callRag(input, embeddings)`, `resetRagCache()` — consumed by Task 21 (wires `call_rag` into the tools node and `TOOL_DEFINITIONS`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rag/embeddings.ts`:

```ts
export interface EmbeddingsLike {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}
```

Create `tests/fakeEmbeddings.ts`:

```ts
import { EmbeddingsLike } from "../src/lib/rag/embeddings";

const VOCAB = ["frança", "japão", "visto", "turismo", "passaporte", "seguro"];

function vectorize(text: string): number[] {
  const normalized = text.toLowerCase();
  return VOCAB.map((word) => (normalized.includes(word) ? 1 : 0));
}

export const fakeEmbeddings: EmbeddingsLike = {
  async embedQuery(text: string) {
    return vectorize(text);
  },
  async embedDocuments(texts: string[]) {
    return texts.map(vectorize);
  },
};
```

Create `tests/rag.vectorStore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildVectorStore, searchChunks } from "../src/lib/rag/vectorStore";
import { fakeEmbeddings } from "./fakeEmbeddings";
import { RagDocument } from "../src/lib/rag/loadDocs";

const docs: RagDocument[] = [
  {
    id: "franca",
    country: "França",
    nationality: "Brasileira",
    purpose: "Turismo",
    duration: "até 90 dias",
    content:
      "Documentação para a França: passaporte e seguro exigidos para turismo.",
    source: "franca.md",
  },
  {
    id: "japao",
    country: "Japão",
    nationality: "Brasileira",
    purpose: "Turismo",
    duration: "até 90 dias",
    content:
      "Documentação para o Japão: passaporte válido, sem visto exigido para turismo.",
    source: "japao.md",
  },
];

describe("vectorStore", () => {
  it("retrieves the most relevant chunk for a country-specific query", async () => {
    const chunks = await buildVectorStore(docs, fakeEmbeddings);
    const results = await searchChunks(
      chunks,
      "Preciso de visto e seguro para a França?",
      fakeEmbeddings
    );
    expect(results[0].country).toBe("França");
  });

  it("filters results by country when provided", async () => {
    const chunks = await buildVectorStore(docs, fakeEmbeddings);
    const results = await searchChunks(chunks, "passaporte", fakeEmbeddings, {
      country: "Japão",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.country === "Japão")).toBe(true);
  });

  it("returns no results when the query has no overlap with the base (sem evidência)", async () => {
    const chunks = await buildVectorStore(docs, fakeEmbeddings);
    const results = await searchChunks(
      chunks,
      "previsão do tempo amanhã",
      fakeEmbeddings
    );
    expect(results).toEqual([]);
  });
});
```

Create `tests/tools.ragTool.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { callRag, resetRagCache } from "../src/lib/tools/ragTool";
import { fakeEmbeddings } from "./fakeEmbeddings";

describe("callRag", () => {
  beforeEach(() => resetRagCache());

  it("returns found=true with sources for a query covered by the base", async () => {
    const result = await callRag(
      { query: "Preciso de visto e seguro para a França?" },
      fakeEmbeddings
    );
    expect(result.found).toBe(true);
    expect(result.chunks[0].source).toBe("franca.md");
  });

  it("returns found=false when there is no evidence in the base", async () => {
    const result = await callRag(
      { query: "previsão do tempo amanhã" },
      fakeEmbeddings
    );
    expect(result.found).toBe(false);
    expect(result.chunks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/rag.vectorStore.test.ts tests/tools.ragTool.test.ts`
Expected: FAIL — `src/lib/rag/vectorStore.ts` and `src/lib/tools/ragTool.ts` do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/rag/vectorStore.ts`:

```ts
import { RagDocument } from "./loadDocs";
import { EmbeddingsLike } from "./embeddings";

export interface RagChunk {
  docId: string;
  country: string;
  nationality: string;
  purpose: string;
  duration: string;
  source: string;
  text: string;
  embedding: number[];
}

export interface SearchResult {
  text: string;
  source: string;
  country: string;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function buildVectorStore(
  docs: RagDocument[],
  embeddings: EmbeddingsLike
): Promise<RagChunk[]> {
  const vectors = await embeddings.embedDocuments(docs.map((d) => d.content));
  return docs.map((doc, i) => ({
    docId: doc.id,
    country: doc.country,
    nationality: doc.nationality,
    purpose: doc.purpose,
    duration: doc.duration,
    source: doc.source,
    text: doc.content,
    embedding: vectors[i],
  }));
}

export async function searchChunks(
  chunks: RagChunk[],
  query: string,
  embeddings: EmbeddingsLike,
  opts: { k?: number; country?: string; minScore?: number } = {}
): Promise<SearchResult[]> {
  const k = opts.k ?? 3;
  const minScore = opts.minScore ?? 0.3;
  const queryVector = await embeddings.embedQuery(query);

  const pool = opts.country
    ? chunks.filter(
        (c) => c.country.toLowerCase() === opts.country!.toLowerCase()
      )
    : chunks;

  return pool
    .map((chunk) => ({
      text: chunk.text,
      source: chunk.source,
      country: chunk.country,
      score: cosineSimilarity(queryVector, chunk.embedding),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
```

Create `src/lib/tools/ragTool.ts`:

```ts
import { z } from "zod";
import { loadDocs } from "../rag/loadDocs";
import { buildVectorStore, searchChunks, RagChunk } from "../rag/vectorStore";
import { EmbeddingsLike } from "../rag/embeddings";

export const CallRagInputSchema = z.object({
  query: z.string().min(1),
  country: z.string().optional(),
});
export type CallRagInput = z.infer<typeof CallRagInputSchema>;

export interface CallRagOutput {
  found: boolean;
  chunks: Array<{ text: string; source: string; country: string }>;
}

let cachedChunks: RagChunk[] | null = null;

export async function callRag(
  input: CallRagInput,
  embeddings: EmbeddingsLike
): Promise<CallRagOutput> {
  if (!cachedChunks) {
    cachedChunks = await buildVectorStore(loadDocs(), embeddings);
  }
  const results = await searchChunks(cachedChunks, input.query, embeddings, {
    country: input.country,
  });
  if (results.length === 0) {
    return { found: false, chunks: [] };
  }
  return {
    found: true,
    chunks: results.map((r) => ({
      text: r.text,
      source: r.source,
      country: r.country,
    })),
  };
}

export function resetRagCache(): void {
  cachedChunks = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/rag.vectorStore.test.ts tests/tools.ragTool.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/embeddings.ts src/lib/rag/vectorStore.ts src/lib/tools/ragTool.ts \
  tests/fakeEmbeddings.ts tests/rag.vectorStore.test.ts tests/tools.ragTool.test.ts
git commit -m "feat: add in-memory RAG vector store and call_rag tool"
```

---

### Task 21: Wire `call_rag` into the tools node, tool definitions and real embeddings

**Files:**
- Modify: `src/lib/graph/toolDefinitions.ts`, `src/lib/graph/nodes/tools.ts`, `src/lib/llm.ts`, `src/app/api/chat/route.ts`
- Modify (extend): `tests/graph.tools.node.test.ts`

**Interfaces:**
- Consumes: `CallRagInputSchema`, `callRag` (Task 20); `EmbeddingsLike` (Task 20).
- Produces: `toolsNode` now executes `call_rag` for whichever assistant has it in its allowlist (`viagens`); `createOllamaEmbeddings(): EmbeddingsLike` for production — consumed by Task 22.

- [ ] **Step 1: Extend the failing test**

Replace the contents of `tests/graph.tools.node.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { toolsNode } from "../src/lib/graph/nodes/tools";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { GraphStateType } from "../src/lib/graph/state";
import { fakeEmbeddings } from "./fakeEmbeddings";
import { resetRagCache } from "../src/lib/tools/ragTool";

function stateWithToolCall(
  name: string,
  args: Record<string, unknown>
): GraphStateType {
  const aiMessage = new AIMessage({
    content: "",
    tool_calls: [{ name, args, id: "call-1" }],
  });
  return {
    messages: [aiMessage],
    escalationApproved: null,
    escalationRegistered: false,
    escalationRecord: null,
  } as unknown as GraphStateType;
}

describe("toolsNode", () => {
  it("executes listar_chamados and returns the filtered result as JSON", async () => {
    const state = stateWithToolCall("listar_chamados", {
      situacao: "aberto",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.map((c: { id: string }) => c.id).sort()).toEqual([
      "CH-101",
      "CH-103",
    ]);
  });

  it("returns a NotFoundError payload for an unknown chamado id", async () => {
    const state = stateWithToolCall("consultar_chamado", { id: "CH-999" });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("CH-999");
  });

  it("blocks a tool outside the assistant's allowlist", async () => {
    const state = stateWithToolCall("listar_chamados", {
      situacao: "aberto",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.viagens },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("não é permitida");
  });

  it("returns an UnknownToolError payload for an unrecognized tool name", async () => {
    const state = stateWithToolCall("apagar_chamado", {});
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("desconhecida");
  });

  it("executes call_rag for the viagens assistant and returns sourced chunks", async () => {
    resetRagCache();
    const state = stateWithToolCall("call_rag", {
      query: "Preciso de visto e seguro para a França?",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.viagens, embeddings: fakeEmbeddings },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.found).toBe(true);
    expect(content.chunks[0].source).toBe("franca.md");
  });

  it("blocks call_rag for the suporte assistant", async () => {
    const state = stateWithToolCall("call_rag", { query: "qualquer coisa" });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte, embeddings: fakeEmbeddings },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("não é permitida");
  });
});
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `pnpm vitest run tests/graph.tools.node.test.ts`
Expected: FAIL on the two new `call_rag` cases — `toolsNode` does not yet recognize `call_rag`.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/lib/graph/toolDefinitions.ts`:

```ts
import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
  RegistrarEscalonamentoInputSchema,
} from "../tools/schemas";
import { CallRagInputSchema } from "../tools/ragTool";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: unknown;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "listar_chamados",
    description:
      "Lista chamados mockados, com filtro opcional de situacao ('aberto' ou 'resolvido').",
    schema: ListarChamadosInputSchema,
  },
  {
    name: "consultar_chamado",
    description: "Busca um chamado mockado pelo identificador (ex: CH-101).",
    schema: ConsultarChamadoInputSchema,
  },
  {
    name: "registrar_escalonamento",
    description:
      "Prepara um escalonamento para um chamado aberto, com resumo e justificativa. " +
      "Só é efetivado após aprovação humana.",
    schema: RegistrarEscalonamentoInputSchema,
  },
  {
    name: "call_rag",
    description:
      "Recupera trechos da base própria de documentação de viagens, opcionalmente " +
      "filtrando por país. Retorna found=false quando não há evidência suficiente.",
    schema: CallRagInputSchema,
  },
];
```

Replace the contents of `src/lib/graph/nodes/tools.ts`:

```ts
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
} from "../../tools/schemas";
import { listarChamados, consultarChamado } from "../../tools/mockChamados";
import { CallRagInputSchema, callRag } from "../../tools/ragTool";
import {
  InvalidInputError,
  UnknownToolError,
  ToolNotAllowedError,
} from "../../tools/errors";
import { executeWithRetry } from "../../tools/executeWithRetry";
import { AssistantConfig } from "../assistants";
import { GraphStateType } from "../state";
import { EmbeddingsLike } from "../../rag/embeddings";

async function runTool(
  name: string,
  rawArgs: unknown,
  embeddings?: EmbeddingsLike
): Promise<unknown> {
  switch (name) {
    case "listar_chamados": {
      const parsed = ListarChamadosInputSchema.safeParse(rawArgs);
      if (!parsed.success) throw new InvalidInputError(parsed.error.message);
      return listarChamados(parsed.data);
    }
    case "consultar_chamado": {
      const parsed = ConsultarChamadoInputSchema.safeParse(rawArgs);
      if (!parsed.success) throw new InvalidInputError(parsed.error.message);
      return consultarChamado(parsed.data);
    }
    case "call_rag": {
      const parsed = CallRagInputSchema.safeParse(rawArgs);
      if (!parsed.success) throw new InvalidInputError(parsed.error.message);
      if (!embeddings) {
        throw new Error(
          "toolsNode requer config.configurable.embeddings para executar call_rag"
        );
      }
      return callRag(parsed.data, embeddings);
    }
    default:
      throw new UnknownToolError(name);
  }
}

export async function toolsNode(
  state: GraphStateType,
  config: {
    configurable?: { assistant?: AssistantConfig; embeddings?: EmbeddingsLike };
  }
): Promise<{ messages: BaseMessage[] }> {
  const assistant = config.configurable?.assistant;
  if (!assistant) {
    throw new Error("toolsNode requer config.configurable.assistant");
  }
  const embeddings = config.configurable?.embeddings;
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls ?? [];
  const results: ToolMessage[] = [];

  for (const call of toolCalls) {
    const toolCallId = call.id ?? call.name;
    try {
      if (!assistant.allowedTools.includes(call.name)) {
        throw new ToolNotAllowedError(call.name, assistant.id);
      }
      const output = await executeWithRetry(() =>
        runTool(call.name, call.args, embeddings)
      );
      results.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify(output),
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      results.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: message }),
        })
      );
    }
  }

  return { messages: results };
}
```

In `src/lib/llm.ts`, add alongside `createOllamaChatModel`:

```ts
import { OllamaEmbeddings } from "@langchain/ollama";
import { EmbeddingsLike } from "./rag/embeddings";

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
```

In `src/app/api/chat/route.ts`, add the embeddings instance to the existing `config.configurable` object (import `createOllamaEmbeddings` from `../../../lib/llm`):

```ts
const config = {
  configurable: {
    thread_id: body.threadId,
    assistant,
    model: createOllamaChatModel(),
    embeddings: createOllamaEmbeddings(),
    tools: TOOL_DEFINITIONS,
  },
  tags: [assistant.id, body.resume ? "resume" : "new-turn"],
  metadata: {
    thread_id: body.threadId,
    assistant_id: assistant.id,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/graph.tools.node.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: all test files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/graph/toolDefinitions.ts src/lib/graph/nodes/tools.ts src/lib/llm.ts \
  src/app/api/chat/route.ts tests/graph.tools.node.test.ts
git commit -m "feat: wire call_rag into the tools node with real Ollama embeddings"
```

---

### Task 22: Assistants-separation graph test (B4) and UI assistant selector

**Files:**
- Test: `tests/graph.assistants.flow.test.ts`
- Create: `src/components/AssistantSelector.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `buildGraph` (Task 12); `ASSISTANTS` (Task 8); `TOOL_DEFINITIONS` (Task 21); `createFakeChatModel` (Task 9); `fakeEmbeddings`, `resetRagCache` (Tasks 20/21).
- Produces: automated proof that the backend enforces tool separation per assistant (satisfies "B4 Mostre que a separação funciona"); a UI control to switch assistants with isolated history per assistant.

- [ ] **Step 1: Write the acceptance test**

Create `tests/graph.assistants.flow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/lib/graph/graph";
import { ASSISTANTS, AssistantId } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { createFakeChatModel } from "./fakeChatModel";
import { fakeEmbeddings } from "./fakeEmbeddings";
import { resetRagCache } from "../src/lib/tools/ragTool";

function configFor(
  threadId: string,
  assistantId: AssistantId,
  script: AIMessage[]
) {
  return {
    configurable: {
      thread_id: threadId,
      assistant: ASSISTANTS[assistantId],
      model: createFakeChatModel(script),
      embeddings: fakeEmbeddings,
      tools: TOOL_DEFINITIONS,
    },
  };
}

describe("assistants separation (bonus, B4)", () => {
  it("viagens retrieves with source for a question covered by the base", async () => {
    resetRagCache();
    const graph = buildGraph();
    const config = configFor("t-viagens-source", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "call_rag",
            args: { query: "Preciso de visto e seguro para a França?" },
            id: "c1",
          },
        ],
      }),
      new AIMessage({
        content:
          "Para a França, não é exigido visto de turismo até 90 dias. Fonte: franca.md.",
      }),
    ]);

    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage(
            "Qual documentação preciso para viajar para a França?"
          ),
        ],
      },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("franca.md");
  });

  it("viagens acknowledges missing evidence instead of inventing an answer", async () => {
    resetRagCache();
    const graph = buildGraph();
    const config = configFor("t-viagens-no-evidence", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "call_rag",
            args: { query: "previsão do tempo amanhã" },
            id: "c1",
          },
        ],
      }),
      new AIMessage({
        content:
          "Não encontrei evidência na base de documentação de viagens para essa pergunta.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Vai chover amanhã?")] },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(String(finalMessage.content).toLowerCase()).toContain(
      "não encontrei"
    );
  });

  it("viagens cannot execute chamados tools", async () => {
    const graph = buildGraph();
    const config = configFor("t-viagens-blocked", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "listar_chamados", args: { situacao: "aberto" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content:
          "Não tenho acesso a chamados de suporte, só à documentação de viagens.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Liste os chamados abertos.")] },
      config
    );

    const toolMessage = result.messages.find(
      (m) => (m as { _getType?: () => string })._getType?.() === "tool"
    );
    const content = JSON.parse((toolMessage?.content as string) ?? "{}");
    expect(content.error).toContain("não é permitida");
  });

  it("suporte cannot query the RAG base", async () => {
    const graph = buildGraph();
    const config = configFor("t-suporte-blocked", "suporte", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "call_rag", args: { query: "qualquer coisa" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content: "Não tenho acesso à base de documentação de viagens.",
      }),
    ]);

    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage("Qual documentação preciso para a França?"),
        ],
      },
      config
    );

    const toolMessage = result.messages.find(
      (m) => (m as { _getType?: () => string })._getType?.() === "tool"
    );
    const content = JSON.parse((toolMessage?.content as string) ?? "{}");
    expect(content.error).toContain("não é permitida");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run tests/graph.assistants.flow.test.ts`
Expected: PASS (4 tests) — no production code changes needed here; this confirms Tasks 8, 12, 20 and 21 already compose correctly into the required separation behavior.

- [ ] **Step 3: Add the assistant selector component**

Create `src/components/AssistantSelector.tsx`:

```tsx
import { AssistantId } from "../lib/graph/assistants";

export function AssistantSelector({
  value,
  onChange,
}: {
  value: AssistantId;
  onChange: (id: AssistantId) => void;
}) {
  return (
    <select
      className="rounded border border-slate-300 px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as AssistantId)}
    >
      <option value="suporte">Suporte</option>
      <option value="viagens">Viagens</option>
    </select>
  );
}
```

- [ ] **Step 4: Wire the selector into the page**

Replace the contents of `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ChatWindow, ChatEntry } from "../components/ChatWindow";
import { ApprovalCard, Proposal } from "../components/ApprovalCard";
import { AssistantSelector } from "../components/AssistantSelector";
import { AssistantId } from "../lib/graph/assistants";

function newThreadId(): string {
  return crypto.randomUUID();
}

function threadKey(assistantId: AssistantId): string {
  return `aurora-thread-${assistantId}`;
}

export default function Home() {
  const [assistantId, setAssistantId] = useState<AssistantId>("suporte");
  const [threadId, setThreadId] = useState<string>("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(
    null
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const key = threadKey(assistantId);
    const existing = sessionStorage.getItem(key);
    const id = existing ?? newThreadId();
    if (!existing) sessionStorage.setItem(key, id);
    setThreadId(id);
    setEntries([]);
    setPendingProposal(null);
  }, [assistantId]);

  async function send(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, assistantId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEntries((prev) => [
          ...prev,
          { role: "system", content: json.error },
        ]);
        return;
      }
      if (json.proposal) {
        setPendingProposal(json.proposal);
      } else {
        setPendingProposal(null);
        if (json.message) {
          setEntries((prev) => [
            ...prev,
            { role: "assistant", content: json.message },
          ]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !threadId) return;
    setEntries((prev) => [...prev, { role: "user", content: input }]);
    const message = input;
    setInput("");
    await send({ message });
  }

  async function handleDecision(approved: boolean) {
    setPendingProposal(null);
    await send({ resume: { approved } });
  }

  function handleNewConversation() {
    const id = newThreadId();
    sessionStorage.setItem(threadKey(assistantId), id);
    setThreadId(id);
    setEntries([]);
    setPendingProposal(null);
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <AssistantSelector value={assistantId} onChange={setAssistantId} />
        <button
          className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300"
          onClick={handleNewConversation}
        >
          Nova conversa
        </button>
      </div>

      <ChatWindow entries={entries} />

      {pendingProposal && (
        <ApprovalCard proposal={pendingProposal} onDecide={handleDecision} />
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          value={input}
          disabled={loading || !!pendingProposal}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Digite sua mensagem..."
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={handleSend}
          disabled={loading || !!pendingProposal}
        >
          Enviar
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Manual verification in the browser**

```bash
ollama pull nomic-embed-text
pnpm dev
```

1. With **Suporte** selected, ask "Liste os chamados abertos." — confirm it still works as in Task 14.
2. Switch to **Viagens** — confirm the message list clears (separate history).
3. Ask "Qual documentação preciso para viajar para a França?" — confirm the answer cites `franca.md`.
4. Ask something unrelated (e.g. "Vai chover amanhã?") — confirm the assistant says it has no evidence, instead of inventing an answer.
5. Switch back to **Suporte** — confirm the earlier chamados conversation is still there, unmixed with the Viagens messages.

- [ ] **Step 6: Commit**

```bash
git add tests/graph.assistants.flow.test.ts src/components/AssistantSelector.tsx src/app/page.tsx
git commit -m "feat: add assistant selector UI and prove backend tool separation"
```

---

### Task 23: Bonus README section

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: the bonus half of the delivery document (knowledge base, RAG approach, Assistants configuration, how the separation is tested and demoed).

- [ ] **Step 1: Append the bonus section**

Append to `README.md`:

```markdown

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

Para rodar: `ollama pull nomic-embed-text` além do modelo de chat, depois
`pnpm dev` e trocar o assistant no seletor da página.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add bonus section for travel assistant and RAG"
```

---
