import { apiClient } from "./apiClient.js";
import { mapBusca } from "./buscas.js";
import { gerarRequisicaoId } from "../utils/buscas.js";

// Melhoria 10 / Central de Recuperação — C1 (leitura) + C2 (registro rápido de contato).
// Único lugar que fala com a rota GET listCentralRecuperacao e com a rota POST
// registrarContatoRecuperacao (a única escrita da Central). O backend autoriza,
// valida, controla versão e garante idempotência por requisicaoId: um reenvio
// nunca duplica o contato. Encerrar busca, quando sugerido, usa a rota que já
// existia (services/buscas.js) e só por ação humana.

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
export function mapContatoRecuperacao(raw) {
  return {
    id: texto(raw.id),
    dataHora: texto(raw.data_hora),
    usuarioId: texto(raw.usuario_id),
    usuarioNome: texto(raw.usuario_nome),
    canal: texto(raw.canal),
    resultado: texto(raw.resultado),
    proximoPasso: texto(raw.proximo_passo),
    dataProximoContato: texto(raw.data_proximo_contato),
    veiculos: (raw.veiculos ?? []).map((v) => ({ veiculoId: texto(v.veiculo_id), descricao: texto(v.descricao) })),
    observacao: texto(raw.observacao),
    registradoPorTerceiro: raw.registrado_por_terceiro === true,
  };
}
export function mapDemandaRecuperacao(raw) {
  const r = raw.resumo ?? {};
  const perm = raw.permissoes ?? {};
  return {
    busca: mapBusca(raw.busca ?? {}),
    veiculos: (raw.veiculos ?? []).map(mapVeiculoRecuperacao),
    contatos: (raw.contatos ?? []).map(mapContatoRecuperacao),
    permissoes: { registrarContato: perm.registrar_contato === true, encerrarBusca: perm.encerrar_busca === true },
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
      contatosTotal: Number(r.contatos_total || 0),
      ultimoContatoEm: texto(r.ultimo_contato_em),
      proximoContatoData: texto(r.proximo_contato_data),
      retornoVencido: r.retorno_vencido === true,
      sugerirEncerramento: r.sugerir_encerramento === true,
      alertaSemInteresse: r.alerta_sem_interesse === true,
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

// Registro rápido de contato. O chamador gera UM requisicaoId por formulário aberto e o
// reutiliza ao repetir um envio que falhou por rede (o backend devolve o mesmo contato).
export async function registrarContatoRecuperacao(dados, idToken) {
  const raw = await apiClient.request({
    action: "registrarContatoRecuperacao",
    body: { ...dados, requisicaoId: dados.requisicaoId ?? gerarRequisicaoId() },
    idToken: idToken ?? undefined,
  });
  return {
    contato: raw?.contato ? mapContatoRecuperacao(raw.contato) : null,
    reaproveitada: raw?.reaproveitada === true,
    timelineOk: raw?.timeline_ok !== false,
  };
}
