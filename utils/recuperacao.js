import { modelosDaBusca, nomeModelo, normalizarTexto } from "./buscas.js";

// Melhoria 10 / Central de Recuperação — Etapa C1 (somente leitura).
// Funções puras de apoio da tela: filtros, rótulos e textos.

export const FILTROS_STATUS_RECUPERACAO = [
  { valor: "", rotulo: "Todas as demandas" },
  { valor: "sem_acompanhamento", rotulo: "Sem acompanhamento (24 h ou mais)" },
  { valor: "novas", rotulo: "Com novas correspondências" },
  { valor: "disponiveis", rotulo: "Com veículo disponível" },
  { valor: "sem_disponivel", rotulo: "Sem veículo disponível agora" },
];
export const FILTROS_PERIODO_RECUPERACAO = [
  { valor: "", rotulo: "Todo o período" },
  { valor: "1", rotulo: "Últimas 24 horas" },
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
];

export function nomeVeiculo(v) {
  return [v.marca, v.modeloVersao].filter(Boolean).join(" · ") || "Veículo sem descrição";
}
export function rotuloCambioVeiculo(c) {
  const t = normalizarTexto(c);
  if (!t) return "—";
  if (t.startsWith("aut")) return "Automático";
  if (t.startsWith("man")) return "Manual";
  return String(c);
}
export function textoKm(km) {
  return km === null || km === undefined ? "—" : `${Number(km).toLocaleString("pt-BR")} km`;
}

// Nomes de modelos que aparecem nas demandas (principal + alternativos) para o filtro.
export function opcoesModelo(demandas) {
  const nomes = new Set();
  for (const d of demandas) for (const m of modelosDaBusca(d.busca)) { const n = nomeModelo(m); if (n) nomes.add(n); }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
export function opcoesResponsavel(demandas, usuariosPorId) {
  const ids = new Set(demandas.map((d) => String(d.busca.responsavelId)).filter(Boolean));
  return [...ids].map((id) => ({ id, nome: usuariosPorId.get(id)?.nome ?? `Usuário ${id}` })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// agoraIso = relógio do SERVIDOR (gerado_em) para não depender do relógio do aparelho.
export function filtrarDemandas(demandas, { termo = "", responsavelId = "", modelo = "", status = "", periodoDias = "" }, clientesPorId, agoraIso) {
  const t = normalizarTexto(termo);
  const agora = agoraIso && !Number.isNaN(Date.parse(agoraIso)) ? Date.parse(agoraIso) : Date.now();
  const corte = periodoDias ? agora - Number(periodoDias) * 86400000 : null;
  return demandas.filter((d) => {
    const b = d.busca;
    if (responsavelId && String(b.responsavelId) !== String(responsavelId)) return false;
    if (modelo && !modelosDaBusca(b).some((m) => nomeModelo(m) === modelo)) return false;
    if (status === "sem_acompanhamento" && !d.resumo.semAcompanhamento) return false;
    if (status === "novas" && !(d.resumo.novas > 0)) return false;
    if (status === "disponiveis" && !(d.resumo.disponiveis > 0)) return false;
    if (status === "sem_disponivel" && d.resumo.disponiveis > 0) return false;
    if (corte !== null) {
      const ms = Date.parse(d.resumo.ultimaEncontradaEm);
      if (Number.isNaN(ms) || ms < corte) return false;
    }
    if (!t) return true;
    const cliente = clientesPorId?.get(String(b.clienteId));
    const modelos = modelosDaBusca(b).map((m) => `${m.marca ?? ""} ${m.modelo ?? ""}`).join(" ");
    const veic = d.veiculos.map((v) => `${v.marca} ${v.modeloVersao}`).join(" ");
    return [b.codigo, cliente?.nome, modelos, veic].some((c) => c && normalizarTexto(c).includes(t));
  });
}

export function contagemRecuperacao(demandas) {
  return {
    demandas: demandas.length,
    novas: demandas.filter((d) => d.resumo.novas > 0).length,
    semAcompanhamento: demandas.filter((d) => d.resumo.semAcompanhamento).length,
    veiculosDisponiveis: demandas.reduce((s, d) => s + d.resumo.disponiveis, 0),
  };
}

export function textoSemAcompanhamento(resumo, horasLimite = 24) {
  const h = resumo.horasSemAcompanhamento;
  const tempo = h === null || h === undefined ? "" : h >= 48 ? ` há ${Math.floor(h / 24)} dias` : ` há ${h} h`;
  return `Sem acompanhamento${tempo}`.trim() + (h === null ? ` (${horasLimite} h ou mais)` : "");
}
export const EXPLICACAO_SEM_ACOMPANHAMENTO =
  "Há veículo disponível encontrado há 24 h ou mais e nenhum registro de pessoa (nem na oportunidade nem na busca) depois disso. " +
  "Contatos feitos fora do CRM, como no WhatsApp pessoal, não aparecem aqui.";
export const EXPLICACAO_NOVA = "Veículo disponível encontrado nas últimas 24 horas.";
