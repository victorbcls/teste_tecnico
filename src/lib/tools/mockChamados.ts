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
