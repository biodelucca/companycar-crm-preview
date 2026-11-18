import { apiClient } from "./apiClient.js";
import { mapBusca } from "./buscas.js";

// Melhoria 10 / Central de Recuperação — Etapa C1 (SOMENTE LEITURA).
// Único lugar que fala com a rota GET listCentralRecuperacao. Não há nenhuma
// função de escrita neste arquivo (a C2 é uma etapa à parte, ainda não autorizada).

function texto(v) {
  return v === null || v === undefined ? "" : String(v);
}
function numeroOuNulo(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
export function mapVeiculoRecuperacao(raw) {
  return {
    id: texto(raw.id),
    veiculoId: texto(raw.veiculo_id),
    marca: texto(raw.marca),
    modeloVersao: texto(raw.modelo_versao),
    ano: texto(raw.ano),
    km: numeroOuNulo(raw.km),
    preco: numeroOuNulo(raw.preco),
    cambio: texto(raw.cambio),
    encontradaEm: texto(raw.encontrada_em),
    situacaoVeiculo: raw.situacao_veiculo === "indisponivel" ? "indisponivel" : "disponivel",
    situacaoAtualizadaEm: texto(raw.situacao_atualizada_em),
    ausenteDesde: texto(raw.ausente_desde),
    regraExplicacao: texto(raw.regra_explicacao),
    nova: raw.nova === true,
  };
}
export function mapDemandaRecuperacao(raw) {
  const r = raw.resumo ?? {};
  return {
    busca: mapBusca(raw.busca ?? {}),
    veiculos: (raw.veiculos ?? []).map(mapVeiculoRecuperacao),
    resumo: {
      total: Number(r.total || 0),
      disponiveis: Number(r.disponiveis || 0),
      indisponiveis: Number(r.indisponiveis || 0),
      novas: Number(r.novas || 0),
      primeiraEncontradaEm: texto(r.primeira_encontrada_em),
      ultimaEncontradaEm: texto(r.ultima_encontrada_em),
      ultimaAtividadeHumanaEm: texto(r.ultima_atividade_humana_em),
      semAcompanhamento: r.sem_acompanhamento === true,
      horasSemAcompanhamento: r.horas_sem_acompanhamento === null || r.horas_sem_acompanhamento === undefined ? null : Number(r.horas_sem_acompanhamento),
    },
  };
}

// Leitura: o backend decide o que o usuário pode ver (Gerência e visão global:
// todas; demais: as próprias buscas). Nada aqui amplia ou restringe a visão.
export async function listCentralRecuperacao(idToken) {
  const raw = await apiClient.request({ action: "listCentralRecuperacao", idToken: idToken ?? undefined });
  return {
    geradoEm: texto(raw?.gerado_em),
    horasNova: Number(raw?.horas_nova || 24),
    horasSemAcompanhamento: Number(raw?.horas_sem_acompanhamento || 24),
    demandas: (raw?.demandas ?? []).map(mapDemandaRecuperacao),
  };
}
