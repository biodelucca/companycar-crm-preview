import { modelosDaBusca, nomeModelo, normalizarTexto } from "./buscas.js";

// Melhoria 10 / Central de Recuperação — Etapa C1 (leitura) + C2 (registro rápido de contato).
// Funções puras de apoio da tela: filtros, rótulos, textos e validação do formulário de contato.

export const FILTROS_STATUS_RECUPERACAO = [
  { valor: "", rotulo: "Todas as demandas" },
  { valor: "sem_acompanhamento", rotulo: "Sem acompanhamento (24 h ou mais)" },
  { valor: "novas", rotulo: "Com novas correspondências" },
  { valor: "disponiveis", rotulo: "Com veículo disponível" },
  { valor: "sem_disponivel", rotulo: "Sem veículo disponível agora" },
  { valor: "retorno_vencido", rotulo: "Retorno vencido" },
  { valor: "sem_interesse", rotulo: "Sem interesse — decidir encerramento" },
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
    if (status === "retorno_vencido" && !d.resumo.retornoVencido) return false;
    if (status === "sem_interesse" && !d.resumo.alertaSemInteresse) return false;
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
    retornosVencidos: demandas.filter((d) => d.resumo.retornoVencido).length,
    semInteresse: demandas.filter((d) => d.resumo.alertaSemInteresse).length,
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

// ---------------------------------------------------------------------------
// C2 — registro rápido de contato (as listas e regras espelham o backend só para
// dar resposta rápida; quem valida e autoriza de verdade é sempre o servidor).
// ---------------------------------------------------------------------------
export const CANAIS_CONTATO = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "outro", rotulo: "Outro" },
];
export const RESULTADOS_CONTATO = [
  { valor: "cliente_interessado", rotulo: "Cliente interessado" },
  { valor: "sem_interesse", rotulo: "Sem interesse" },
  { valor: "nao_respondeu", rotulo: "Não respondeu" },
  { valor: "retornar_depois", rotulo: "Retornar depois" },
  { valor: "contato_sem_decisao", rotulo: "Contato realizado — sem decisão" },
];
export const PASSOS_CONTATO = [
  { valor: "contatar_novamente", rotulo: "Entrar em contato novamente" },
  { valor: "enviar_opcoes", rotulo: "Enviar opções" },
  { valor: "agendar_visita", rotulo: "Agendar visita" },
  { valor: "aguardar_retorno", rotulo: "Aguardar retorno" },
  { valor: "encerrar_acompanhamento", rotulo: "Encerrar acompanhamento" },
];
// Sugestão inicial do próximo passo conforme o resultado (a pessoa pode trocar).
export const PASSO_SUGERIDO = {
  cliente_interessado: "agendar_visita",
  sem_interesse: "encerrar_acompanhamento",
  nao_respondeu: "contatar_novamente",
  retornar_depois: "contatar_novamente",
  contato_sem_decisao: "aguardar_retorno",
};
export const MAX_OBS_CONTATO = 300;
export const MAX_DIAS_PROXIMO_CONTATO = 180;
export const MAX_VEICULOS_CONTATO = 10;

const rotuloDe = (lista, valor) => lista.find((i) => i.valor === valor)?.rotulo ?? (valor || "—");
export const rotuloCanal = (v) => rotuloDe(CANAIS_CONTATO, v);
export const rotuloResultado = (v) => rotuloDe(RESULTADOS_CONTATO, v);
export const rotuloPasso = (v) => rotuloDe(PASSOS_CONTATO, v);

export const passoExigeData = (passo) => passo === "contatar_novamente" || passo === "agendar_visita";
export const passoProibeData = (passo) => passo === "encerrar_acompanhamento";

// Dia (AAAA-MM-DD) no fuso de Brasília a partir de um instante ISO (use o relógio do SERVIDOR: gerado_em).
export function diaSP(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p;
}
export function somarDiasDia(dia, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? ""));
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diaValido(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? ""));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function formularioContatoVazio() {
  return { canal: "whatsapp", resultado: "", proximoPasso: "", passoEscolhido: false, data: "", veiculosIds: [], observacao: "" };
}
// Ao escolher o resultado, sugere o próximo passo (se a pessoa ainda não escolheu um) e a data padrão.
export function escolherResultado(form, resultado, hoje) {
  const novo = { ...form, resultado };
  if (!form.passoEscolhido) return aplicarPasso(novo, PASSO_SUGERIDO[resultado] ?? "", hoje);
  return novo;
}
export function escolherPasso(form, passo, hoje) {
  return aplicarPasso({ ...form, passoEscolhido: true }, passo, hoje);
}
function aplicarPasso(form, passo, hoje) {
  const novo = { ...form, proximoPasso: passo };
  if (passoProibeData(passo)) novo.data = "";
  else if (passo === "contatar_novamente" && !novo.data && hoje) novo.data = somarDiasDia(hoje, 1);
  return novo;
}
export function alternarVeiculo(form, veiculoId) {
  const ids = form.veiculosIds.includes(veiculoId) ? form.veiculosIds.filter((i) => i !== veiculoId) : [...form.veiculosIds, veiculoId];
  return { ...form, veiculosIds: ids };
}

// Retorna { campo: mensagem } — vazio = pode enviar.
export function validarContato(form, hoje) {
  const erros = {};
  if (!CANAIS_CONTATO.some((c) => c.valor === form.canal)) erros.canal = "Escolha o canal do contato.";
  if (!RESULTADOS_CONTATO.some((r) => r.valor === form.resultado)) erros.resultado = "Escolha o resultado do contato.";
  if (!PASSOS_CONTATO.some((p) => p.valor === form.proximoPasso)) erros.proximoPasso = "Escolha o próximo passo.";
  const data = String(form.data ?? "").trim();
  if (!erros.proximoPasso) {
    if (passoProibeData(form.proximoPasso)) {
      if (data) erros.data = "Não informe data quando o próximo passo é encerrar o acompanhamento.";
    } else if (!data) {
      if (passoExigeData(form.proximoPasso)) erros.data = "Informe a data do próximo contato.";
    } else if (!diaValido(data)) erros.data = "Data inválida.";
    else if (hoje && data < hoje) erros.data = "A data não pode ser anterior a hoje.";
    else if (hoje && data > somarDiasDia(hoje, MAX_DIAS_PROXIMO_CONTATO)) erros.data = `Use uma data dentro dos próximos ${MAX_DIAS_PROXIMO_CONTATO} dias.`;
  }
  if (form.veiculosIds.length > MAX_VEICULOS_CONTATO) erros.veiculos = `Escolha no máximo ${MAX_VEICULOS_CONTATO} veículos.`;
  if (String(form.observacao ?? "").trim().length > MAX_OBS_CONTATO) erros.observacao = `Máximo de ${MAX_OBS_CONTATO} caracteres.`;
  return erros;
}
export function payloadContato(form, busca) {
  return {
    buscaId: busca.id,
    versaoEsperada: busca.versao,
    canal: form.canal,
    resultado: form.resultado,
    proximoPasso: form.proximoPasso,
    dataProximoContato: passoProibeData(form.proximoPasso) ? "" : String(form.data ?? "").trim(),
    veiculosIds: form.veiculosIds,
    observacao: String(form.observacao ?? "").trim(),
  };
}

function dataBR(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
export function textoProximoPasso(c) {
  const d = dataBR(c.dataProximoContato);
  return `${rotuloPasso(c.proximoPasso)}${d ? ` em ${d}` : ""}`;
}
// Linha curta: "WhatsApp · Cliente interessado → Agendar visita em 20/11/2026"
export function textoContato(c) {
  return `${rotuloCanal(c.canal)} · ${rotuloResultado(c.resultado)} → ${textoProximoPasso(c)}`;
}
export const AVISO_SEM_INTERESSE = "“Sem interesse” não encerra a busca: ela continua ativa até uma pessoa autorizada encerrar.";
export const AVISO_CLIENTE_INTERESSADO = "“Cliente interessado” não cria nem reabre oportunidade. Isso continua sendo feito por uma pessoa, no Pipeline.";
