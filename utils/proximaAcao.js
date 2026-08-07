// Sprint 7 "Próximas Ações" (2026-08-07) — lista fixa de tipos de próxima
// ação, pedida literalmente pelo CEO ("Tipo da ação (lista)"). Vive tanto
// aqui (dropdown do SidePanel) quanto em Oportunidades.gs (validação no
// backend, ver TIPOS_PROXIMA_ACAO) — os dois lados precisam ser mantidos em
// sincronia manualmente se um novo tipo for adicionado no futuro. Decisão
// consciente de não buscar essa lista de uma aba da planilha (como
// MotivosPerda/Origens): o pedido já veio com a lista pronta, sem sinal de
// que precisa ser administrável, e a Sprint pede explicitamente para não
// criar estrutura nova além do necessário.
export const TIPOS_PROXIMA_ACAO = [
    "Fazer simulação",
    "Solicitar documentos",
    "Solicitar fotos da troca",
    "Enviar vídeo do veículo",
    "Confirmar visita",
    "Retornar ligação",
    "Fazer follow-up",
    "Aguardando cliente",
    "Outro",
];
// Resolve o texto de exibição da próxima ação: tipo estruturado (ou o
// texto livre quando o tipo for "Outro") quando presente; cai para o campo
// legado de texto livre (oportunidades criadas antes desta Sprint, ou via
// modal "Nova Negociação", que continua gravando só o campo legado) quando
// não há tipo estruturado ainda.
export function descricaoProximaAcao(o) {
    if (o.proximaAcaoTipo) {
        return o.proximaAcaoTipo === "Outro" ? o.proximaAcaoOutroTexto || "Outro" : o.proximaAcaoTipo;
    }
    return o.proximaAcao || "";
}
// Espelha formatarDataHoraCurta_ (Utils.gs) no frontend: formata o valor
// "YYYY-MM-DDTHH:mm" do <input type="datetime-local"> como "DD/MM HH:mm".
// Usado só para o evento otimista que Pipeline.tsx insere na Timeline local
// assim que a próxima ação é criada, antes de qualquer reload da página —
// sem isso o texto que aparece na tela (data ISO crua) diverge do texto que
// já foi persistido de verdade na aba Timeline (formatado pelo backend).
// Mantida como cópia deliberada, não importada do backend — mesmo padrão de
// TIPOS_PROXIMA_ACAO acima (duas fontes de verdade, sincronizadas à mão).
export function formatarDataHoraCurta(valor) {
    const s = String(valor || "");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m)
        return s;
    return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}
