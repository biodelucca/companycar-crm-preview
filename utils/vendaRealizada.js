// Melhoria isolada "Data da venda" (2026-08-24) / Melhoria 9 Fase 2B
// (2026-10-08) -- vendido_em pode chegar em DOIS formatos (o backend aceita
// os dois, nada foi convertido em massa):
//   * "AAAA-MM-DD"  -- data comercial da venda (Fase 2B). Dia civil, sem hora
//                      e sem fuso: NUNCA passe por `new Date(valor)` (isso a
//                      interpretaria como meia-noite UTC e mostraria o dia
//                      anterior no Brasil).
//   * ISO UTC       -- registros antigos (new Date().toISOString() no momento
//                      da movimentacao); o dia vem convertido para
//                      America/Sao_Paulo.
import { diaSaoPaulo, formatarDia } from "./periodo.js";

const REGEX_DIA = /^\d{4}-\d{2}-\d{2}$/;

// Dia de hoje ("AAAA-MM-DD") em America/Sao_Paulo.
export function hojeSaoPaulo(agora = new Date()) {
    return diaSaoPaulo(agora.toISOString());
}

// Dia comercial ("AAAA-MM-DD") de um vendido_em em qualquer dos dois formatos ("" se vazio/invalido).
export function diaDaVenda(valor) {
    return diaSaoPaulo(valor);
}

// "DD/MM/AAAA" de um vendido_em em qualquer dos dois formatos; null se vazio/invalido.
export function formatarDataVenda(valor) {
    const dia = diaSaoPaulo(valor);
    return dia ? formatarDia(dia) : null;
}

// Mantido por compatibilidade: instante ISO -> "DD/MM/AAAA às HH:MM" em
// America/Sao_Paulo; data pura -> so "DD/MM/AAAA" (nao ha hora a mostrar).
export function formatarDataHoraVenda(valor) {
    if (!valor)
        return null;
    if (REGEX_DIA.test(String(valor).trim()))
        return formatarDia(String(valor).trim());
    const data = new Date(valor);
    if (Number.isNaN(data.getTime()))
        return null;
    const partes = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(data);
    const obter = (tipo) => partes.find((p) => p.type === tipo)?.value ?? "";
    return `${obter("day")}/${obter("month")}/${obter("year")} às ${obter("hour")}:${obter("minute")}`;
}

// Validacao do frontend (a do backend e a que vale): null se ok, senao a mensagem.
export function validarDataVenda(dia, hoje = hojeSaoPaulo()) {
    const s = String(dia ?? "").trim();
    if (!s)
        return "Informe a data da venda.";
    if (!REGEX_DIA.test(s))
        return "Data da venda inválida.";
    const [a, m, d] = s.split("-").map(Number);
    const teste = new Date(Date.UTC(a, m - 1, d));
    if (teste.getUTCFullYear() !== a || teste.getUTCMonth() !== m - 1 || teste.getUTCDate() !== d)
        return "Data da venda inválida.";
    if (s > hoje)
        return "A data da venda não pode ser futura.";
    return null;
}

// Aviso suave (nao bloqueia): a data cai em mes anterior ao de hoje, o que
// move a venda de um mes para outro no Dashboard/Relatorios.
export function dataVendaEmMesAnterior(dia, hoje = hojeSaoPaulo()) {
    return REGEX_DIA.test(String(dia ?? "")) && String(dia).slice(0, 7) < hoje.slice(0, 7);
}
