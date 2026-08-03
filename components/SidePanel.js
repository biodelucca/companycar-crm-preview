import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { obterAnotacao, salvarAnotacao } from "../services/anotacoes.js";
const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
function formatarDataEvento(iso) {
    // dataHora vem em dois formatos possíveis: "YYYY-MM-DD" (seed de criação,
    // vindo de mockOportunidades) ou ISO completo (eventos gerados em tempo
    // real por moverEtapa/atualizarProximaAcao/checklist/transferência).
    const data = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
    if (Number.isNaN(data.getTime()))
        return iso;
    return formatoDataHora.format(data);
}
export function SidePanel({ oportunidade, cliente, responsavel, usuarios = [], etapas, etapaAtual, motivosPerda = [], origens = [], timelineEventos, checklistItens, checklistFeito, onFechar, onMoverEtapa, onTransferir, onAtualizarProximaAcao, onToggleChecklist, }) {
    const [aba, setAba] = useState("detalhes");
    // Sprint 1 — Motivo de perda e Origem agora vêm das listas oficiais
    // (motivosPerda/origens, buscadas do backend real em Pipeline.tsx), não
    // mais de um dict fictício com 2 itens. "Outro" mostra também o texto
    // livre gravado em motivoPerdaDescricaoOutro.
    const motivoPerdaObj = motivosPerda.find((m) => m.id === oportunidade.motivoPerdaId);
    const origemObj = origens.find((o) => o.id === oportunidade.origemId);
    // Passo 5 — controle de movimentação de etapa.
    const etapaEhFinal = etapaAtual?.tipo === "ganho" || etapaAtual?.tipo === "perdido";
    const [etapaAlvo, setEtapaAlvo] = useState("");
    const [motivoAlvo, setMotivoAlvo] = useState("");
    const [motivoOutroAlvo, setMotivoOutroAlvo] = useState("");
    const [movendoEtapa, setMovendoEtapa] = useState(false);
    const [erroMovimento, setErroMovimento] = useState(null);
    const etapaAlvoObj = etapas.find((e) => e.id === etapaAlvo);
    const precisaMotivo = etapaAlvoObj?.tipo === "perdido";
    const motivoAlvoObj = motivosPerda.find((m) => m.id === motivoAlvo);
    const precisaOutroTexto = precisaMotivo && motivoAlvoObj?.nome === "Outro";
    async function confirmarMovimento() {
        if (!etapaAlvo)
            return;
        if (precisaMotivo && !motivoAlvo)
            return;
        if (precisaOutroTexto && !motivoOutroAlvo.trim())
            return;
        setMovendoEtapa(true);
        setErroMovimento(null);
        const resultado = await onMoverEtapa(etapaAlvo, precisaMotivo ? motivoAlvo : undefined, precisaOutroTexto ? motivoOutroAlvo.trim() : undefined);
        setMovendoEtapa(false);
        if (resultado && resultado.ok === false) {
            setErroMovimento(resultado.erro ?? "Não foi possível mover a oportunidade agora.");
            return;
        }
        setEtapaAlvo("");
        setMotivoAlvo("");
        setMotivoOutroAlvo("");
    }
    // Sprint 1 — Transferência entre usuários. Histórico automático fica a
    // cargo do backend (registrarEventoTimeline_ em Oportunidades.gs); aqui
    // só dispara a ação e mostra sucesso/erro.
    const [responsavelAlvo, setResponsavelAlvo] = useState("");
    const [transferindo, setTransferindo] = useState(false);
    const [erroTransferencia, setErroTransferencia] = useState(null);
    async function confirmarTransferencia() {
        if (!responsavelAlvo)
            return;
        setTransferindo(true);
        setErroTransferencia(null);
        const resultado = await onTransferir(responsavelAlvo);
        setTransferindo(false);
        if (resultado && resultado.ok === false) {
            setErroTransferencia(resultado.erro ?? "Não foi possível transferir a oportunidade agora.");
            return;
        }
        setResponsavelAlvo("");
    }
    // Passo 7 — edição de próxima ação.
    const [editandoProximaAcao, setEditandoProximaAcao] = useState(false);
    const [textoProximaAcao, setTextoProximaAcao] = useState(oportunidade.proximaAcao);
    const [dataProximaAcao, setDataProximaAcao] = useState(oportunidade.proximaAcaoData ?? "");
    function iniciarEdicaoProximaAcao() {
        setTextoProximaAcao(oportunidade.proximaAcao);
        setDataProximaAcao(oportunidade.proximaAcaoData ?? "");
        setEditandoProximaAcao(true);
    }
    function salvarProximaAcao() {
        if (!textoProximaAcao.trim())
            return;
        onAtualizarProximaAcao(textoProximaAcao.trim(), dataProximaAcao || null);
        setEditandoProximaAcao(false);
    }
    // Anotações — campo único de texto por oportunidade, adicionado a
    // pedido do CEO em 2026-08-02/03, ANTES da persistência das funções dos
    // Passos 5-8 e desta Sprint. Diferente delas, isto aqui grava e lê
    // sempre do backend real (ver services/anotacoes.ts) — recarrega toda
    // vez que a oportunidade aberta no painel muda. Sem versionamento, sem
    // histórico, sem comentários separados — só o texto atual.
    const [anotacoesTexto, setAnotacoesTexto] = useState("");
    const [anotacoesSalvo, setAnotacoesSalvo] = useState("");
    const [anotacoesCarregando, setAnotacoesCarregando] = useState(true);
    const [anotacoesSalvando, setAnotacoesSalvando] = useState(false);
    const [anotacoesErro, setAnotacoesErro] = useState(null);
    const [anotacoesSalvoAgora, setAnotacoesSalvoAgora] = useState(false);
    useEffect(() => {
        let cancelado = false;
        setAnotacoesCarregando(true);
        setAnotacoesErro(null);
        setAnotacoesSalvoAgora(false);
        obterAnotacao(oportunidade.id)
            .then((texto) => {
            if (cancelado)
                return;
            setAnotacoesTexto(texto);
            setAnotacoesSalvo(texto);
        })
            .catch(() => {
            if (!cancelado)
                setAnotacoesErro("Não foi possível carregar as anotações agora.");
        })
            .finally(() => {
            if (!cancelado)
                setAnotacoesCarregando(false);
        });
        return () => {
            cancelado = true;
        };
    }, [oportunidade.id]);
    function handleSalvarAnotacoes() {
        setAnotacoesSalvando(true);
        setAnotacoesErro(null);
        salvarAnotacao(oportunidade.id, anotacoesTexto)
            .then((texto) => {
            setAnotacoesSalvo(texto);
            setAnotacoesTexto(texto);
            setAnotacoesSalvoAgora(true);
        })
            .catch(() => {
            setAnotacoesErro("Não foi possível salvar agora. Tente novamente.");
        })
            .finally(() => setAnotacoesSalvando(false));
    }
    return (_jsx("div", { className: "side-panel__overlay", onClick: onFechar, children: _jsxs("aside", { className: "side-panel", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "side-panel__header", children: [_jsxs("div", { children: [_jsx("h2", { children: oportunidade.veiculoInteresse }), _jsx("p", { className: "side-panel__cliente", children: cliente?.nome ?? "Cliente não identificado" })] }), _jsx("button", { className: "side-panel__fechar", onClick: onFechar, "aria-label": "Fechar", children: "\u2715" })] }), _jsxs("div", { className: "side-panel__tabs", children: [_jsx("button", { className: aba === "detalhes" ? "ativo" : "", onClick: () => setAba("detalhes"), children: "Detalhes" }), _jsx("button", { className: aba === "timeline" ? "ativo" : "", onClick: () => setAba("timeline"), children: "Timeline" }), _jsx("button", { className: aba === "checklist" ? "ativo" : "", onClick: () => setAba("checklist"), children: "Checklist" })] }), _jsxs("div", { className: "side-panel__body", children: [aba === "detalhes" && (_jsxs(_Fragment, { children: [_jsxs("dl", { className: "side-panel__lista", children: [_jsx("dt", { children: "Etapa" }), _jsx("dd", { children: etapaAtual?.nome ?? "—" }), _jsx("dt", { children: "Respons\u00E1vel" }), _jsx("dd", { children: responsavel?.nome ?? "—" }), _jsx("dt", { children: "Origem" }), _jsx("dd", { children: origemObj?.nome ?? "—" }), _jsx("dt", { children: "Telefone" }), _jsx("dd", { children: cliente?.telefone ?? "—" }), _jsx("dt", { children: "Cidade" }), _jsx("dd", { children: cliente?.cidade ?? "—" }), _jsx("dt", { children: "Pr\u00F3xima a\u00E7\u00E3o" }), _jsxs("dd", { children: [oportunidade.proximaAcao, oportunidade.proximaAcaoData ? ` (${oportunidade.proximaAcaoData})` : ""] }), oportunidade.condicaoComercial && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Condi\u00E7\u00E3o comercial" }), _jsx("dd", { children: oportunidade.condicaoComercial })] })), oportunidade.valorProposto && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Valor proposto" }), _jsx("dd", { children: formatoMoeda.format(oportunidade.valorProposto) })] })), oportunidade.veiculoTroca && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Ve\u00EDculo na troca" }), _jsxs("dd", { children: [oportunidade.veiculoTroca.modelo, " \u00B7 ", oportunidade.veiculoTroca.ano, " \u00B7", " ", oportunidade.veiculoTroca.km.toLocaleString("pt-BR"), " km"] })] })), !oportunidade.veiculoTroca && oportunidade.veiculoTrocaDescricao && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Ve\u00EDculo na troca" }), _jsx("dd", { children: oportunidade.veiculoTrocaDescricao })] })), motivoPerdaObj && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Motivo da perda" }), _jsxs("dd", { children: [motivoPerdaObj.nome, motivoPerdaObj.nome === "Outro" && oportunidade.motivoPerdaDescricaoOutro
                                                            ? ` — ${oportunidade.motivoPerdaDescricaoOutro}`
                                                            : ""] })] }))] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Anota\u00E7\u00F5es" }), anotacoesCarregando ? (_jsx("p", { className: "side-panel__vazio-aba", children: "Carregando anota\u00E7\u00F5es\u2026" })) : (_jsxs("div", { className: "side-panel__form", children: [_jsx("textarea", { className: "side-panel__anotacoes-textarea", value: anotacoesTexto, onChange: (e) => {
                                                        setAnotacoesTexto(e.target.value);
                                                        setAnotacoesSalvoAgora(false);
                                                    }, placeholder: "Observa\u00E7\u00F5es internas sobre esta oportunidade\u2026", rows: 4 }), anotacoesErro && _jsx("p", { className: "side-panel__aviso", children: anotacoesErro }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: handleSalvarAnotacoes, disabled: anotacoesSalvando || anotacoesTexto === anotacoesSalvo, children: anotacoesSalvando ? "Salvando…" : "Salvar" }), anotacoesSalvoAgora && !anotacoesSalvando && (_jsx("span", { className: "side-panel__anotacoes-status", children: "Salvo" }))] })] }))] }), _jsx("div", { className: "side-panel__secao", children: !editandoProximaAcao ? (_jsx("button", { className: "side-panel__botao-secundario", onClick: iniciarEdicaoProximaAcao, children: "Editar pr\u00F3xima a\u00E7\u00E3o" })) : (_jsxs("div", { className: "side-panel__form", children: [_jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Pr\u00F3xima a\u00E7\u00E3o" }), _jsx("input", { type: "text", value: textoProximaAcao, onChange: (e) => setTextoProximaAcao(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Data" }), _jsx("input", { type: "date", value: dataProximaAcao, onChange: (e) => setDataProximaAcao(e.target.value) })] }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: salvarProximaAcao, children: "Salvar" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: () => setEditandoProximaAcao(false), children: "Cancelar" })] })] })) }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Mover para outra etapa" }), etapaEhFinal ? (_jsxs("p", { className: "side-panel__aviso", children: ["Etapa final (", etapaAtual?.nome, ") \u2014 n\u00E3o pode ser alterada."] })) : (_jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: etapaAlvo, onChange: (e) => {
                                                        setEtapaAlvo(e.target.value);
                                                        setMotivoAlvo("");
                                                        setMotivoOutroAlvo("");
                                                        setErroMovimento(null);
                                                    }, children: [_jsx("option", { value: "", children: "Selecione a etapa de destino\u2026" }), etapas
                                                            .filter((e) => e.id !== oportunidade.etapaId)
                                                            .map((e) => (_jsx("option", { value: e.id, children: e.nome }, e.id)))] }), precisaMotivo && (_jsxs("select", { value: motivoAlvo, onChange: (e) => {
                                                        setMotivoAlvo(e.target.value);
                                                        setMotivoOutroAlvo("");
                                                    }, children: [_jsx("option", { value: "", children: "Selecione o motivo da perda\u2026" }), motivosPerda.map((m) => (_jsx("option", { value: m.id, children: m.nome }, m.id)))] })), precisaOutroTexto && (_jsx("input", { type: "text", placeholder: "Descreva o motivo\u2026", value: motivoOutroAlvo, onChange: (e) => setMotivoOutroAlvo(e.target.value) })), erroMovimento && _jsx("p", { className: "side-panel__aviso", children: erroMovimento }), _jsx("button", { className: "side-panel__botao-primario", onClick: confirmarMovimento, disabled: movendoEtapa ||
                                                        !etapaAlvo ||
                                                        (precisaMotivo && !motivoAlvo) ||
                                                        (precisaOutroTexto && !motivoOutroAlvo.trim()), children: movendoEtapa ? "Movendo…" : "Confirmar movimentação" })] }))] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Transferir para outro usu\u00E1rio" }), _jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: responsavelAlvo, onChange: (e) => {
                                                        setResponsavelAlvo(e.target.value);
                                                        setErroTransferencia(null);
                                                    }, children: [_jsx("option", { value: "", children: "Selecione o novo respons\u00E1vel\u2026" }), usuarios
                                                            .filter((u) => u.id !== oportunidade.responsavelId)
                                                            .map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] }), erroTransferencia && _jsx("p", { className: "side-panel__aviso", children: erroTransferencia }), _jsx("button", { className: "side-panel__botao-primario", onClick: confirmarTransferencia, disabled: transferindo || !responsavelAlvo, children: transferindo ? "Transferindo…" : "Confirmar transferência" })] })] })] })), aba === "timeline" && (_jsxs("ul", { className: "side-panel__timeline", children: [timelineEventos.length === 0 && (_jsx("li", { className: "side-panel__vazio-aba", children: "Sem eventos registrados ainda." })), timelineEventos.map((evento) => (_jsxs("li", { children: [_jsx("span", { className: "side-panel__timeline-data", children: formatarDataEvento(evento.dataHora) }), _jsx("span", { children: evento.descricao })] }, evento.id)))] })), aba === "checklist" && (_jsx(_Fragment, { children: checklistItens.length === 0 ? (_jsx("p", { className: "side-panel__vazio-aba", children: "Sem checklist para esta etapa." })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "side-panel__aviso", children: "Itens gen\u00E9ricos (placeholder) \u2014 lista oficial por etapa ainda pendente de valida\u00E7\u00E3o com o Guilherme." }), _jsx("ul", { className: "side-panel__checklist", children: checklistItens.map((texto, i) => (_jsx("li", { children: _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: checklistFeito[i] ?? false, onChange: () => onToggleChecklist(i) }), texto] }) }, i))) })] })) }))] })] }) }));
}
