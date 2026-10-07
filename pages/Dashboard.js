import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listClientes, listEtapas, listMotivosPerda, listOportunidades, listOrigens, listUsuarios } from "../services/oportunidades.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { primeiroNome } from "../utils/nomes.js";
import { descricaoProximaAcao } from "../utils/proximaAcao.js";
import { agoraSaoPaulo, dataCurta, horaCurta, montarAgenda } from "../utils/agenda.js";
import { OPCOES_PERIODO, descreverPeriodo, dentroDoPeriodo, periodoAlcancaVendasSemData, resolverPeriodo } from "../utils/periodo.js";
// Melhoria isolada "Botão Atualizar no Dashboard" (2026-08-25): mesmo
// helper local já usado no Pipeline (formatarHoraCurta, ver Pipeline.js)
// para o texto discreto "Atualizado às HH:MM" ao lado do botão. Duplicado
// aqui de propósito (mesmo padrão de "duas fontes de verdade sincronizadas
// à mão" já usado em outros pontos deste arquivo/projeto) em vez de mexer
// em Pipeline.js, que está fora do escopo desta melhoria.
function formatarHoraCurta(data) {
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
// Agrupa e conta oportunidades por uma chave (etapa/responsável/origem/
// motivo), resolvendo o rótulo legível via um mapa id -> nome. Ordena do
// maior para o menor por padrão (ordemPersonalizada substitui isso quando
// a ordem certa é outra, ex: etapas seguem "ordem" do pipeline).
function agruparContagem(itens, chaveDe, nomesPorId, ordemPersonalizada) {
    const contagens = new Map();
    for (const item of itens) {
        const chave = chaveDe(item);
        if (!chave)
            continue;
        contagens.set(chave, (contagens.get(chave) ?? 0) + 1);
    }
    const linhas = Array.from(contagens.entries()).map(([chave, quantidade]) => ({
        chave,
        rotulo: nomesPorId.get(chave) ?? `#${chave}`,
        quantidade,
    }));
    if (ordemPersonalizada)
        return linhas.sort((a, b) => ordemPersonalizada(a.chave, b.chave));
    return linhas.sort((a, b) => b.quantidade - a.quantidade);
}
// Melhoria 5: grupos da agenda, na ordem de prioridade visual, e quantos
// itens de cada grupo aparecem antes do "Ver mais".
const GRUPOS_AGENDA = [
    { chave: "atrasadas", rotulo: "Atrasadas", vazio: "Nenhuma a\u00E7\u00E3o atrasada." },
    { chave: "hoje", rotulo: "Hoje", vazio: "Nenhuma a\u00E7\u00E3o para hoje." },
    { chave: "proximos", rotulo: "Pr\u00F3ximos dias", vazio: "Nenhuma a\u00E7\u00E3o nos pr\u00F3ximos 7 dias." },
];
const LIMITE_INICIAL_AGENDA = 10;
// Tela exclusiva do Dashboard (visão do gerente) — visão rápida do funil
// ao logar, com os indicadores mínimos da Sprint 2.
export function Dashboard({ onIrPipeline, onNovaNegociacao, onAbrirOportunidade }) {
    const { usuario, idToken, logout } = useAuth();
    const [etapas, setEtapas] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [origens, setOrigens] = useState([]);
    const [motivosPerda, setMotivosPerda] = useState([]);
    // Sprint 6 (2026-08-07) — item 6 "Dashboard": card "Próximas ações de
    // hoje" passa a mostrar o nome do cliente, não só o veículo de interesse
    // — precisa da lista de Clientes, que o Dashboard não buscava até agora.
    const [clientes, setClientes] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    // Estrutura de filtros da Sprint 2 — período, responsável e origem.
    // "Não é necessário implementar filtros avançados, apenas a estrutura
    // necessária" (CEO): são três selects simples que recalculam os
    // indicadores a partir do mesmo conjunto filtrado, sem UI de datas
    // customizadas por enquanto.
    const [filtroPeriodo, setFiltroPeriodo] = useState("todos");
    const [filtroResponsavelId, setFiltroResponsavelId] = useState("");
    const [filtroOrigemId, setFiltroOrigemId] = useState("");
    // Melhoria 6 (2026-10-07): datas do período personalizado ("YYYY-MM-DD",
    // dias civis de America/Sao_Paulo). Ficam no estado do componente — o
    // botão Atualizar só recarrega os dados e mantém período/filtros.
    const [personalizadoInicio, setPersonalizadoInicio] = useState("");
    const [personalizadoFim, setPersonalizadoFim] = useState("");
    // Melhoria 5 "Agenda de Próximas Ações" (2026-10-07): filtro de
    // responsável PRÓPRIO da agenda (independente dos filtros de período/
    // origem/responsável dos indicadores acima — a agenda responde "o que
    // preciso fazer agora", não "o que entrou no período") e quantos itens
    // de cada grupo estão visíveis (limite inicial com "Ver mais").
    const [agendaRespId, setAgendaRespId] = useState("");
    const [agendaMostrarTodos, setAgendaMostrarTodos] = useState({ atrasadas: false, hoje: false, proximos: false });
    // Melhoria isolada "Botão Atualizar no Dashboard" (2026-08-25): mesmo
    // padrão já usado no Pipeline (ver carregarDados/aoClicarAtualizar em
    // Pipeline.js) — o corpo do carregamento (antes só dentro do useEffect
    // de montagem) virou uma função reaproveitável, chamada tanto na
    // montagem quanto pelo clique manual no botão "Atualizar". `comSpinner`
    // distingue a tela cheia de "Carregando dashboard..." (só na primeira
    // carga) de uma atualização silenciosa em segundo plano (spinner
    // discreto no botão via `atualizando`, sem esconder cards/filtros já
    // visíveis, sem recarregar a página). Investigação prévia (pedida
    // antes de implementar): o Dashboard não tem hoje nenhum mecanismo de
    // atualização automática (ao contrário do Pipeline, que tem um
    // setInterval de 3 minutos — ver Pipeline.js) — esta melhoria não cria
    // nenhum auto-refresh novo nem mexe em periodicidade nenhuma, só
    // adiciona a atualização manual pedida.
    const [atualizando, setAtualizando] = useState(false);
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
    const carregarDados = useCallback((comSpinner) => {
        if (!idToken)
            return Promise.resolve();
        if (comSpinner)
            setCarregando(true);
        else
            setAtualizando(true);
        return Promise.all([
            listEtapas(idToken),
            listOportunidades(idToken),
            listUsuarios(idToken),
            listOrigens(idToken),
            listMotivosPerda(idToken),
            listClientes(idToken),
        ])
            .then(([etapasResp, oportunidadesResp, usuariosResp, origensResp, motivosPerdaResp, clientesResp]) => {
            setEtapas([...etapasResp].sort((a, b) => a.ordem - b.ordem));
            setOportunidades(oportunidadesResp);
            setUsuarios(usuariosResp);
            // Ciclo "Refinamentos Operacionais" (2026-08-18) — item 3: ordem
            // alfabética é só de exibição (ids/dados históricos intocados).
            setOrigens([...origensResp].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
            setMotivosPerda(motivosPerdaResp);
            setClientes(clientesResp);
            setUltimaAtualizacao(new Date());
            setErro(null);
        })
            .catch((e) => {
            // Mesmo bug/conserto já documentado em Pipeline.tsx: catch ausente
            // travava a tela em "carregando" para sempre.
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            // Mesmo critério já usado no Pipeline: uma atualização em
            // segundo plano que falhar não deve substituir os cards/
            // filtros já visíveis por uma mensagem de erro de tela cheia —
            // só a primeira carga (comSpinner) aciona o tratamento de erro
            // existente (`erro`, mesma mensagem/estilo de sempre). Fora
            // desse caso, nenhum estado de dado é tocado neste caminho, então
            // tudo que já estava na tela permanece exatamente como estava.
            if (comSpinner) {
                setErro("Não foi possível carregar o dashboard. Tente recarregar a página.");
            }
        })
            .finally(() => {
            if (comSpinner)
                setCarregando(false);
            else
                setAtualizando(false);
        });
    }, [idToken, logout]);
    useEffect(() => {
        carregarDados(true);
    }, [carregarDados]);
    // Clique manual do botão "Atualizar" — mesma proteção contra clique
    // duplo (ignora clique enquanto já há uma carga em andamento) já usada
    // no Pipeline (aoClicarAtualizar). Reaproveita carregarDados — nenhuma
    // segunda lógica de busca de dados foi criada.
    function aoClicarAtualizar() {
        if (atualizando || carregando)
            return;
        void carregarDados(false);
    }
    // Sprint 8 "Performance e Estabilidade" (2026-08-10): os mapas de nome,
    // o recorte filtrado e os 9 indicadores eram recalculados (várias
    // passagens completas sobre `oportunidades`, com sort/allocations) em
    // TODO render do Dashboard, mesmo quando nada que os afeta tinha
    // mudado. Agora ficam em useMemo, recalculando só quando a dependência
    // relevante muda de fato. Precisam ficar ANTES dos early-returns de
    // carregando/erro abaixo -- hooks não podem ser chamados depois de um
    // return condicional (React exige a mesma sequência de hooks em todo
    // render); como os estados começam vazios ([]), calcular em cima deles
    // antes dos dados chegarem é barato e inofensivo, e o resultado só é
    // usado depois que `carregando` vira false de qualquer forma.
    const nomesUsuarios = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nome])), [usuarios]);
    const nomesClientes = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);
    const nomesOrigens = useMemo(() => new Map(origens.map((o) => [o.id, o.nome])), [origens]);
    const nomesMotivos = useMemo(() => new Map(motivosPerda.map((m) => [m.id, m.nome])), [motivosPerda]);
    const nomesEtapas = useMemo(() => new Map(etapas.map((e) => [e.id, e.nome])), [etapas]);
    const ordemEtapas = useMemo(() => new Map(etapas.map((e) => [e.id, e.ordem])), [etapas]);
    const porOrdemDeEtapa = useMemo(() => (a, b) => (ordemEtapas.get(a) ?? 0) - (ordemEtapas.get(b) ?? 0), [ordemEtapas]);
    // Melhoria 6 "Filtro de período no Dashboard" (2026-10-07) — cada
    // indicador usa a data que responde à sua pergunta (ver utils/periodo.js):
    //   leads recebidos e "situação dos leads recebidos" (etapa/responsável/
    //   origem/conversão = COORTE DE ENTRADA) -> criado_em;
    //   vendas no período -> vendido_em; perdas (card, motivos, etapa) ->
    //   perdido_em das oportunidades hoje em Perdido;
    //   em aberto, ações vencidas/de hoje (e a Agenda) -> OPERACIONAIS, sem
    //   período. Origem e Responsável (carteira ATUAL) valem para todos.
    const etapasPorId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);
    const agoraStr = agoraSaoPaulo();
    const hojeStr = agoraStr.slice(0, 10);
    const periodo = useMemo(() => resolverPeriodo(filtroPeriodo, hojeStr, personalizadoInicio, personalizadoFim), [filtroPeriodo, hojeStr, personalizadoInicio, personalizadoFim]);
    const periodoValido = !periodo.erro;
    // Base comum: só Origem e Responsável (sem período).
    const oportunidadesFiltradas = useMemo(() => oportunidades.filter((o) => {
        if (filtroResponsavelId && o.responsavelId !== filtroResponsavelId)
            return false;
        if (filtroOrigemId && o.origemId !== filtroOrigemId)
            return false;
        return true;
    }), [oportunidades, filtroResponsavelId, filtroOrigemId]);
    const abertas = useMemo(() => oportunidadesFiltradas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "ativa"), [oportunidadesFiltradas, etapasPorId]);
    const recebidas = useMemo(() => (periodoValido ? oportunidadesFiltradas.filter((o) => dentroDoPeriodo(o.criadoEm, periodo)) : []), [oportunidadesFiltradas, periodo, periodoValido]);
    const vendas = useMemo(() => (periodoValido ? oportunidadesFiltradas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "ganho" && dentroDoPeriodo(o.vendidoEm, periodo)) : []), [oportunidadesFiltradas, etapasPorId, periodo, periodoValido]);
    const perdidas = useMemo(() => (periodoValido ? oportunidadesFiltradas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "perdido" && dentroDoPeriodo(o.perdidoEm, periodo)) : []), [oportunidadesFiltradas, etapasPorId, periodo, periodoValido]);
    const coorteVendidas = recebidas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "ganho").length;
    const coorteEmAberto = recebidas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "ativa").length;
    const taxaConversao = recebidas.length > 0 ? coorteVendidas / recebidas.length : null;
    // Hotfix 2026-08-18: comparação precisa ser ciente de HORÁRIO (não só
    // data), senão uma ação de hoje já vencida (ex.: hoje 09:00, agora
    // 14:00) nunca cai em "vencidas" — sempre empata em "hoje". Construído
    // a partir do horário LOCAL do navegador (não toISOString/UTC) porque
    // proximaAcaoData é salvo como texto local "YYYY-MM-DDTHH:mm"
    // (normalizarProximaAcaoData_, backend). Comparação puramente textual
    // (sem `new Date(string)`) para não reintroduzir bugs de fuso horário.
    // Registros antigos sem horário (10 caracteres, só "YYYY-MM-DD")
    // mantêm o comportamento anterior de comparação só por data.
    // Melhoria 5 (2026-10-07): "agora" passa a vir do fuso America/Sao_Paulo
    // (agoraSaoPaulo, utils/agenda.js) em vez do relógio local do navegador —
    // mesmo formato textual "YYYY-MM-DDTHH:mm" de antes, só a fonte do
    // relógio mudou, para os cards e a agenda nunca divergirem por fuso.
    const acoesVencidas = useMemo(() => abertas
        .filter((o) => {
            const d = o.proximaAcaoData;
            if (!d)
                return false;
            return d.length > 10 ? d.slice(0, 16) < agoraStr : d.slice(0, 10) < hojeStr;
        })
        .sort((a, b) => (a.proximaAcaoData ?? "").localeCompare(b.proximaAcaoData ?? "")), [abertas, agoraStr, hojeStr]);
    const acoesDoDia = useMemo(() => abertas.filter((o) => {
        const d = o.proximaAcaoData;
        if (!d)
            return false;
        return d.length > 10 ? d.slice(0, 10) === hojeStr && d.slice(0, 16) >= agoraStr : d.slice(0, 10) === hojeStr;
    }), [abertas, hojeStr, agoraStr]);
    // Melhoria 5: agenda operacional. Montada só com as oportunidades já
    // carregadas (nenhuma chamada nova ao backend) — a visibilidade
    // (Gerente/Administrador/visualiza_todas_oportunidades = tudo; demais =
    // carteira) já foi aplicada por listOportunidades_ no servidor. Só
    // etapas "ativa" geram itens; ações concluídas já não existem nos dados.
    const podeFiltrarAgenda = !!(usuario && (usuario.papel === "Gerente (Owner)" || usuario.papel === "Administrador" || usuario.visualizaTodasOportunidades));
    const usuariosAtivos = useMemo(() => usuarios.filter((u) => u.ativo), [usuarios]);
    const filtroAgendaEfetivo = podeFiltrarAgenda && usuariosAtivos.some((u) => u.id === agendaRespId) ? agendaRespId : "";
    const agenda = useMemo(() => montarAgenda(oportunidades, etapasPorId, { agoraStr, filtroResponsavelId: filtroAgendaEfetivo }), [oportunidades, etapasPorId, agoraStr, filtroAgendaEfetivo]);
    const porEtapa = useMemo(() => agruparContagem(recebidas, (o) => o.etapaId, nomesEtapas, porOrdemDeEtapa), [recebidas, nomesEtapas, porOrdemDeEtapa]);
    const porResponsavel = useMemo(() => agruparContagem(recebidas, (o) => o.responsavelId, nomesUsuarios), [recebidas, nomesUsuarios]);
    const porOrigem = useMemo(() => agruparContagem(recebidas, (o) => o.origemId, nomesOrigens), [recebidas, nomesOrigens]);
    const motivosDePerda = useMemo(() => agruparContagem(perdidas, (o) => o.motivoPerdaId, nomesMotivos), [perdidas, nomesMotivos]);
    const perdasPorEtapa = useMemo(() => agruparContagem(perdidas, (o) => o.etapaOrigemPerdaId, nomesEtapas, porOrdemDeEtapa), [perdidas, nomesEtapas, porOrdemDeEtapa]);
    const maiorPorEtapa = Math.max(1, ...porEtapa.map((l) => l.quantidade));
    const maiorPorResponsavel = Math.max(1, ...porResponsavel.map((l) => l.quantidade));
    const maiorPorOrigem = Math.max(1, ...porOrigem.map((l) => l.quantidade));
    const maiorMotivo = Math.max(1, ...motivosDePerda.map((l) => l.quantidade));
    const maiorPerdaEtapa = Math.max(1, ...perdasPorEtapa.map((l) => l.quantidade));
    if (carregando)
        return _jsx("p", { className: "pipeline-loading", children: "Carregando dashboard..." });
    if (erro)
        return _jsx("p", { className: "pipeline-loading", children: erro });
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("div", { className: "dashboard__cabecalho", children: [_jsxs("h1", { children: ["Ol\u00E1, ", primeiroNome(usuario?.nome) || "—"] }), _jsxs("div", { className: "pipeline__topo-direita", children: [_jsx("button", { className: "pipeline__botao-atualizar", onClick: aoClicarAtualizar, disabled: atualizando || carregando, children: atualizando ? "Atualizando\u2026" : "\u21BB Atualizar" }), ultimaAtualizacao && (_jsxs("span", { className: "pipeline__ultima-atualizacao", children: ["Atualizado \u00E0s ", formatarHoraCurta(ultimaAtualizacao)] })), onNovaNegociacao && (_jsx("button", { className: "pipeline__botao-nova", onClick: onNovaNegociacao, children: "+ Nova Negocia\u00E7\u00E3o" }))]})] }), _jsx("p", { className: "dashboard__subtitulo", children: "Painel gerencial \u2014 vis\u00E3o di\u00E1ria da opera\u00E7\u00E3o comercial." }), _jsxs("div", { className: "dashboard__filtros", children: [_jsxs("label", { children: ["Per\u00EDodo", _jsx("select", { value: filtroPeriodo, onChange: (e) => { const v = e.target.value; setFiltroPeriodo(v); if (v === "personalizado" && !personalizadoInicio && !personalizadoFim) { setPersonalizadoInicio(`${hojeStr.slice(0, 8)}01`); setPersonalizadoFim(hojeStr); } }, children: OPCOES_PERIODO.map((o) => (_jsx("option", { value: o.valor, children: o.rotulo }, o.valor))) })] }), ...(filtroPeriodo === "personalizado" ? [_jsxs("label", { children: ["Data inicial", _jsx("input", { type: "date", value: personalizadoInicio, onChange: (e) => setPersonalizadoInicio(e.target.value), "aria-label": "Data inicial do período", "aria-invalid": !periodoValido })] }, "pers-ini"), _jsxs("label", { children: ["Data final", _jsx("input", { type: "date", value: personalizadoFim, onChange: (e) => setPersonalizadoFim(e.target.value), "aria-label": "Data final do período", "aria-invalid": !periodoValido })] }, "pers-fim")] : []), _jsxs("label", { children: ["Respons\u00E1vel", _jsxs("select", { value: filtroResponsavelId, onChange: (e) => setFiltroResponsavelId(e.target.value), children: [_jsx("option", { value: "", children: "Todos os respons\u00E1veis" }), usuarios.map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] })] }), _jsxs("label", { children: ["Origem", _jsxs("select", { value: filtroOrigemId, onChange: (e) => setFiltroOrigemId(e.target.value), children: [_jsx("option", { value: "", children: "Todas as origens" }), origens.map((o) => (_jsx("option", { value: o.id, children: o.nome }, o.id)))] })] })] }), _jsxs("div", { className: "dashboard__periodo-info", children: [periodoValido ? (_jsxs("span", { children: ["Per\u00EDodo analisado: ", descreverPeriodo(periodo), filtroPeriodo !== "todos" ? " (fuso America/Sao_Paulo)" : ""] })) : (_jsx("span", { className: "dashboard__aviso dashboard__aviso--erro", role: "alert", children: periodo.erro })), periodoValido && periodoAlcancaVendasSemData(periodo) && (_jsx("span", { className: "dashboard__aviso", children: "O hist\u00F3rico de vendas anterior a 24/08/2026 pode estar incompleto (a data da venda s\u00F3 \u00E9 registrada desde essa data)." }))] }), _jsxs("div", { className: "dashboard__cards dashboard__cards--analiticos", children: [_jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Leads recebidos" }), _jsx("strong", { className: "dashboard__card-valor", children: periodoValido ? recebidas.length : "\u2014" }), _jsx("span", { className: "dashboard__card-sub", children: "criados no per\u00EDodo" })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Vendas no per\u00EDodo" }), _jsx("strong", { className: "dashboard__card-valor", children: periodoValido ? vendas.length : "\u2014" }), _jsx("span", { className: "dashboard__card-sub", children: "data da venda no per\u00EDodo" })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Convers\u00E3o da coorte" }), _jsx("strong", { className: "dashboard__card-valor", children: periodoValido ? taxaConversao === null ? "\u2014" : `${(taxaConversao * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "\u2014" }), _jsx("span", { className: "dashboard__card-sub", children: periodoValido ? `${coorteVendidas} de ${recebidas.length} leads recebidos \u00B7 ${coorteEmAberto} ainda em aberto` : "" })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Negocia\u00E7\u00F5es perdidas" }), _jsx("strong", { className: "dashboard__card-valor", children: periodoValido ? perdidas.length : "\u2014" }), _jsx("span", { className: "dashboard__card-sub", children: "perda registrada no per\u00EDodo" })] })] }), _jsxs("div", { className: "dashboard__cards", children: [_jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Negocia\u00E7\u00F5es em aberto" }), _jsx("strong", { className: "dashboard__card-valor", children: abertas.length }), _jsx("span", { className: "dashboard__card-sub", children: "agora (n\u00E3o depende do per\u00EDodo)" })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Pr\u00F3ximas a\u00E7\u00F5es vencidas" }), _jsx("strong", { className: "dashboard__card-valor", children: acoesVencidas.length }), _jsx("span", { className: "dashboard__card-sub", children: "agora" })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Pr\u00F3ximas a\u00E7\u00F5es de hoje" }), _jsx("strong", { className: "dashboard__card-valor", children: acoesDoDia.length }), _jsx("span", { className: "dashboard__card-sub", children: "agora" })] })] }), _jsxs("section", { className: "dashboard__secao agenda", "aria-label": "Agenda de pr\u00F3ximas a\u00E7\u00F5es", children: [_jsxs("div", { className: "agenda__cabecalho", children: [_jsx("h2", { className: "dashboard__secao-titulo agenda__titulo", children: "Agenda" }), podeFiltrarAgenda && (_jsxs("select", { className: "agenda__filtro", value: filtroAgendaEfetivo, onChange: (e) => setAgendaRespId(e.target.value), "aria-label": "Filtrar agenda por respons\u00E1vel", children: [_jsx("option", { value: "", children: "Todos os respons\u00E1veis" }), usuariosAtivos.map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] }))] }), GRUPOS_AGENDA.map((g) => {
                const itens = agenda[g.chave];
                const visiveis = agendaMostrarTodos[g.chave] ? itens : itens.slice(0, LIMITE_INICIAL_AGENDA);
                return (_jsxs("div", { className: `agenda__grupo agenda__grupo--${g.chave}`, children: [_jsxs("h3", { className: "agenda__grupo-titulo", children: [g.rotulo, _jsx("span", { className: "agenda__grupo-contagem", children: itens.length })] }), itens.length === 0 ? (_jsx("p", { className: "agenda__vazio", children: g.vazio })) : (_jsx("ul", { className: "dashboard__lista-acoes agenda__lista", children: visiveis.map(({ oportunidade: o, respAcaoId, dataAcao }) => {
                                const hora = horaCurta(dataAcao);
                                const quando = g.chave === "hoje" ? hora || "Dia todo" : `${dataCurta(dataAcao)}${hora ? ` ${hora}` : ""}`;
                                const abrir = onAbrirOportunidade ? () => onAbrirOportunidade(o.id) : undefined;
                                return (_jsxs("li", { className: onAbrirOportunidade ? "dashboard__lista-acoes-item--clicavel agenda__item" : "agenda__item", onClick: abrir, onKeyDown: abrir ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } } : undefined, role: abrir ? "button" : undefined, tabIndex: abrir ? 0 : undefined, children: [_jsx("span", { className: "agenda__quando", children: quando }), _jsxs("span", { className: "agenda__corpo", children: [_jsx("span", { className: "dashboard__lista-acoes-principal", children: descricaoProximaAcao(o) || "Sem descri\u00E7\u00E3o" }), _jsxs("span", { className: "dashboard__lista-acoes-detalhe", children: [nomesClientes.get(o.clienteId) ?? "Cliente n\u00E3o identificado", o.veiculoInteresse ? ` \u2014 ${o.veiculoInteresse}` : ""] }), _jsxs("span", { className: "dashboard__lista-acoes-detalhe", children: ["Respons\u00E1vel: ", nomesUsuarios.get(respAcaoId) ?? "\u2014"] })] })] }, o.id));
                            }) })), itens.length > LIMITE_INICIAL_AGENDA && !agendaMostrarTodos[g.chave] && (_jsx("button", { type: "button", className: "agenda__ver-mais", onClick: () => setAgendaMostrarTodos((prev) => ({ ...prev, [g.chave]: true })), children: `Ver mais (${itens.length - LIMITE_INICIAL_AGENDA})` }))] }, g.chave));
            })] }), _jsxs("div", { className: "dashboard__grade-indicadores", children: [_jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Situa\u00E7\u00E3o dos leads recebidos no per\u00EDodo" }), _jsx(ListaContagem, { linhas: porEtapa, maior: maiorPorEtapa, vazio: "Sem negocia\u00E7\u00F5es no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Leads recebidos por respons\u00E1vel atual" }), _jsx(ListaContagem, { linhas: porResponsavel, maior: maiorPorResponsavel, vazio: "Sem negocia\u00E7\u00F5es no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Leads recebidos por origem" }), _jsx(ListaContagem, { linhas: porOrigem, maior: maiorPorOrigem, vazio: "Sem negocia\u00E7\u00F5es no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Motivos de perda (perdas no per\u00EDodo)" }), _jsx(ListaContagem, { linhas: motivosDePerda, maior: maiorMotivo, vazio: "Sem perdas no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Perdas por etapa (perdas no per\u00EDodo)" }), _jsx(ListaContagem, { linhas: perdasPorEtapa, maior: maiorPerdaEtapa, vazio: "Sem perdas no recorte atual." })] })] }), _jsx("button", { className: "dashboard__cta", onClick: onIrPipeline, children: "Ver Pipeline completo \u2192" })] }));
}
// Lista "rótulo — barra proporcional — quantidade", reaproveitada pelos
// cinco indicadores de distribuição. Mantém a interface deliberadamente
// simples (sem biblioteca de gráficos) — pedido explícito do CEO nesta
// Sprint: clareza e confiabilidade antes de refinamento visual.
function ListaContagem({ linhas, maior, vazio }) {
    if (linhas.length === 0)
        return _jsx("p", { className: "dashboard__vazio", children: vazio });
    return (_jsx("ul", { className: "dashboard__lista-contagem", children: linhas.map((linha) => (_jsxs("li", { children: [_jsx("span", { className: "dashboard__lista-contagem-rotulo", children: linha.rotulo }), _jsx("span", { className: "dashboard__lista-contagem-barra", children: _jsx("span", { className: "dashboard__lista-contagem-barra-preenchida", style: { width: `${Math.max(4, Math.round((linha.quantidade / maior) * 100))}%` } }) }), _jsx("span", { className: "dashboard__lista-contagem-valor", children: linha.quantidade })] }, linha.chave))) }));
}
