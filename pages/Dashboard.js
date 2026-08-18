import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { listClientes, listEtapas, listMotivosPerda, listOportunidades, listOrigens, listUsuarios } from "../services/oportunidades.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { primeiroNome } from "../utils/nomes.js";
import { descricaoProximaAcao } from "../utils/proximaAcao.js";
const OPCOES_PERIODO = [
    { valor: "todos", rotulo: "Todo o período" },
    { valor: "hoje", rotulo: "Hoje" },
    { valor: "7d", rotulo: "Últimos 7 dias" },
    { valor: "30d", rotulo: "Últimos 30 dias" },
    { valor: "mes", rotulo: "Este mês" },
];
function dentroDoPeriodo(dataIso, periodo) {
    if (periodo === "todos")
        return true;
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime()))
        return true; // dado sem data não deve sumir do dashboard por um bug de parsing
    const agora = new Date();
    if (periodo === "hoje")
        return data.toDateString() === agora.toDateString();
    if (periodo === "mes")
        return data.getFullYear() === agora.getFullYear() && data.getMonth() === agora.getMonth();
    const dias = periodo === "7d" ? 7 : 30;
    const corte = new Date(agora);
    corte.setDate(corte.getDate() - dias);
    return data >= corte;
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
    useEffect(() => {
        if (!idToken)
            return;
        Promise.all([
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
        })
            .catch((e) => {
            // Mesmo bug/conserto já documentado em Pipeline.tsx: catch ausente
            // travava a tela em "carregando" para sempre.
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErro("Não foi possível carregar o dashboard. Tente recarregar a página.");
        })
            .finally(() => setCarregando(false));
    }, [idToken, logout]);
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
    // Filtro único aplicado antes de calcular qualquer indicador — garante
    // que todos os números do dashboard vêm do mesmo recorte de dados
    // (critério de aceite: "os números permanecerem consistentes com o
    // Pipeline" — sem filtro nenhum, "por etapa" abaixo bate exatamente com
    // a contagem de cada coluna do Pipeline).
    const oportunidadesFiltradas = useMemo(() => oportunidades.filter((o) => {
        if (filtroResponsavelId && o.responsavelId !== filtroResponsavelId)
            return false;
        if (filtroOrigemId && o.origemId !== filtroOrigemId)
            return false;
        if (!dentroDoPeriodo(o.criadoEm, filtroPeriodo))
            return false;
        return true;
    }), [oportunidades, filtroResponsavelId, filtroOrigemId, filtroPeriodo]);
    const etapasPorId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);
    const abertas = useMemo(() => oportunidadesFiltradas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "ativa"), [oportunidadesFiltradas, etapasPorId]);
    const perdidas = useMemo(() => oportunidadesFiltradas.filter((o) => etapasPorId.get(o.etapaId)?.tipo === "perdido"), [oportunidadesFiltradas, etapasPorId]);
    // Hotfix 2026-08-18: comparação precisa ser ciente de HORÁRIO (não só
    // data), senão uma ação de hoje já vencida (ex.: hoje 09:00, agora
    // 14:00) nunca cai em "vencidas" — sempre empata em "hoje". Construído
    // a partir do horário LOCAL do navegador (não toISOString/UTC) porque
    // proximaAcaoData é salvo como texto local "YYYY-MM-DDTHH:mm"
    // (normalizarProximaAcaoData_, backend). Comparação puramente textual
    // (sem `new Date(string)`) para não reintroduzir bugs de fuso horário.
    // Registros antigos sem horário (10 caracteres, só "YYYY-MM-DD")
    // mantêm o comportamento anterior de comparação só por data.
    const pad2 = (n) => String(n).padStart(2, "0");
    const agora = new Date();
    const agoraStr = `${agora.getFullYear()}-${pad2(agora.getMonth() + 1)}-${pad2(agora.getDate())}T${pad2(agora.getHours())}:${pad2(agora.getMinutes())}`;
    const hojeStr = agoraStr.slice(0, 10);
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
    const porEtapa = useMemo(() => agruparContagem(oportunidadesFiltradas, (o) => o.etapaId, nomesEtapas, porOrdemDeEtapa), [oportunidadesFiltradas, nomesEtapas, porOrdemDeEtapa]);
    const porResponsavel = useMemo(() => agruparContagem(oportunidadesFiltradas, (o) => o.responsavelId, nomesUsuarios), [oportunidadesFiltradas, nomesUsuarios]);
    const porOrigem = useMemo(() => agruparContagem(oportunidadesFiltradas, (o) => o.origemId, nomesOrigens), [oportunidadesFiltradas, nomesOrigens]);
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
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("div", { className: "dashboard__cabecalho", children: [_jsxs("h1", { children: ["Ol\u00E1, ", primeiroNome(usuario?.nome) || "—"] }), onNovaNegociacao && (_jsx("button", { className: "pipeline__botao-nova", onClick: onNovaNegociacao, children: "+ Nova Negocia\u00E7\u00E3o" }))] }), _jsx("p", { className: "dashboard__subtitulo", children: "Painel gerencial \u2014 vis\u00E3o di\u00E1ria da opera\u00E7\u00E3o comercial." }), _jsxs("div", { className: "dashboard__filtros", children: [_jsxs("label", { children: ["Per\u00EDodo", _jsx("select", { value: filtroPeriodo, onChange: (e) => setFiltroPeriodo(e.target.value), children: OPCOES_PERIODO.map((o) => (_jsx("option", { value: o.valor, children: o.rotulo }, o.valor))) })] }), _jsxs("label", { children: ["Respons\u00E1vel", _jsxs("select", { value: filtroResponsavelId, onChange: (e) => setFiltroResponsavelId(e.target.value), children: [_jsx("option", { value: "", children: "Todos os respons\u00E1veis" }), usuarios.map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] })] }), _jsxs("label", { children: ["Origem", _jsxs("select", { value: filtroOrigemId, onChange: (e) => setFiltroOrigemId(e.target.value), children: [_jsx("option", { value: "", children: "Todas as origens" }), origens.map((o) => (_jsx("option", { value: o.id, children: o.nome }, o.id)))] })] })] }), _jsxs("div", { className: "dashboard__cards", children: [_jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Negocia\u00E7\u00F5es em aberto" }), _jsx("strong", { className: "dashboard__card-valor", children: abertas.length })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Negocia\u00E7\u00F5es perdidas" }), _jsx("strong", { className: "dashboard__card-valor", children: perdidas.length })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Pr\u00F3ximas a\u00E7\u00F5es vencidas" }), _jsx("strong", { className: "dashboard__card-valor", children: acoesVencidas.length })] }), _jsxs("div", { className: "dashboard__card", children: [_jsx("span", { className: "dashboard__card-label", children: "Pr\u00F3ximas a\u00E7\u00F5es de hoje" }), _jsx("strong", { className: "dashboard__card-valor", children: acoesDoDia.length })] })] }), acoesVencidas.length > 0 && (_jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Pr\u00F3ximas a\u00E7\u00F5es vencidas" }), _jsx("ul", { className: "dashboard__lista-acoes", children: acoesVencidas.map((o) => {
                            // Sprint 7 "Próximas Ações" (2026-08-07) — descrição
                            // estruturada (tipo/"Outro") com fallback pro texto legado, e
                            // responsável DA AÇÃO (pode ser diferente do responsável da
                            // oportunidade — ver proximaAcaoResponsavelId em types/index.ts).
                            const respAcaoId = o.proximaAcaoResponsavelId || o.responsavelId;
                            const dataAcao = o.proximaAcaoData ?? "";
                            const hora = dataAcao.length > 10 ? dataAcao.slice(11, 16) : "";
                            return (_jsxs("li", { className: onAbrirOportunidade ? "dashboard__lista-acoes-item--clicavel" : undefined, onClick: onAbrirOportunidade ? () => onAbrirOportunidade(o.id) : undefined, role: onAbrirOportunidade ? "button" : undefined, tabIndex: onAbrirOportunidade ? 0 : undefined, children: [_jsxs("span", { className: "dashboard__lista-acoes-principal", children: [nomesClientes.get(o.clienteId) ?? "Cliente não identificado", " \u00B7 ", o.veiculoInteresse] }), _jsxs("span", { className: "dashboard__lista-acoes-detalhe", children: [descricaoProximaAcao(o) || "Sem descrição", " \u00B7 ", nomesUsuarios.get(respAcaoId) ?? "—", " \u00B7 venceu em", " ", dataAcao.slice(0, 10), hora ? ` às ${hora}` : ""] })] }, o.id));
                        }) })] })), acoesDoDia.length > 0 && (_jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Pr\u00F3ximas a\u00E7\u00F5es de hoje" }), _jsx("ul", { className: "dashboard__lista-acoes", children: acoesDoDia.map((o) => {
                            const respAcaoId = o.proximaAcaoResponsavelId || o.responsavelId;
                            const dataAcao = o.proximaAcaoData ?? "";
                            const hora = dataAcao.length > 10 ? dataAcao.slice(11, 16) : "";
                            return (_jsxs("li", { className: onAbrirOportunidade ? "dashboard__lista-acoes-item--clicavel" : undefined, onClick: onAbrirOportunidade ? () => onAbrirOportunidade(o.id) : undefined, role: onAbrirOportunidade ? "button" : undefined, tabIndex: onAbrirOportunidade ? 0 : undefined, children: [_jsxs("span", { className: "dashboard__lista-acoes-principal", children: [nomesClientes.get(o.clienteId) ?? "Cliente não identificado", " \u00B7 ", o.veiculoInteresse] }), _jsxs("span", { className: "dashboard__lista-acoes-detalhe", children: [descricaoProximaAcao(o) || "Sem descrição", " \u00B7 ", nomesUsuarios.get(respAcaoId) ?? "—", hora ? ` · ${hora}` : ""] })] }, o.id));
                        }) })] })), _jsxs("div", { className: "dashboard__grade-indicadores", children: [_jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Negocia\u00E7\u00F5es por etapa" }), _jsx(ListaContagem, { linhas: porEtapa, maior: maiorPorEtapa, vazio: "Sem negocia\u00E7\u00F5es no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Negocia\u00E7\u00F5es por respons\u00E1vel" }), _jsx(ListaContagem, { linhas: porResponsavel, maior: maiorPorResponsavel, vazio: "Sem negocia\u00E7\u00F5es no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Negocia\u00E7\u00F5es por origem" }), _jsx(ListaContagem, { linhas: porOrigem, maior: maiorPorOrigem, vazio: "Sem negocia\u00E7\u00F5es no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Motivos de perda" }), _jsx(ListaContagem, { linhas: motivosDePerda, maior: maiorMotivo, vazio: "Sem perdas no recorte atual." })] }), _jsxs("section", { className: "dashboard__secao", children: [_jsx("h2", { className: "dashboard__secao-titulo", children: "Perdas por etapa" }), _jsx(ListaContagem, { linhas: perdasPorEtapa, maior: maiorPerdaEtapa, vazio: "Sem perdas no recorte atual." })] })] }), _jsx("button", { className: "dashboard__cta", onClick: onIrPipeline, children: "Ver Pipeline completo \u2192" })] }));
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
