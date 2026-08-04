import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { listOportunidades, listEtapas, listUsuarios } from "../services/oportunidades.js";
import { listConversas, listMensagensConversa, enviarMensagemWhatsapp, vincularConversaOportunidade, } from "../services/whatsapp.js";
// Conversas — módulo WhatsApp no CRM, Sprint 5 (2026-08-04). Lista de
// conversas (uma por oportunidade vinculada, ou por telefone quando ainda
// "pendente de vínculo" — cliente com 2+ oportunidades abertas no momento
// do recebimento, ver WhatsApp.gs/listConversas_) + histórico de mensagens
// + caixa de resposta. Mesmo padrão de carregamento (Promise.all no mount,
// ERRO_SESSAO_EXPIRADA -> logout) já usado em Dashboard/Pipeline.
//
// Fora do escopo desta Sprint (decisão explícita do CEO): IA, áudio,
// documentos, imagens, integrações com portais, campanhas, mensagens
// automáticas, notificações, rodízio automático. Esta tela só cobre texto.
//
// Envio (enviarMensagemWhatsapp_) exige oportunidadeId — por isso uma
// conversa "pendente de vínculo" não mostra caixa de resposta até alguém
// escolher manualmente a negociação correta (vincularConversaOportunidade_).
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
function formatarDataHora(iso) {
    if (!iso)
        return "";
    const data = new Date(iso);
    if (Number.isNaN(data.getTime()))
        return iso;
    return formatoDataHora.format(data);
}
export function Conversas() {
    const { idToken, logout, usuario } = useAuth();
    const [conversas, setConversas] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [etapas, setEtapas] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [selecionadaChave, setSelecionadaChave] = useState(null);
    const [mensagens, setMensagens] = useState([]);
    const [carregandoMensagens, setCarregandoMensagens] = useState(false);
    const [erroMensagens, setErroMensagens] = useState(null);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState(null);
    const [vincularOportunidadeId, setVincularOportunidadeId] = useState("");
    const [vinculando, setVinculando] = useState(false);
    const [erroVincular, setErroVincular] = useState(null);
    useEffect(() => {
        if (!idToken)
            return;
        Promise.all([listConversas(idToken), listOportunidades(idToken), listEtapas(idToken), listUsuarios(idToken)])
            .then(([conversasResp, oportunidadesResp, etapasResp, usuariosResp]) => {
            setConversas(conversasResp);
            setOportunidades(oportunidadesResp);
            setEtapas(etapasResp);
            setUsuarios(usuariosResp);
        })
            .catch((e) => {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErro("Não foi possível carregar as conversas. Tente recarregar a página.");
        })
            .finally(() => setCarregando(false));
    }, [idToken, logout]);
    const conversaSelecionada = conversas.find((c) => c.chave === selecionadaChave) ?? null;
    useEffect(() => {
        if (!idToken || !selecionadaChave) {
            setMensagens([]);
            return;
        }
        const conversa = conversas.find((c) => c.chave === selecionadaChave);
        if (!conversa) {
            setMensagens([]);
            return;
        }
        setCarregandoMensagens(true);
        setErroMensagens(null);
        const filtro = conversa.oportunidadeId ? { oportunidadeId: conversa.oportunidadeId } : { telefone: conversa.telefone };
        listMensagensConversa(filtro, idToken)
            .then(setMensagens)
            .catch((e) => {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErroMensagens("Não foi possível carregar as mensagens desta conversa.");
        })
            .finally(() => setCarregandoMensagens(false));
        // Reseta a caixa de resposta / o formulário de vínculo ao trocar de
        // conversa, para não herdar rascunho ou erro de uma conversa anterior.
        setTexto("");
        setErroEnvio(null);
        setVincularOportunidadeId("");
        setErroVincular(null);
    }, [selecionadaChave, idToken, logout]);
    if (carregando)
        return _jsx("p", { className: "pipeline-loading", children: "Carregando conversas..." });
    if (erro)
        return _jsx("p", { className: "pipeline-loading", children: erro });
    // Oportunidades abertas do cliente da conversa selecionada — usado só no
    // formulário de vínculo de conversas "pendentes". Mesmo critério de
    // "aberta" usado no backend (etapa não é ganho nem perdido).
    const oportunidadesAbertasCliente = conversaSelecionada
        ? oportunidades.filter((o) => {
            if (o.clienteId !== conversaSelecionada.clienteId)
                return false;
            const etapa = etapas.find((e) => e.id === o.etapaId);
            return !etapa || (etapa.tipo !== "ganho" && etapa.tipo !== "perdido");
        })
        : [];
    async function enviar() {
        if (!conversaSelecionada || !conversaSelecionada.oportunidadeId || !usuario)
            return;
        const textoTrim = texto.trim();
        if (!textoTrim)
            return;
        setEnviando(true);
        setErroEnvio(null);
        try {
            const nova = await enviarMensagemWhatsapp({ oportunidadeId: conversaSelecionada.oportunidadeId, texto: textoTrim, usuarioId: usuario.id }, idToken);
            setMensagens((prev) => [...prev, nova]);
            setConversas((prev) => prev.map((c) => c.chave === conversaSelecionada.chave
                ? {
                    ...c,
                    totalMensagens: c.totalMensagens + 1,
                    ultimaMensagemTexto: nova.conteudoTexto,
                    ultimaMensagemDirecao: "enviada",
                    ultimaInteracaoEm: nova.enviadoEm,
                }
                : c));
            setTexto("");
        }
        catch (e) {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErroEnvio(e instanceof Error ? e.message : "Não foi possível enviar a mensagem agora.");
        }
        finally {
            setEnviando(false);
        }
    }
    async function vincular() {
        if (!conversaSelecionada || !vincularOportunidadeId || !usuario || !idToken)
            return;
        setVinculando(true);
        setErroVincular(null);
        try {
            const resultado = await vincularConversaOportunidade({ telefone: conversaSelecionada.telefone, oportunidadeId: vincularOportunidadeId, usuarioId: usuario.id }, idToken);
            // A conversa pendente vira uma conversa vinculada (ou se junta a uma
            // já existente para a mesma oportunidade) — recarregar a lista
            // inteira é mais simples e seguro do que tentar remontar isso à mão
            // no estado local.
            const conversasAtualizadas = await listConversas(idToken);
            setConversas(conversasAtualizadas);
            const nova = conversasAtualizadas.find((c) => c.oportunidadeId === resultado.oportunidadeId);
            setSelecionadaChave(nova ? nova.chave : null);
        }
        catch (e) {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErroVincular(e instanceof Error ? e.message : "Não foi possível vincular esta conversa agora.");
        }
        finally {
            setVinculando(false);
        }
    }
    return (_jsxs("div", { className: "conversas", children: [_jsxs("aside", { className: "conversas__lista", children: [_jsxs("header", { className: "conversas__lista-header", children: [_jsx("h2", { children: "Conversas" }), _jsx("span", { className: "conversas__contagem", children: conversas.length })] }), conversas.length === 0 && _jsx("p", { className: "conversas__vazio", children: "Nenhuma conversa ainda." }), _jsx("ul", { className: "conversas__itens", children: conversas.map((c) => {
                            const responsavel = c.responsavelId ? usuarios.find((u) => u.id === c.responsavelId) : undefined;
                            return (_jsx("li", { children: _jsxs("button", { className: `conversas__item ${selecionadaChave === c.chave ? "conversas__item--ativo" : ""}`, onClick: () => setSelecionadaChave(c.chave), children: [_jsxs("div", { className: "conversas__item-topo", children: [_jsx("strong", { children: c.clienteNome }), _jsx("span", { className: "conversas__item-hora", children: formatarDataHora(c.ultimaInteracaoEm) })] }), _jsxs("p", { className: "conversas__item-preview", children: [c.ultimaMensagemDirecao === "enviada" ? "Você: " : "", c.ultimaMensagemTexto || "—"] }), _jsx("div", { className: "conversas__item-rodape", children: c.pendenteVinculo ? (_jsx("span", { className: "conversas__badge conversas__badge--pendente", children: "Pendente de v\u00EDnculo" })) : (_jsx("span", { className: "conversas__badge", children: responsavel?.nome ?? "Sem responsável" })) })] }) }, c.chave));
                        }) })] }), _jsx("section", { className: "conversas__thread", children: !conversaSelecionada ? (_jsx("p", { className: "conversas__thread-vazio", children: "Selecione uma conversa para ver o hist\u00F3rico." })) : (_jsxs(_Fragment, { children: [_jsx("header", { className: "conversas__thread-header", children: _jsxs("div", { children: [_jsx("h3", { children: conversaSelecionada.clienteNome }), _jsx("span", { className: "conversas__thread-telefone", children: conversaSelecionada.telefone })] }) }), conversaSelecionada.pendenteVinculo && (_jsxs("div", { className: "conversas__vincular", children: [_jsx("p", { className: "side-panel__aviso", children: "Este cliente tem mais de uma negocia\u00E7\u00E3o em aberto \u2014 escolha a qual esta conversa pertence antes de responder." }), _jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: vincularOportunidadeId, onChange: (e) => setVincularOportunidadeId(e.target.value), children: [_jsx("option", { value: "", children: "Selecione a negocia\u00E7\u00E3o\u2026" }), oportunidadesAbertasCliente.map((o) => (_jsx("option", { value: o.id, children: o.veiculoInteresse || `Oportunidade #${o.id}` }, o.id)))] }), oportunidadesAbertasCliente.length === 0 && (_jsx("p", { className: "conversas__thread-vazio", children: "Este cliente n\u00E3o tem nenhuma negocia\u00E7\u00E3o em aberto no momento." })), erroVincular && _jsx("p", { className: "side-panel__aviso", children: erroVincular }), _jsx("div", { className: "side-panel__form-acoes", children: _jsx("button", { className: "side-panel__botao-primario", onClick: () => void vincular(), disabled: vinculando || !vincularOportunidadeId, children: vinculando ? "Vinculando…" : "Vincular" }) })] })] })), _jsxs("div", { className: "conversas__mensagens", children: [carregandoMensagens && _jsx("p", { className: "conversas__thread-vazio", children: "Carregando mensagens..." }), erroMensagens && _jsx("p", { className: "conversas__thread-vazio", children: erroMensagens }), !carregandoMensagens &&
                                    !erroMensagens &&
                                    mensagens.map((m) => (_jsxs("div", { className: `conversas__balao ${m.direcao === "enviada" ? "conversas__balao--enviada" : "conversas__balao--recebida"}`, children: [_jsx("p", { children: m.conteudoTexto }), _jsx("span", { className: "conversas__balao-hora", children: formatarDataHora(m.enviadoEm) })] }, m.id))), !carregandoMensagens && !erroMensagens && mensagens.length === 0 && (_jsx("p", { className: "conversas__thread-vazio", children: "Nenhuma mensagem nesta conversa ainda." }))] }), !conversaSelecionada.pendenteVinculo && (_jsxs("div", { className: "conversas__caixa-envio", children: [erroEnvio && _jsx("p", { className: "side-panel__aviso", children: erroEnvio }), _jsxs("div", { className: "conversas__caixa-envio-linha", children: [_jsx("textarea", { value: texto, onChange: (e) => setTexto(e.target.value), placeholder: "Digite sua mensagem\u2026", onKeyDown: (e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    void enviar();
                                                }
                                            } }), _jsx("button", { className: "side-panel__botao-primario", onClick: () => void enviar(), disabled: enviando || !texto.trim(), children: enviando ? "Enviando…" : "Enviar" })] })] }))] })) })] }));
}
