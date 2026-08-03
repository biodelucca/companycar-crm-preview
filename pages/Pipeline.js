import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { listOportunidades, listEtapas, listClientes, listUsuarios } from "../services/oportunidades.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { OpportunityCard } from "../components/OpportunityCard.js";
import { SidePanel } from "../components/SidePanel.js";
// Pipeline — Kanban agrupado por etapa.
//
// Passo 5-8 do roadmap (2026-08-02, Ciclo 4): movimentação de oportunidades
// entre etapas, timeline automática, edição de próxima ação e checklist por
// etapa. Decisão do CEO no mesmo ciclo: pausar a autenticação/gravação real
// (Passo 4 fica parado num bug de autorização do Apps Script — ver diretriz
// técnica) e seguir os próximos passos direto sobre os dados mockados, para
// não travar o produto. Por isso as mudanças feitas aqui (mover etapa,
// editar próxima ação, marcar checklist) vivem só em memória do navegador —
// não são gravadas na planilha. Quando a autenticação/escrita real voltarem,
// os handlers abaixo (moverEtapa/atualizarProximaAcao/toggleChecklist) são o
// lugar certo para trocar o `setOportunidades` local por uma chamada real de
// API (doPost em Roteador.gs, ainda não implementado).
//
// Checklist: os textos usados em CHECKLIST_GENERICO/CHECKLIST_VENDA são
// placeholders — a lista oficial por etapa ainda precisa vir do Guilherme
// (mesmo padrão já usado para Motivos de Perda). A UI já mostra um aviso.
const CHECKLIST_GENERICO = [
    "Dados do cliente confirmados",
    "Necessidade e uso do veículo entendidos",
    "Próxima ação definida",
];
const CHECKLIST_VENDA = [
    "Contrato assinado",
    "Documentação do veículo conferida",
    "Pagamento confirmado",
    "Entrega agendada",
];
function checklistTemplatePorEtapa(etapa) {
    if (!etapa || etapa.tipo === "perdido")
        return [];
    if (etapa.tipo === "ganho")
        return CHECKLIST_VENDA;
    return CHECKLIST_GENERICO;
}
function hoje() {
    return new Date().toISOString().slice(0, 10);
}
function novoEventoId() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export function Pipeline() {
    const { idToken, logout, usuario } = useAuth();
    const [etapas, setEtapas] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [selecionadaId, setSelecionadaId] = useState(null);
    const [timelineEventos, setTimelineEventos] = useState([]);
    // Chave: `${oportunidadeId}|${etapaId}` -> array de booleans (mesma ordem
    // do template de checklist daquela etapa). Ausente = nada marcado ainda.
    const [checklistState, setChecklistState] = useState({});
    useEffect(() => {
        if (!idToken)
            return;
        Promise.all([listEtapas(idToken), listOportunidades(idToken), listClientes(idToken), listUsuarios(idToken)])
            .then(([etapasResp, oportunidadesResp, clientesResp, usuariosResp]) => {
            const etapasOrdenadas = [...etapasResp].sort((a, b) => a.ordem - b.ordem);
            setEtapas(etapasOrdenadas);
            setOportunidades(oportunidadesResp);
            setClientes(clientesResp);
            setUsuarios(usuariosResp);
            // Semeia a timeline com um evento de criação por oportunidade, para
            // a aba Timeline do painel não começar vazia (Passo 6).
            setTimelineEventos(oportunidadesResp.map((o) => ({
                id: "criacao-" + o.id,
                oportunidadeId: o.id,
                tipoEvento: "criacao",
                descricao: "Oportunidade criada",
                usuarioId: o.responsavelId,
                dataHora: o.criadoEm,
            })));
        })
            .catch((e) => {
            // Ver comentário equivalente em Dashboard.tsx — mesmo bug, mesmo
            // conserto (catch que faltava + tratamento específico de sessão
            // expirada).
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErro("Não foi possível carregar o pipeline. Tente recarregar a página.");
        })
            .finally(() => setCarregando(false));
    }, [idToken, logout]);
    if (carregando)
        return _jsx("p", { className: "pipeline-loading", children: "Carregando pipeline..." });
    if (erro)
        return _jsx("p", { className: "pipeline-loading", children: erro });
    const clientePorId = (id) => clientes.find((c) => c.id === id);
    const etapaPorId = (id) => etapas.find((e) => e.id === id);
    const oportunidadeSelecionada = oportunidades.find((o) => o.id === selecionadaId) ?? null;
    function registrarEvento(oportunidadeId, descricao, tipoEvento) {
        setTimelineEventos((prev) => [
            ...prev,
            {
                id: novoEventoId(),
                oportunidadeId,
                tipoEvento,
                descricao,
                usuarioId: usuario?.id ?? "sistema",
                dataHora: new Date().toISOString(),
            },
        ]);
    }
    // Passo 5 — Movimentação de oportunidades entre etapas. Etapas finais
    // (ganho/perdido) não podem ser a ORIGEM de uma nova movimentação — a
    // UI (SidePanel) já esconde o controle nesse caso, isto aqui é a
    // segunda barreira. Mover para "Perdido" exige motivoPerdaId.
    function moverEtapa(oportunidadeId, novaEtapaId, motivoPerdaId) {
        const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
        const etapaAtual = oportunidade ? etapaPorId(oportunidade.etapaId) : undefined;
        const etapaNova = etapaPorId(novaEtapaId);
        if (!oportunidade || !etapaNova)
            return;
        if (etapaAtual && (etapaAtual.tipo === "ganho" || etapaAtual.tipo === "perdido"))
            return;
        const atualizacao = {
            etapaId: novaEtapaId,
            atualizadoEm: hoje(),
        };
        if (etapaNova.tipo === "perdido") {
            atualizacao.etapaOrigemPerdaId = oportunidade.etapaId;
            atualizacao.motivoPerdaId = motivoPerdaId;
            atualizacao.perdidoEm = hoje();
            atualizacao.perdidoPor = usuario?.id;
        }
        setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? { ...o, ...atualizacao } : o)));
        const nomeAtor = usuario?.nome ?? "Alguém";
        registrarEvento(oportunidadeId, `${nomeAtor} moveu de "${etapaAtual?.nome ?? "?"}" para "${etapaNova.nome}"`, "mudanca_etapa");
    }
    // Passo 7 — editar próxima ação.
    function atualizarProximaAcao(oportunidadeId, texto, data) {
        setOportunidades((prev) => prev.map((o) => o.id === oportunidadeId ? { ...o, proximaAcao: texto, proximaAcaoData: data, atualizadoEm: hoje() } : o));
        registrarEvento(oportunidadeId, `Próxima ação atualizada: "${texto}"`, "proxima_acao");
    }
    // Passo 8 — checklist da etapa (interativo, itens-placeholder).
    function toggleChecklistItem(oportunidadeId, etapaId, index, itens) {
        const chave = `${oportunidadeId}|${etapaId}`;
        setChecklistState((prev) => {
            const atual = prev[chave] ? [...prev[chave]] : itens.map(() => false);
            atual[index] = !atual[index];
            if (atual[index]) {
                registrarEvento(oportunidadeId, `Item do checklist concluído: "${itens[index]}"`, "checklist");
            }
            return { ...prev, [chave]: atual };
        });
    }
    return (_jsxs("div", { className: "pipeline", children: [_jsx("div", { className: "pipeline__board", children: etapas.map((etapa) => {
                    const opsDaEtapa = oportunidades.filter((o) => o.etapaId === etapa.id);
                    return (_jsxs("section", { className: `pipeline__coluna pipeline__coluna--${etapa.tipo}`, children: [_jsxs("header", { className: "pipeline__coluna-header", children: [_jsx("h2", { children: etapa.nome }), _jsx("span", { className: "pipeline__contagem", children: opsDaEtapa.length })] }), _jsxs("div", { className: "pipeline__coluna-cards", children: [opsDaEtapa.length === 0 && _jsx("p", { className: "pipeline__vazio", children: "Sem oportunidades" }), opsDaEtapa.map((o) => (_jsx(OpportunityCard, { oportunidade: o, cliente: clientePorId(o.clienteId), onClick: () => setSelecionadaId(o.id) }, o.id)))] })] }, etapa.id));
                }) }), oportunidadeSelecionada &&
                (() => {
                    const etapaAtual = etapaPorId(oportunidadeSelecionada.etapaId);
                    const itensChecklist = checklistTemplatePorEtapa(etapaAtual);
                    const chaveChecklist = `${oportunidadeSelecionada.id}|${oportunidadeSelecionada.etapaId}`;
                    const feitoChecklist = checklistState[chaveChecklist] ?? itensChecklist.map(() => false);
                    const eventosDaOportunidade = timelineEventos
                        .filter((ev) => ev.oportunidadeId === oportunidadeSelecionada.id)
                        .sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
                    return (_jsx(SidePanel, { oportunidade: oportunidadeSelecionada, cliente: clientePorId(oportunidadeSelecionada.clienteId), responsavel: usuarios.find((u) => u.id === oportunidadeSelecionada.responsavelId), etapas: etapas, etapaAtual: etapaAtual, timelineEventos: eventosDaOportunidade, checklistItens: itensChecklist, checklistFeito: feitoChecklist, onFechar: () => setSelecionadaId(null), onMoverEtapa: (novaEtapaId, motivoPerdaId) => moverEtapa(oportunidadeSelecionada.id, novaEtapaId, motivoPerdaId), onAtualizarProximaAcao: (texto, data) => atualizarProximaAcao(oportunidadeSelecionada.id, texto, data), onToggleChecklist: (index) => toggleChecklistItem(oportunidadeSelecionada.id, oportunidadeSelecionada.etapaId, index, itensChecklist) }));
                })()] }));
}
