import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { listOportunidades, listEtapas, listClientes, listUsuarios, listMotivosPerda, listOrigens, listTimeline, moverEtapaOportunidade, transferirOportunidade, } from "../services/oportunidades.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { OpportunityCard } from "../components/OpportunityCard.js";
import { SidePanel } from "../components/SidePanel.js";
// Pipeline — Kanban agrupado por etapa.
//
// Passo 5-8 do roadmap (2026-08-02, Ciclo 4): movimentação de oportunidades
// entre etapas, timeline automática, edição de próxima ação e checklist por
// etapa. Na época, tudo isso vivia só em memória do navegador (autenticação
// pausada, sem escrita real).
//
// Sprint 1 "Operação Comercial" (2026-08-03): mover etapa e transferência
// de responsável passam a persistir de verdade na planilha (ver
// services/oportunidades.ts e Oportunidades.gs) — a primeira vez que
// qualquer mudança feita aqui sobrevive a um F5. Também entram: drag-and-
// drop (desktop) além do seletor por botão (que continua existindo e é o
// único jeito no mobile), a lista oficial de Motivos de Perda com campo
// "Outro" obrigatório, e transferência entre usuários com histórico
// automático. Próxima ação e checklist (abaixo) continuam só em memória —
// fora do escopo desta Sprint, registrado para depois.
//
// Checklist: os textos usados em CHECKLIST_GENERICO/CHECKLIST_VENDA são
// placeholders — a lista oficial por etapa ainda precisa vir do Guilherme
// (mesmo padrão já usado para Motivos de Perda antes desta Sprint). A UI já
// mostra um aviso.
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
// Mesmo breakpoint do CSS (@media max-width: 720px, ver src/index.css) —
// acima disso o drag-and-drop fica ativo; em telas menores só o seletor
// por botão no SidePanel funciona (requisito explícito da Sprint 1:
// "desktop only").
const LARGURA_MINIMA_DRAG = 721;
export function Pipeline() {
    const { idToken, logout, usuario } = useAuth();
    const [etapas, setEtapas] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [motivosPerda, setMotivosPerda] = useState([]);
    const [origens, setOrigens] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [selecionadaId, setSelecionadaId] = useState(null);
    const [timelineEventos, setTimelineEventos] = useState([]);
    // Chave: `${oportunidadeId}|${etapaId}` -> array de booleans (mesma ordem
    // do template de checklist daquela etapa). Ausente = nada marcado ainda.
    const [checklistState, setChecklistState] = useState({});
    // Sprint 1 — estado do drag-and-drop (desktop) e da ação em andamento
    // (mover etapa / transferir), compartilhado entre o board e o SidePanel
    // para não deixar o usuário disparar duas ações de escrita ao mesmo tempo.
    const [isDesktop, setIsDesktop] = useState(typeof window !== "undefined" ? window.innerWidth >= LARGURA_MINIMA_DRAG : true);
    const [arrastandoId, setArrastandoId] = useState(null);
    const [colunaSobreId, setColunaSobreId] = useState(null);
    const [dropPendente, setDropPendente] = useState(null);
    const [motivoModalAlvo, setMotivoModalAlvo] = useState("");
    const [motivoModalOutro, setMotivoModalOutro] = useState("");
    const [motivoModalErro, setMotivoModalErro] = useState(null);
    const [salvandoAcao, setSalvandoAcao] = useState(false);
    const [acaoErro, setAcaoErro] = useState(null);
    useEffect(() => {
        function aoRedimensionar() {
            setIsDesktop(window.innerWidth >= LARGURA_MINIMA_DRAG);
        }
        window.addEventListener("resize", aoRedimensionar);
        return () => window.removeEventListener("resize", aoRedimensionar);
    }, []);
    useEffect(() => {
        if (!idToken)
            return;
        Promise.all([
            listEtapas(idToken),
            listOportunidades(idToken),
            listClientes(idToken),
            listUsuarios(idToken),
            listMotivosPerda(idToken),
            listOrigens(idToken),
            listTimeline(idToken),
        ])
            .then(([etapasResp, oportunidadesResp, clientesResp, usuariosResp, motivosPerdaResp, origensResp, timelineResp]) => {
            const etapasOrdenadas = [...etapasResp].sort((a, b) => a.ordem - b.ordem);
            setEtapas(etapasOrdenadas);
            setOportunidades(oportunidadesResp);
            setClientes(clientesResp);
            setUsuarios(usuariosResp);
            setMotivosPerda(motivosPerdaResp);
            setOrigens(origensResp);
            // Timeline: semeia com um evento de criação por oportunidade (para a
            // aba não começar vazia, mesma lógica desde o Passo 6) e junta com o
            // que já está persistido de verdade na planilha (mudança de etapa e
            // transferência, ver Timeline.gs) — os eventos novos gerados nesta
            // sessão são adicionados por cima via registrarEvento.
            const eventosCriacao = oportunidadesResp.map((o) => ({
                id: "criacao-" + o.id,
                oportunidadeId: o.id,
                tipoEvento: "criacao",
                descricao: "Oportunidade criada",
                usuarioId: o.responsavelId,
                dataHora: o.criadoEm,
            }));
            setTimelineEventos([...eventosCriacao, ...timelineResp]);
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
    // Sprint 1 — Mover etapa passa a persistir de verdade (Oportunidades.gs /
    // moverEtapaOportunidade_). Usado tanto pelo seletor por botão (SidePanel,
    // mobile e fallback desktop) quanto pelo novo drag-and-drop (Pipeline,
    // desktop). Duas camadas de validação de etapa final, mesma filosofia já
    // usada desde o Ciclo 4: aqui é a primeira barreira do frontend (o
    // backend valida de novo, quem manda é ele). Retorna {ok, erro} em vez de
    // lançar, para as duas UIs (SidePanel e o modal de drop) decidirem o que
    // mostrar sem precisar de try/catch duplicado.
    async function moverEtapa(oportunidadeId, novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto) {
        const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
        const etapaAtual = oportunidade ? etapaPorId(oportunidade.etapaId) : undefined;
        const etapaNova = etapaPorId(novaEtapaId);
        if (!oportunidade || !etapaNova)
            return { ok: false, erro: "Etapa de destino inválida." };
        if (etapaAtual && (etapaAtual.tipo === "ganho" || etapaAtual.tipo === "perdido")) {
            return { ok: false, erro: `Etapa atual (${etapaAtual.nome}) é final — não pode ser alterada.` };
        }
        if (etapaAtual && etapaAtual.id === novaEtapaId)
            return { ok: true }; // soltou na mesma coluna — nada a fazer
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            await moverEtapaOportunidade({
                oportunidadeId,
                novaEtapaId,
                motivoPerdaId,
                motivoPerdaOutroTexto,
                usuarioId: usuario?.id,
            }, idToken);
            const agora = new Date().toISOString();
            const atualizacao = { etapaId: novaEtapaId, atualizadoEm: agora };
            let nomeMotivo;
            if (etapaNova.tipo === "perdido") {
                atualizacao.etapaOrigemPerdaId = oportunidade.etapaId;
                atualizacao.motivoPerdaId = motivoPerdaId;
                atualizacao.perdidoEm = agora;
                atualizacao.perdidoPor = usuario?.id;
                atualizacao.motivoPerdaDescricaoOutro = motivoPerdaOutroTexto;
                nomeMotivo = motivosPerda.find((m) => m.id === motivoPerdaId)?.nome;
            }
            setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? { ...o, ...atualizacao } : o)));
            const nomeAtor = usuario?.nome ?? "Alguém";
            let descricao = `${nomeAtor} moveu de "${etapaAtual?.nome ?? "?"}" para "${etapaNova.nome}"`;
            if (nomeMotivo) {
                descricao += ` — motivo: ${nomeMotivo}${nomeMotivo === "Outro" ? ` (${motivoPerdaOutroTexto})` : ""}`;
            }
            registrarEvento(oportunidadeId, descricao, "mudanca_etapa");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível mover a oportunidade agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    // Sprint 1 — Transferência de responsável. "quem realizou" é sempre o
    // usuário logado no momento da ação (pode ser diferente do responsável
    // antigo e do novo — ex: um gerente reatribuindo a carteira de outra
    // pessoa). Mesmo padrão {ok, erro} de moverEtapa.
    async function transferir(oportunidadeId, novoResponsavelId) {
        const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
        if (!oportunidade)
            return { ok: false, erro: "Oportunidade não encontrada." };
        const responsavelAntigo = usuarios.find((u) => u.id === oportunidade.responsavelId);
        const novoResponsavel = usuarios.find((u) => u.id === novoResponsavelId);
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            await transferirOportunidade({ oportunidadeId, novoResponsavelId, usuarioId: usuario?.id }, idToken);
            const agora = new Date().toISOString();
            setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? { ...o, responsavelId: novoResponsavelId, atualizadoEm: agora } : o)));
            registrarEvento(oportunidadeId, `Transferida de "${responsavelAntigo?.nome ?? "?"}" para "${novoResponsavel?.nome ?? "?"}" por "${usuario?.nome ?? "?"}"`, "transferencia");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível transferir a oportunidade agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    // Passo 7 — editar próxima ação (continua só em memória — fora do escopo
    // da Sprint 1).
    function atualizarProximaAcao(oportunidadeId, texto, data) {
        setOportunidades((prev) => prev.map((o) => o.id === oportunidadeId ? { ...o, proximaAcao: texto, proximaAcaoData: data, atualizadoEm: hoje() } : o));
        registrarEvento(oportunidadeId, `Próxima ação atualizada: "${texto}"`, "proxima_acao");
    }
    // Passo 8 — checklist da etapa (interativo, itens-placeholder, continua
    // só em memória — fora do escopo da Sprint 1).
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
    // --- Drag-and-drop (desktop) ------------------------------------------
    function handleDragStartCard(oportunidadeId) {
        return (e) => {
            e.dataTransfer.setData("text/plain", oportunidadeId);
            e.dataTransfer.effectAllowed = "move";
            setArrastandoId(oportunidadeId);
        };
    }
    function handleDragEndCard() {
        setArrastandoId(null);
        setColunaSobreId(null);
    }
    function handleDragOverColuna(etapaId) {
        return (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (colunaSobreId !== etapaId)
                setColunaSobreId(etapaId);
        };
    }
    function handleDropColuna(etapaId) {
        return (e) => {
            e.preventDefault();
            setColunaSobreId(null);
            const oportunidadeId = e.dataTransfer.getData("text/plain") || arrastandoId;
            setArrastandoId(null);
            if (!oportunidadeId || salvandoAcao)
                return;
            const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
            const etapaNova = etapaPorId(etapaId);
            if (!oportunidade || !etapaNova || oportunidade.etapaId === etapaId)
                return;
            const etapaAtual = etapaPorId(oportunidade.etapaId);
            if (etapaAtual && (etapaAtual.tipo === "ganho" || etapaAtual.tipo === "perdido"))
                return; // segunda barreira — a primeira é não deixar essas colunas arrastáveis
            if (etapaNova.tipo === "perdido") {
                // Motivo é obrigatório ao mover para Perdido — abre o modal em vez
                // de mover direto; a movimentação só acontece quando confirmado.
                setDropPendente({ oportunidadeId, novaEtapaId: etapaId });
                setMotivoModalAlvo("");
                setMotivoModalOutro("");
                setMotivoModalErro(null);
                return;
            }
            void moverEtapa(oportunidadeId, etapaId);
        };
    }
    async function confirmarDropPendente() {
        if (!dropPendente)
            return;
        if (!motivoModalAlvo) {
            setMotivoModalErro("Selecione o motivo da perda.");
            return;
        }
        const motivoObj = motivosPerda.find((m) => m.id === motivoModalAlvo);
        const precisaOutro = motivoObj?.nome === "Outro";
        if (precisaOutro && !motivoModalOutro.trim()) {
            setMotivoModalErro('Descreva o motivo quando selecionar "Outro".');
            return;
        }
        const resultado = await moverEtapa(dropPendente.oportunidadeId, dropPendente.novaEtapaId, motivoModalAlvo, precisaOutro ? motivoModalOutro.trim() : undefined);
        if (resultado.ok) {
            setDropPendente(null);
        }
        else {
            setMotivoModalErro(resultado.erro ?? "Não foi possível mover a oportunidade agora.");
        }
    }
    function cancelarDropPendente() {
        setDropPendente(null);
    }
    const oportunidadeDropPendente = dropPendente ? oportunidades.find((o) => o.id === dropPendente.oportunidadeId) : null;
    return (_jsxs("div", { className: "pipeline", children: [acaoErro && _jsx("p", { className: "pipeline__aviso-acao", children: acaoErro }), _jsx("div", { className: "pipeline__board", children: etapas.map((etapa) => {
                    const opsDaEtapa = oportunidades.filter((o) => o.etapaId === etapa.id);
                    const etapaFinal = etapa.tipo === "ganho" || etapa.tipo === "perdido";
                    const arrastavel = isDesktop && !etapaFinal;
                    return (_jsxs("section", { className: `pipeline__coluna pipeline__coluna--${etapa.tipo}` +
                            (colunaSobreId === etapa.id ? " pipeline__coluna--sobre" : ""), onDragOver: isDesktop ? handleDragOverColuna(etapa.id) : undefined, onDrop: isDesktop ? handleDropColuna(etapa.id) : undefined, children: [_jsxs("header", { className: "pipeline__coluna-header", children: [_jsx("h2", { children: etapa.nome }), _jsx("span", { className: "pipeline__contagem", children: opsDaEtapa.length })] }), _jsxs("div", { className: "pipeline__coluna-cards", children: [opsDaEtapa.length === 0 && _jsx("p", { className: "pipeline__vazio", children: "Sem oportunidades" }), opsDaEtapa.map((o) => (_jsx(OpportunityCard, { oportunidade: o, cliente: clientePorId(o.clienteId), onClick: () => setSelecionadaId(o.id), arrastavel: arrastavel, onDragStart: handleDragStartCard(o.id), onDragEnd: handleDragEndCard }, o.id)))] })] }, etapa.id));
                }) }), oportunidadeSelecionada &&
                (() => {
                    const etapaAtual = etapaPorId(oportunidadeSelecionada.etapaId);
                    const itensChecklist = checklistTemplatePorEtapa(etapaAtual);
                    const chaveChecklist = `${oportunidadeSelecionada.id}|${oportunidadeSelecionada.etapaId}`;
                    const feitoChecklist = checklistState[chaveChecklist] ?? itensChecklist.map(() => false);
                    const eventosDaOportunidade = timelineEventos
                        .filter((ev) => ev.oportunidadeId === oportunidadeSelecionada.id)
                        .sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
                    return (_jsx(SidePanel, { oportunidade: oportunidadeSelecionada, cliente: clientePorId(oportunidadeSelecionada.clienteId), responsavel: usuarios.find((u) => u.id === oportunidadeSelecionada.responsavelId), usuarios: usuarios, etapas: etapas, etapaAtual: etapaAtual, motivosPerda: motivosPerda, origens: origens, timelineEventos: eventosDaOportunidade, checklistItens: itensChecklist, checklistFeito: feitoChecklist, onFechar: () => setSelecionadaId(null), onMoverEtapa: (novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto) => moverEtapa(oportunidadeSelecionada.id, novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto), onTransferir: (novoResponsavelId) => transferir(oportunidadeSelecionada.id, novoResponsavelId), onAtualizarProximaAcao: (texto, data) => atualizarProximaAcao(oportunidadeSelecionada.id, texto, data), onToggleChecklist: (index) => toggleChecklistItem(oportunidadeSelecionada.id, oportunidadeSelecionada.etapaId, index, itensChecklist) }));
                })(), dropPendente && (_jsx("div", { className: "drop-motivo-overlay", onClick: cancelarDropPendente, children: _jsxs("div", { className: "drop-motivo-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Motivo da perda" }), _jsxs("p", { className: "side-panel__cliente", children: ["Movendo \"", oportunidadeDropPendente?.veiculoInteresse ?? "", "\" para Perdido"] }), _jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: motivoModalAlvo, onChange: (e) => setMotivoModalAlvo(e.target.value), children: [_jsx("option", { value: "", children: "Selecione o motivo da perda\u2026" }), motivosPerda.map((m) => (_jsx("option", { value: m.id, children: m.nome }, m.id)))] }), motivosPerda.find((m) => m.id === motivoModalAlvo)?.nome === "Outro" && (_jsx("input", { type: "text", placeholder: "Descreva o motivo\u2026", value: motivoModalOutro, onChange: (e) => setMotivoModalOutro(e.target.value) })), motivoModalErro && _jsx("p", { className: "side-panel__aviso", children: motivoModalErro }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: confirmarDropPendente, disabled: salvandoAcao, children: salvandoAcao ? "Movendo…" : "Confirmar" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: cancelarDropPendente, children: "Cancelar" })] })] })] }) }))] }));
}
