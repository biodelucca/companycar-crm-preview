// Melhoria isolada "Data da venda" (2026-08-24) -- formata o valor ISO
// UTC gravado em vendido_em (mesma origem que perdido_em/Timeline:
// new Date().toISOString() no backend) como "DD/MM/AAAA às HH:MM" no fuso
// America/Sao_Paulo. Diferente de formatarDataHoraVisita (aquele valor
// já vem literal em horário de Brasília, vindo de um <input
// type="datetime-local">, e só precisa de recorte de string); vendido_em
// vem em UTC de verdade e exige conversão explícita de fuso via
// Intl.DateTimeFormat, não apenas recorte.
export function formatarDataHoraVenda(valor) {
    if (!valor)
        return null;
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
