// Funções puras da Melhoria 10 / Etapa 2B (Buscas de Veículos): rótulos,
// formatação, validação do formulário (espelha o backend v35 só para dar
// resposta rápida: quem decide é sempre o backend), filtros da listagem e
// tradução de erros. Sem React e sem rede, para poder ser testado isolado.

export const DIAS_ALERTA_VENCIMENTO = 7;
export const MAX_MODELOS = 5; // 1 principal + 4 alternativos (limite do backend)
export const MAX_OBSERVACOES = 500;
export const MAX_OBS_ENCERRAMENTO = 300;

// Motivos de perda que significam "não tínhamos o veículo" (ids reais da
// aba MotivosPerda: 12 e 13). Após mover para Perdido com um deles, o CRM
// sugere registrar a busca. A ação continua disponível em qualquer Perdido.
export const MOTIVOS_PERDA_INDISPONIBILIDADE = ["12", "13"];

export const SITUACOES = [
  { valor: "ativa", rotulo: "Ativa" },
  { valor: "expirada", rotulo: "Vencida" },
  { valor: "encerrada", rotulo: "Encerrada" },
  { valor: "recuperada", rotulo: "Recuperada" },
];
export const FILTROS_SITUACAO = [
  { valor: "", rotulo: "Todas as situações" },
  { valor: "ativa", rotulo: "Ativas" },
  { valor: "expirada", rotulo: "Vencidas" },
  { valor: "encerrada", rotulo: "Encerradas" },
  { valor: "recuperada", rotulo: "Recuperadas" },
  { valor: "reativada", rotulo: "Reativadas" },
];
export const MOTIVOS_ENCERRAMENTO = [
  { valor: "cliente_sem_interesse", rotulo: "Cliente sem interesse" },
  { valor: "comprou_outro", rotulo: "Cliente comprou outro veículo" },
  { valor: "veiculo_nao_interessa_mais", rotulo: "Veículo não interessa mais" },
  { valor: "cadastro_duplicado", rotulo: "Cadastro duplicado" },
  { valor: "outro", rotulo: "Outro" },
];
export const CAMBIOS = [
  { valor: "", rotulo: "Indiferente" },
  { valor: "automatico", rotulo: "Automático" },
  { valor: "manual", rotulo: "Manual" },
];

export function rotuloSituacao(situacao) {
  return SITUACOES.find((s) => s.valor === situacao)?.rotulo ?? String(situacao ?? "—");
}
export function rotuloMotivoEncerramento(valor) {
  return MOTIVOS_ENCERRAMENTO.find((m) => m.valor === valor)?.rotulo ?? (valor || "—");
}
export function rotuloCambio(valor) {
  return CAMBIOS.find((c) => c.valor === valor)?.rotulo ?? "Indiferente";
}

export function normalizarTexto(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function nomeModelo(m) {
  if (!m) return "";
  return [m.marca, m.modelo].filter(Boolean).join(" ").trim();
}
export function modelosDaBusca(busca) {
  const lista = [];
  if (busca.modelo) lista.push(busca.modelo);
  for (const m of busca.alternativos ?? []) lista.push(m);
  return lista;
}
export function resumoModelos(busca) {
  const nomes = modelosDaBusca(busca).map((m) => nomeModelo(m) || "Modelo removido do catálogo");
  return nomes.join(" · ") || "—";
}

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function formatarMoeda(n) {
  return n === "" || n === null || n === undefined ? "—" : formatoMoeda.format(Number(n));
}
export function formatarDia(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}
export function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function criteriosDaBusca(busca) {
  const partes = [];
  if (busca.anoMin !== "" || busca.anoMax !== "") {
    if (busca.anoMin !== "" && busca.anoMax !== "") partes.push(`Ano ${busca.anoMin} a ${busca.anoMax}`);
    else if (busca.anoMin !== "") partes.push(`Ano a partir de ${busca.anoMin}`);
    else partes.push(`Ano até ${busca.anoMax}`);
  }
  if (busca.precoMax !== "") partes.push(`Até ${formatarMoeda(busca.precoMax)}`);
  if (busca.kmMax !== "") partes.push(`Até ${Number(busca.kmMax).toLocaleString("pt-BR")} km`);
  if (busca.cambio) partes.push(`Câmbio ${rotuloCambio(busca.cambio).toLowerCase()}`);
  return partes;
}

export function textoValidade(busca) {
  if (busca.situacao === "ativa") {
    const d = busca.diasRestantes;
    const resto = d === 0 ? "vence hoje" : d === 1 ? "falta 1 dia" : `faltam ${d} dias`;
    return `Válida até ${formatarDia(busca.validoAte)} (${resto})`;
  }
  if (busca.situacao === "expirada") return `Venceu em ${formatarDia(busca.validoAte)}`;
  if (busca.situacao === "encerrada") return `Encerrada em ${formatarDataHora(busca.encerradaEm)}`;
  return `Válida até ${formatarDia(busca.validoAte)}`;
}
export function vencendoEmBreve(busca) {
  return busca.situacao === "ativa" && busca.diasRestantes !== null && busca.diasRestantes <= DIAS_ALERTA_VENCIMENTO;
}

// ---------------------------------------------------------------------------
// Permissões (apenas para decidir o que MOSTRAR; o backend é quem autoriza)
// ---------------------------------------------------------------------------
export function ehGerencia(usuario) {
  return !!usuario && (usuario.papel === "Gerente (Owner)" || usuario.papel === "Administrador");
}
export function temVisaoGlobal(usuario) {
  return !!usuario && (ehGerencia(usuario) || usuario.visualizaTodasOportunidades === true);
}
// Editar/renovar/reativar/encerrar: Gerência, responsável pela busca ou
// visão global operacional (mesma matriz da v35, classe "operacional").
export function podeOperarBusca(usuario, busca) {
  if (!usuario || !busca || busca.oportunidadeExcluida) return false;
  if (temVisaoGlobal(usuario)) return true;
  return busca.responsavelId !== "" && String(busca.responsavelId) === String(usuario.id);
}
// Transferir busca (mesma matriz da v35, classe "transferencia"): Gerência
// sempre; responsável atual; visão global somente quando o responsável atual
// está inativo ou não existe mais. O backend é quem decide de verdade.
export function podeTransferirBusca(usuario, busca, usuarios) {
  if (!usuario || !busca || busca.oportunidadeExcluida) return false;
  if (ehGerencia(usuario)) return true;
  if (busca.responsavelId !== "" && String(busca.responsavelId) === String(usuario.id)) return true;
  if (temVisaoGlobal(usuario)) {
    const dono = (usuarios ?? []).find((u) => String(u.id) === String(busca.responsavelId));
    return !dono || dono.ativo === false;
  }
  return false;
}
// Destinos possíveis: usuários ativos, exceto o responsável atual.
export function destinosDeTransferencia(usuarios, busca) {
  return (usuarios ?? [])
    .filter((u) => u.ativo !== false && String(u.id) !== String(busca?.responsavelId))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

export function podeRegistrarBusca(usuario, oportunidade) {
  if (!usuario || !oportunidade) return false;
  if (temVisaoGlobal(usuario)) return true;
  return !!oportunidade.responsavelId && String(oportunidade.responsavelId) === String(usuario.id);
}

// ---------------------------------------------------------------------------
// Identificador de requisição (idempotência no backend: 8–64 chars [A-Za-z0-9_-])
// ---------------------------------------------------------------------------
export function gerarRequisicaoId() {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = "bv-";
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return s;
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------
export function formularioVazio() {
  return { modelos: [], anoMin: "", anoMax: "", precoMax: "", kmMax: "", cambio: "", observacoes: "", interesse: false };
}
export function formularioDaBusca(busca) {
  return {
    modelos: modelosDaBusca(busca).filter((m) => m && m.id),
    anoMin: busca.anoMin === "" ? "" : String(busca.anoMin),
    anoMax: busca.anoMax === "" ? "" : String(busca.anoMax),
    precoMax: busca.precoMax === "" ? "" : String(busca.precoMax),
    kmMax: busca.kmMax === "" ? "" : String(busca.kmMax),
    cambio: busca.cambio || "",
    observacoes: busca.observacoes || "",
    interesse: false,
  };
}

// Converte o texto digitado em número (aceita 50.000, 50000, 50.000,50).
// Retorna "" (vazio), um número, ou NaN (inválido).
export function lerNumero(texto, inteiro) {
  const t = String(texto ?? "").trim();
  if (t === "") return "";
  let n;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
  else if (/^\d+(,\d+)?$/.test(t)) n = Number(t.replace(",", "."));
  else if (/^\d+(\.\d+)?$/.test(t)) n = Number(t);
  else return NaN;
  if (!Number.isFinite(n)) return NaN;
  if (inteiro && Math.floor(n) !== n) return NaN;
  return n;
}

// Retorna { erros: {campo: texto}, valores } — erros vazio = pode enviar.
export function validarFormulario(form, anoAtual, { exigirInteresse }) {
  const erros = {};
  if (!form.modelos.length) erros.modelos = "Escolha ao menos um modelo.";
  const anoMax = anoAtual + 1;
  const anoMin = lerNumero(form.anoMin, true);
  const anoFim = lerNumero(form.anoMax, true);
  if (Number.isNaN(anoMin) || (anoMin !== "" && (anoMin < 1950 || anoMin > anoMax))) erros.anoMin = `Ano mínimo inválido (1950 a ${anoMax}).`;
  if (Number.isNaN(anoFim) || (anoFim !== "" && (anoFim < 1950 || anoFim > anoMax))) erros.anoMax = `Ano máximo inválido (1950 a ${anoMax}).`;
  if (!erros.anoMin && !erros.anoMax && anoMin !== "" && anoFim !== "" && anoMin > anoFim) erros.anoMin = "O ano mínimo não pode ser maior que o máximo.";
  const preco = lerNumero(form.precoMax, false);
  if (Number.isNaN(preco) || (preco !== "" && (preco < 0.01 || preco > 10000000))) erros.precoMax = "Preço máximo inválido.";
  const km = lerNumero(form.kmMax, true);
  if (Number.isNaN(km) || (km !== "" && (km < 0 || km > 1000000))) erros.kmMax = "Quilometragem máxima inválida.";
  if (String(form.observacoes ?? "").trim().length > MAX_OBSERVACOES) erros.observacoes = `Máximo de ${MAX_OBSERVACOES} caracteres.`;
  if (exigirInteresse && form.interesse !== true) erros.interesse = "Confirme que o cliente deseja ser avisado quando surgir um veículo compatível.";
  return { erros, valores: { anoMin, anoMax: anoFim, precoMax: preco, kmMax: km } };
}

export function payloadPreferencias(form, valores) {
  return {
    modeloId: form.modelos[0]?.id,
    modelosAlternativosIds: form.modelos.slice(1).map((m) => m.id),
    anoMin: valores.anoMin,
    anoMax: valores.anoMax,
    precoMax: valores.precoMax,
    kmMax: valores.kmMax,
    cambio: form.cambio,
    observacoes: String(form.observacoes ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Listagem: busca por texto, situação e responsável
// ---------------------------------------------------------------------------
const ORDEM_SITUACAO = { ativa: 0, expirada: 1, encerrada: 2, recuperada: 3 };

export function filtrarBuscas(buscas, { termo = "", situacao = "", responsavelId = "" }, clientesPorId) {
  const t = normalizarTexto(termo);
  const lista = buscas.filter((b) => {
    if (responsavelId && String(b.responsavelId) !== String(responsavelId)) return false;
    if (situacao === "reativada") { if (!(b.reativacoes > 0)) return false; }
    else if (situacao && b.situacao !== situacao) return false;
    if (!t) return true;
    const cliente = clientesPorId?.get(String(b.clienteId));
    const modelos = modelosDaBusca(b).map((m) => `${m.marca ?? ""} ${m.modelo ?? ""} ${(m.apelidos ?? []).join(" ")}`).join(" ");
    const campos = [b.codigo, cliente?.nome, modelos, b.observacoes];
    return campos.some((c) => c && normalizarTexto(c).includes(t));
  });
  return lista.slice().sort((a, b) => {
    const oa = ORDEM_SITUACAO[a.situacao] ?? 9;
    const ob = ORDEM_SITUACAO[b.situacao] ?? 9;
    if (oa !== ob) return oa - ob;
    if (a.situacao === "ativa") return String(a.validoAte).localeCompare(String(b.validoAte));
    return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm));
  });
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------
// tipo: "sessao" (refazer login) | "versao" (recarregar a busca) |
//       "rede" (falha de comunicação; repetir é seguro: mesma requisição) |
//       "negocio" (mensagem do backend, mostrada como veio).
export function interpretarErro(erro) {
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  if (msg === "SESSAO_EXPIRADA") {
    return { tipo: "sessao", texto: "Sua sessão expirou. Entre novamente para continuar." };
  }
  if (msg.startsWith("BUSCA_DESATUALIZADA")) {
    return { tipo: "versao", texto: "Esta busca foi alterada por outra pessoa. Recarregue os dados e tente novamente." };
  }
  if (/Apps Script respondeu HTTP|Resposta inesperada|Falha ao comunicar|Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return { tipo: "rede", texto: "Falha de comunicação com o servidor. Verifique a conexão e tente novamente; repetir é seguro, o pedido não será duplicado." };
  }
  return { tipo: "negocio", texto: msg || "Não foi possível concluir a operação." };
}
