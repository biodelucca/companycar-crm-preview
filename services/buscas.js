import { apiClient } from "./apiClient.js";
import { gerarRequisicaoId } from "../utils/buscas.js";

// Melhoria 10 / Etapa 2B — camada de Services das Buscas de Veículos.
// Único lugar que fala com as rotas da v35 (BuscasVeiculos.gs). Traduz o
// contrato do backend (snake_case) para o domínio do frontend (camelCase),
// mesma regra das outras entidades. Nenhuma regra de negócio ou permissão
// é decidida aqui: o backend autoriza, valida, controla versão e garante
// idempotência por requisicaoId (um reenvio nunca duplica a escrita).

function texto(v) {
  return v === null || v === undefined ? "" : String(v);
}
function numeroOuVazio(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isNaN(n) ? "" : n;
}
function mapModelo(m) {
  if (!m) return null;
  return {
    id: texto(m.id),
    tipo: m.tipo ?? "",
    marca: m.marca ?? "",
    modelo: m.modelo ?? "",
    apelidos: Array.isArray(m.apelidos) ? m.apelidos : [],
    status: m.status ?? "",
  };
}
export function mapBusca(raw) {
  return {
    id: texto(raw.id),
    codigo: texto(raw.codigo),
    clienteId: texto(raw.cliente_id),
    oportunidadeId: texto(raw.oportunidade_origem_id),
    responsavelId: texto(raw.responsavel_id),
    modelo: mapModelo(raw.modelo),
    alternativos: (raw.modelos_alternativos ?? []).map((m) => mapModelo(m) ?? { id: "", modelo: null }),
    anoMin: numeroOuVazio(raw.ano_min),
    anoMax: numeroOuVazio(raw.ano_max),
    precoMax: numeroOuVazio(raw.preco_max),
    kmMax: numeroOuVazio(raw.km_max),
    cambio: texto(raw.cambio),
    observacoes: texto(raw.observacoes),
    interesseConfirmado: raw.interesse_confirmado === true || String(raw.interesse_confirmado).toUpperCase() === "TRUE",
    criadoEm: texto(raw.criado_em),
    criadoPor: texto(raw.criado_por),
    validoAte: texto(raw.valido_ate),
    status: texto(raw.status),
    situacao: texto(raw.status_efetivo),
    diasRestantes: raw.dias_restantes === null || raw.dias_restantes === undefined ? null : Number(raw.dias_restantes),
    renovacoes: Number(raw.renovacoes || 0),
    renovadaEm: texto(raw.renovada_em),
    reativacoes: Number(raw.reativacoes || 0),
    reativadaEm: texto(raw.reativada_em),
    encerradaEm: texto(raw.encerrada_em),
    encerradaPor: texto(raw.encerrada_por),
    motivoEncerramento: texto(raw.motivo_encerramento),
    observacaoEncerramento: texto(raw.observacao_encerramento),
    atualizadoEm: texto(raw.atualizado_em),
    versao: Number(raw.versao || 1),
    aguardandoValidacao: raw.modelo_aguardando_validacao === true,
    oportunidadeExcluida: raw.oportunidade_excluida === true,
  };
}
function mapEvento(raw) {
  return {
    id: texto(raw.id),
    tipo: texto(raw.tipo_evento),
    descricao: texto(raw.descricao),
    usuarioId: texto(raw.usuario_id),
    dataHora: texto(raw.data_hora),
    versaoBusca: Number(raw.versao_busca || 0),
  };
}

// --- Leituras ----------------------------------------------------------
export async function listBuscasVeiculos(idToken, filtros = {}) {
  const params = {};
  if (filtros.oportunidadeId) params.oportunidadeId = String(filtros.oportunidadeId);
  if (filtros.status) params.status = filtros.status;
  const raw = await apiClient.request({ action: "listBuscasVeiculos", params, idToken: idToken ?? undefined });
  return (raw ?? []).map(mapBusca);
}
export async function listHistoricoBuscaVeiculo(buscaId, idToken) {
  const raw = await apiClient.request({ action: "listHistoricoBuscaVeiculo", params: { buscaId }, idToken: idToken ?? undefined });
  return (raw ?? []).map(mapEvento);
}

// Catálogo: muda pouco; guardado em memória por alguns minutos para não
// pagar a latência do Apps Script a cada abertura de formulário.
let cacheCatalogo = null;
const VALIDADE_CATALOGO_MS = 5 * 60 * 1000;
export function limparCacheCatalogo() {
  cacheCatalogo = null;
}
export async function listCatalogoModelos(idToken, { forcar = false } = {}) {
  if (!forcar && cacheCatalogo && Date.now() - cacheCatalogo.em < VALIDADE_CATALOGO_MS) return cacheCatalogo.itens;
  const raw = await apiClient.request({ action: "listCatalogoModelos", idToken: idToken ?? undefined });
  const itens = (raw ?? []).map(mapModelo);
  cacheCatalogo = { em: Date.now(), itens };
  return itens;
}

// --- Escritas (todas levam requisicaoId; o chamador reutiliza o mesmo id
// ao repetir um envio que falhou por rede) --------------------------------
function resultadoBusca(r) {
  return {
    busca: r?.busca ? mapBusca(r.busca) : null,
    reaproveitada: r?.reaproveitada === true,
    alterado: r?.alterado !== false,
    aviso: r?.aviso ?? null,
  };
}

export async function cadastrarBuscaVeiculo(dados, idToken) {
  const r = await apiClient.request({
    action: "cadastrarBuscaVeiculo",
    body: { ...dados, requisicaoId: dados.requisicaoId ?? gerarRequisicaoId() },
    idToken: idToken ?? undefined,
  });
  if (r?.duplicidade) {
    return {
      duplicidade: {
        tipo: r.duplicidade.tipo,
        total: r.duplicidade.total ?? (r.duplicidade.busca ? 1 : 0),
        buscas: r.duplicidade.busca ? [mapBusca(r.duplicidade.busca)] : (r.duplicidade.buscas ?? []).map(mapBusca),
      },
    };
  }
  return resultadoBusca(r);
}
async function operar(action, dados, idToken) {
  const r = await apiClient.request({
    action,
    body: { ...dados, requisicaoId: dados.requisicaoId ?? gerarRequisicaoId() },
    idToken: idToken ?? undefined,
  });
  return resultadoBusca(r);
}
export const editarBuscaVeiculo = (dados, idToken) => operar("editarBuscaVeiculo", dados, idToken);
export const renovarBuscaVeiculo = (dados, idToken) => operar("renovarBuscaVeiculo", dados, idToken);
export const reativarBuscaVeiculo = (dados, idToken) => operar("reativarBuscaVeiculo", dados, idToken);
export const encerrarBuscaVeiculo = (dados, idToken) => operar("encerrarBuscaVeiculo", dados, idToken);
export const transferirBuscaVeiculo = (dados, idToken) => operar("transferirBuscaVeiculo", dados, idToken);

// Pedido de inclusão de modelo novo: nasce "solicitado" (utilizável na
// busca; a Gerência valida depois). Devolve { existente, modelo }.
export async function solicitarModeloCatalogo(dados, idToken) {
  const r = await apiClient.request({
    action: "solicitarModeloCatalogo",
    body: { ...dados, requisicaoId: dados.requisicaoId ?? gerarRequisicaoId() },
    idToken: idToken ?? undefined,
  });
  limparCacheCatalogo();
  return { existente: r?.existente === true, modelo: mapModelo(r?.modelo) };
}
