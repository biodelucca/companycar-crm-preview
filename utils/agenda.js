// Melhoria 5 "Agenda de Próximas Ações no Dashboard" (2026-10-07).
//
// Funções puras (sem React, sem rede) que montam a agenda operacional a
// partir das oportunidades que o Dashboard JÁ carrega (listOportunidades,
// já filtradas pelo backend conforme a visibilidade do usuário). Nenhuma
// leitura nova, nenhuma escrita: visualizar a agenda não altera dado algum.
//
// Modelo de dados (inalterado): a próxima ação vive nas colunas da própria
// oportunidade (proxima_acao_data "YYYY-MM-DDTHH:mm" em horário de
// America/Sao_Paulo — o backend normaliza, ver normalizarProximaAcaoData_ —,
// proxima_acao_tipo/outro_texto/proxima_acao, proxima_acao_responsavel_id).
// "Concluir" a ação limpa essas colunas (concluirProximaAcao_), portanto
// ação concluída simplesmente não existe mais nos dados e nunca entra aqui.

const FUSO = "America/Sao_Paulo";

// "Agora" no fuso America/Sao_Paulo, no mesmo formato textual de
// proxima_acao_data ("YYYY-MM-DDTHH:mm"). Independe do fuso do navegador.
export function agoraSaoPaulo(data = new Date()) {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: FUSO,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(data);
    const v = {};
    for (const p of partes)
        v[p.type] = p.value;
    return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
}

// Soma dias a uma data "YYYY-MM-DD" (aritmética em UTC ao meio-dia, sem
// influência de fuso/horário de verão do navegador).
export function somarDias(dataIso, dias) {
    const [a, m, d] = dataIso.slice(0, 10).split("-").map(Number);
    const base = new Date(Date.UTC(a, m - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + dias);
    return base.toISOString().slice(0, 10);
}

// Classifica uma ação em relação a "agora" (texto "YYYY-MM-DDTHH:mm" em
// America/Sao_Paulo):
//   atrasada  — data/hora já passou (ação de hoje com horário anterior ao
//               agora é atrasada; registro antigo só com data: dia anterior);
//   hoje      — hoje, horário ainda por vir (ou registro só com data = hoje);
//   proximos  — de amanhã até hoje + `dias` (inclusive);
//   alem      — depois disso (fora da agenda);
//   null      — sem data utilizável.
export function classificarAcao(dataAcao, agoraStr, dias = 7) {
    const d = String(dataAcao || "").trim().replace(" ", "T");
    if (!/^\d{4}-\d{2}-\d{2}/.test(d))
        return null;
    const hojeStr = agoraStr.slice(0, 10);
    const dia = d.slice(0, 10);
    if (d.length > 10 ? d.slice(0, 16) < agoraStr : dia < hojeStr)
        return "atrasada";
    if (dia === hojeStr)
        return "hoje";
    return dia <= somarDias(hojeStr, dias) ? "proximos" : "alem";
}

// Monta os três grupos da agenda.
//   oportunidades — lista já carregada (visibilidade aplicada pelo backend);
//   etapasPorId   — Map id -> etapa ({tipo}); só etapas "ativa" geram item
//                   (Perdido e Venda/Documentação ficam de fora; oportunidade
//                   excluída nem chega do backend e, por garantia, é
//                   descartada se `excluidoEm` vier preenchido);
//   filtroResponsavelId — "" = todos; senão, filtra pelo responsável DA AÇÃO
//                   (proximaAcaoResponsavelId, com fallback no responsável da
//                   oportunidade — mesma regra já usada no Dashboard).
export function montarAgenda(oportunidades, etapasPorId, { agoraStr, filtroResponsavelId = "", dias = 7 }) {
    const grupos = { atrasadas: [], hoje: [], proximos: [] };
    for (const o of oportunidades) {
        if (!o.proximaAcaoData)
            continue;
        if (o.excluidoEm)
            continue;
        if (etapasPorId.get(o.etapaId)?.tipo !== "ativa")
            continue;
        const respAcaoId = o.proximaAcaoResponsavelId || o.responsavelId;
        if (filtroResponsavelId && respAcaoId !== filtroResponsavelId)
            continue;
        const classe = classificarAcao(o.proximaAcaoData, agoraStr, dias);
        if (!classe || classe === "alem")
            continue;
        const chave = classe === "atrasada" ? "atrasadas" : classe;
        grupos[chave].push({ oportunidade: o, respAcaoId, dataAcao: String(o.proximaAcaoData).trim().replace(" ", "T") });
    }
    // Cronológico crescente em todos os grupos: atrasadas = mais antiga
    // primeiro; hoje = horário mais próximo primeiro; próximos = data/hora
    // crescente. Desempate estável pelo id para ordem determinística.
    const porData = (a, b) => a.dataAcao.localeCompare(b.dataAcao) || String(a.oportunidade.id).localeCompare(String(b.oportunidade.id));
    grupos.atrasadas.sort(porData);
    grupos.hoje.sort(porData);
    grupos.proximos.sort(porData);
    return grupos;
}

// "DD/MM" e "HH:mm" a partir do texto "YYYY-MM-DDTHH:mm" (sem Date, sem
// fuso — mesmo critério textual do restante do módulo).
export function dataCurta(dataAcao) {
    const m = String(dataAcao || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}` : "";
}
export function horaCurta(dataAcao) {
    const s = String(dataAcao || "");
    return s.length > 10 ? s.slice(11, 16) : "";
}
