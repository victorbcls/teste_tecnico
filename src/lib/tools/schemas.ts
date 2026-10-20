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
