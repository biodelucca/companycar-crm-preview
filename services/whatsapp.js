import { apiClient } from "./apiClient.js";
// Camada de Services para o módulo WhatsApp — Sprint 5 (2026-08-04).
// Mesma filosofia do resto do app: o frontend nunca fala diretamente com
// a Evolution API (nem poderia — a URL/API key só existem no Apps
// Script), sempre passa pelas ações do Roteador.gs (ver WhatsApp.gs).
//
// Sem branch USE_MOCK aqui (diferente de services/oportunidades.ts): o
// módulo é novo nesta Sprint e não existe mock de conversas — em
// ambiente de dev com dados mockados a lista simplesmente vem vazia.
function mapConversa(raw) {
    return {
        chave: raw.chave,
        oportunidadeId: raw.oportunidadeId ? String(raw.oportunidadeId) : null,
        telefone: String(raw.telefone ?? ""),
        pendenteVinculo: Boolean(raw.pendenteVinculo),
        clienteId: raw.clienteId ? String(raw.clienteId) : "",
        clienteNome: raw.clienteNome ?? "(desconhecido)",
        responsavelId: raw.responsavelId !== null && raw.responsavelId !== undefined ? String(raw.responsavelId) : null,
        totalMensagens: Number(raw.totalMensagens ?? 0),
        ultimaMensagemTexto: raw.ultimaMensagemTexto ?? "",
        ultimaMensagemDirecao: raw.ultimaMensagemDirecao ?? "",
        ultimaInteracaoEm: raw.ultimaInteracaoEm ?? "",
    };
}
function mapMensagem(raw) {
    return {
        id: String(raw.id),
        oportunidadeId: raw.oportunidade_id ? String(raw.oportunidade_id) : "",
        clienteId: raw.cliente_id ? String(raw.cliente_id) : "",
        telefone: String(raw.telefone ?? ""),
        direcao: raw.direcao,
        tipo: raw.tipo,
        conteudoTexto: raw.conteudo_texto ?? "",
        midiaDriveId: raw.midia_drive_id ?? "",
        usuarioId: raw.usuario_id ? String(raw.usuario_id) : "",
        enviadoEm: raw.enviado_em,
    };
}
export async function listConversas(idToken) {
    const raw = await apiClient.request({ action: "listConversas", idToken: idToken ?? undefined });
    return raw.map(mapConversa);
}
export async function listMensagensConversa(filtro, idToken) {
    const params = {};
    if (filtro.oportunidadeId)
        params.oportunidadeId = filtro.oportunidadeId;
    if (filtro.telefone)
        params.telefone = filtro.telefone;
    const raw = await apiClient.request({
        action: "listMensagensConversa",
        params,
        idToken: idToken ?? undefined,
    });
    return raw.map(mapMensagem);
}
export async function enviarMensagemWhatsapp(dados, idToken) {
    const raw = await apiClient.request({
        action: "enviarMensagemWhatsapp",
        body: { oportunidadeId: dados.oportunidadeId, texto: dados.texto, usuarioId: dados.usuarioId },
        idToken: idToken ?? undefined,
    });
    return mapMensagem(raw);
}
export async function vincularConversaOportunidade(dados, idToken) {
    return apiClient.request({
        action: "vincularConversaOportunidade",
        body: dados,
        idToken: idToken ?? undefined,
    });
}
