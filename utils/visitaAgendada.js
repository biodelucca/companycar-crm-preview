// Melhoria isolada "Visita Agendada com data e hora" (2026-08-24) — espelha
// formatarDataHoraVisita_ (Utils.gs) no frontend: formata o valor
// "YYYY-MM-DDTHH:mm" (ou a variante com segundos que o Sheets às vezes grava)
// como "DD/MM/AAAA às HH:MM". Mesma decisão de duas fontes de verdade
// sincronizadas à mão já usada por formatarDataHoraCurta em
// utils/proximaAcao.js — ver nota lá.
export function formatarDataHoraVisita(valor) {
    const s = String(valor || "");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m)
        return s;
    return `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}`;
}
