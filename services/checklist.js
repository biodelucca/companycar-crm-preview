import { apiClient } from "./apiClient.js";
// Ciclo 22 "Funil Comercial — Bloco 1" (2026-08-12) — checklist real por
// etapa, persistido no backend (ver Checklist.gs). Substitui o Passo 8
// (Sprint 1, Ciclo 4), que vivia só em memória do navegador com itens
// placeholder genéricos por tipo de etapa (ver nota histórica em
// Pipeline.tsx). Os itens oficiais de cada etapa são definidos no backend
// — este service só busca o estado atual e marca/desmarca, nunca decide o
// conteúdo (mesma filosofia de "nunca inventar lista oficial de negócio no
// frontend" já usada para Motivos de Perda/Origens).
//
// Mesmo padrão de services/anotacoes.ts: sempre fala com o backend real
// (sem branch USE_MOCK), buscado sob demanda quando o painel lateral abre
// (ou muda de etapa), não numa listagem geral do Pipeline.
export async function obterChecklist(oportunidadeId, idToken) {
    const resposta = await apiClient.request({
        action: "listChecklist",
        params: { oportunidadeId },
        idToken: idToken ?? undefined,
    });
    return resposta ?? [];
}
export async function marcarItemChecklist(oportunidadeId, itemChave, marcado, usuarioId, idToken) {
    const resposta = await apiClient.request({
        action: "marcarItemChecklist",
        body: { oportunidadeId, itemChave, marcado, usuarioId },
        idToken: idToken ?? undefined,
    });
    return resposta ?? [];
}
