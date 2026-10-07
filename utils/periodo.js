// Melhoria 6 "Filtro de período no Dashboard" (2026-10-07).
//
// Funções puras (sem React, sem rede) do filtro de período ANALÍTICO do
// Dashboard. Todas as comparações são por DIA CIVIL em America/Sao_Paulo
// ("YYYY-MM-DD"), nunca pelo fuso do navegador — as datas estruturadas das
// oportunidades (criado_em, perdido_em, vendido_em) são instantes ISO em UTC,
// convertidos aqui para o dia de São Paulo antes de comparar.
//
// Qual data responde a qual pergunta (decisão de negócio, 2026-10-07):
//   leads recebidos / coorte (por etapa, responsável, origem, conversão)
//                                   -> criado_em
//   vendas no período               -> vendido_em (só ela; sem fallback)
//   perdas no período               -> perdido_em (oportunidades hoje em Perdido)
//   em aberto, ações vencidas/de hoje, Agenda -> operacionais: NÃO usam período.
import { somarDias } from "./agenda.js";

const FUSO = "America/Sao_Paulo";

// Primeiro dia em que o CRM registra vendido_em de forma estruturada
// (Melhoria "Data da venda", 24/08/2026). Vendas anteriores não têm a data.
export const INICIO_REGISTRO_VENDIDO_EM = "2026-08-24";

export const OPCOES_PERIODO = [
    { valor: "todos", rotulo: "Todo o período" },
    { valor: "hoje", rotulo: "Hoje" },
    { valor: "7d", rotulo: "Últimos 7 dias" },
    { valor: "mes", rotulo: "Mês atual" },
    { valor: "mesAnterior", rotulo: "Mês anterior" },
    { valor: "personalizado", rotulo: "Período personalizado" },
];

// Dia civil ("YYYY-MM-DD") de São Paulo para um instante ISO (ou para um
// valor que já seja só data). "" se vazio/inválido.
export function diaSaoPaulo(valor) {
    const s = String(valor ?? "").trim();
    if (!s)
        return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))
        return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime()))
        return "";
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: FUSO,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);
    const v = {};
    for (const p of partes)
        v[p.type] = p.value;
    return `${v.year}-${v.month}-${v.day}`;
}

function primeiroDiaDoMes(dia) {
    return `${dia.slice(0, 8)}01`;
}
function ultimoDiaDoMes(dia) {
    const a = Number(dia.slice(0, 4));
    const m = Number(dia.slice(5, 7));
    const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    return somarDias(proximo, -1);
}

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

// Resolve o período escolhido em { tipo, inicio, fim } (dias "YYYY-MM-DD",
// ambos inclusivos; null/null para "todos") ou { erro } quando o período
// personalizado é inválido/incompleto. `hoje` = dia atual em São Paulo.
export function resolverPeriodo(periodo, hoje, inicioPersonalizado = "", fimPersonalizado = "") {
    switch (periodo) {
        case "hoje":
            return { tipo: periodo, inicio: hoje, fim: hoje };
        case "7d":
            return { tipo: periodo, inicio: somarDias(hoje, -6), fim: hoje };
        case "mes":
            return { tipo: periodo, inicio: primeiroDiaDoMes(hoje), fim: ultimoDiaDoMes(hoje) };
        case "mesAnterior": {
            const fim = somarDias(primeiroDiaDoMes(hoje), -1);
            return { tipo: periodo, inicio: primeiroDiaDoMes(fim), fim };
        }
        case "personalizado": {
            if (!inicioPersonalizado || !DIA_VALIDO.test(inicioPersonalizado))
                return { tipo: periodo, erro: "Informe a data inicial." };
            if (!fimPersonalizado || !DIA_VALIDO.test(fimPersonalizado))
                return { tipo: periodo, erro: "Informe a data final." };
            if (inicioPersonalizado > fimPersonalizado)
                return { tipo: periodo, erro: "A data inicial não pode ser posterior à data final." };
            return { tipo: periodo, inicio: inicioPersonalizado, fim: fimPersonalizado };
        }
        default:
            return { tipo: "todos", inicio: null, fim: null };
    }
}

// O instante `valor` (ISO UTC) cai dentro do período, no dia civil de São
// Paulo? "todos" aceita tudo (inclusive registro sem a data); com período
// definido, registro sem data/inválido fica de fora.
export function dentroDoPeriodo(valor, periodo) {
    if (!periodo || periodo.erro)
        return false;
    if (periodo.inicio === null)
        return true;
    const dia = diaSaoPaulo(valor);
    if (!dia)
        return false;
    return dia >= periodo.inicio && dia <= periodo.fim;
}

// O período analisado alcança datas anteriores a 24/08/2026 (quando o
// CRM ainda não registrava vendido_em)? Vale também para "todos".
export function periodoAlcancaVendasSemData(periodo) {
    if (!periodo || periodo.erro)
        return false;
    if (periodo.inicio === null)
        return true;
    return periodo.inicio < INICIO_REGISTRO_VENDIDO_EM;
}

// "YYYY-MM-DD" -> "DD/MM/YYYY"
export function formatarDia(dia) {
    const m = String(dia || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function descreverPeriodo(periodo) {
    if (!periodo || periodo.erro)
        return "";
    if (periodo.inicio === null)
        return "todo o histórico";
    return periodo.inicio === periodo.fim
        ? formatarDia(periodo.inicio)
        : `${formatarDia(periodo.inicio)} a ${formatarDia(periodo.fim)}`;
}
