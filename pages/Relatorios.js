import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listClientes, listEtapas, listMotivosPerda, listOportunidades, listOrigens, listUsuarios } from "../services/oportunidades.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { agoraSaoPaulo } from "../utils/agenda.js";
import { OPCOES_PERIODO, resolverPeriodo } from "../utils/periodo.js";
import { FILTROS_INICIAIS, TAMANHOS_PAGINA, TAMANHO_PAGINA_PADRAO, TIPOS_DATA, acaoVencida, avisosRelatorio, colunas, dadosDoTipo, descricaoRecorte, dimensaoEfetiva, dimensoesResumo, filtrarLinhas, gerarCsv, montarLinhas, motivoEfetivo, motivoHabilitado, nomeArquivoCsv, opcoesResponsavel, opcoesSituacao, ordenarLinhas, paginar, resumir, situacaoEfetiva, situacaoTravada, } from "../utils/relatorios.js";
// Melhoria 7 "Relatórios" (2026-10-07) — V1.
//
// Tela única: Filtros -> Resumo -> quantidade + Exportar CSV -> Tabela
// paginada -> Paginação. Uma linha = uma oportunidade.
//
// Fonte única dos números: `selecionadas` (filtradas e ordenadas) alimenta o
// Resumo, a Tabela (fatia da página) e o CSV (conjunto inteiro). Não existe
// segunda contagem em lugar nenhum — por construção os três batem.
//
// Toda a lógica (filtro, ordenação, resumo, colunas, CSV) está em
// utils/relatorios.js, sem React nem rede, para poder ir ao backend quando o
// volume pedir (ver backlog: revisar a estratégia por volta de 5.000
// oportunidades). Esta tela só carrega os dados (mesmas leituras já
// protegidas pelo backend: Gerente/Administrador/visualiza_todas_oportunidades
// veem tudo; os demais, só a própria carteira) e desenha o resultado.
function formatarHoraCurta(data) {
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatarPercentual(fracao) {
    return `${(fracao * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}
function formatarNumero(n) {
    return n.toLocaleString("pt-BR");
}
// Filtros em memória (não em storage): voltar do Pipeline para os Relatórios
// mantém o recorte. Descartado ao trocar de usuário.
let estadoSalvo = null;
function baixarCsv(texto, nomeArquivo) {
    const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Relatorios({ onAbrirOportunidade }) {
    const { usuario, idToken, logout } = useAuth();
    const [etapas, setEtapas] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [origens, setOrigens] = useState([]);
    const [motivosPerda, setMotivosPerda] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [atualizando, setAtualizando] = useState(false);
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
    const [erro, setErro] = useState(null);
    const salvo = estadoSalvo && estadoSalvo.usuarioId === usuario?.id ? estadoSalvo : null;
    const [filtros, setFiltros] = useState(salvo?.filtros ?? FILTROS_INICIAIS);
    const [pagina, setPagina] = useState(salvo?.pagina ?? 1);
    const [tamanhoPagina, setTamanhoPagina] = useState(salvo?.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO);
    const [dimensao, setDimensao] = useState(salvo?.dimensao ?? "");
    useEffect(() => {
        estadoSalvo = { usuarioId: usuario?.id, filtros, pagina, tamanhoPagina, dimensao };
    }, [usuario?.id, filtros, pagina, tamanhoPagina, dimensao]);
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
            .then(([etapasResp, oportunidadesResp, usuariosResp, origensResp, motivosResp, clientesResp]) => {
            setEtapas([...etapasResp].sort((a, b) => a.ordem - b.ordem));
            setOportunidades(oportunidadesResp);
            setUsuarios(usuariosResp);
            setOrigens([...origensResp].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
            setMotivosPerda([...motivosResp].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
            setClientes(clientesResp);
            setUltimaAtualizacao(new Date());
            setErro(null);
        })
            .catch((e) => {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            // Atualização em segundo plano que falha não apaga o que já está na tela.
            if (comSpinner)
                setErro("Não foi possível carregar os relatórios. Tente recarregar a página.");
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
    function aoClicarAtualizar() {
        if (atualizando || carregando)
            return;
        void carregarDados(false);
    }
    // Mesma regra de visão completa já usada no Dashboard/backend (o backend é
    // quem de fato limita os dados; isto só decide o que faz sentido mostrar).
    const visaoGlobal = !!(usuario && (usuario.papel === "Gerente (Owner)" || usuario.papel === "Administrador" || usuario.visualizaTodasOportunidades));
    const refs = useMemo(() => ({
        etapasPorId: new Map(etapas.map((e) => [e.id, e])),
        clientesPorId: new Map(clientes.map((c) => [c.id, c])),
        usuariosPorId: new Map(usuarios.map((u) => [u.id, u])),
        origensPorId: new Map(origens.map((o) => [o.id, o])),
        motivosPorId: new Map(motivosPerda.map((m) => [m.id, m])),
    }), [etapas, clientes, usuarios, origens, motivosPerda]);
    const linhas = useMemo(() => montarLinhas(oportunidades, refs), [oportunidades, refs]);
    const agoraStr = agoraSaoPaulo();
    const hojeStr = agoraStr.slice(0, 10);
    const periodo = useMemo(() => resolverPeriodo(filtros.periodo, hojeStr, filtros.inicioPersonalizado, filtros.fimPersonalizado), [filtros.periodo, filtros.inicioPersonalizado, filtros.fimPersonalizado, hojeStr]);
    const periodoValido = !periodo.erro;
    const opcoesResp = useMemo(() => opcoesResponsavel(usuarios, linhas), [usuarios, linhas]);
    const opcoesSit = useMemo(() => opcoesSituacao(etapas), [etapas]);
    // Filtros efetivos: responsável só vale para quem tem visão global e se o
    // valor ainda existe na lista; o motivo só vale com situação "Perdido".
    const filtrosEf = useMemo(() => ({
        ...filtros,
        responsavelId: visaoGlobal && opcoesResp.some((o) => o.id === filtros.responsavelId) ? filtros.responsavelId : "",
        situacao: situacaoEfetiva(filtros.tipoData, filtros.situacao),
        motivoId: motivoEfetivo(filtros),
    }), [filtros, visaoGlobal, opcoesResp]);
    // ÚNICO conjunto: resumo, tabela e CSV saem daqui.
    const selecionadas = useMemo(() => ordenarLinhas(filtrarLinhas(linhas, filtrosEf, periodo), filtros.tipoData), [linhas, filtrosEf, periodo, filtros.tipoData]);
    const cols = useMemo(() => colunas(filtrosEf), [filtrosEf]);
    const dimensoes = dimensoesResumo(filtros.tipoData, visaoGlobal);
    const dimensaoAtual = dimensaoEfetiva(filtros.tipoData, dimensao, visaoGlobal);
    const resumo = useMemo(() => resumir(selecionadas, dimensaoAtual, refs.etapasPorId), [selecionadas, dimensaoAtual, refs]);
    const pag = paginar(selecionadas.length, pagina, tamanhoPagina);
    const visiveis = selecionadas.slice(pag.inicio, pag.fim);
    const avisos = avisosRelatorio(filtrosEf, periodo);
    const tipo = dadosDoTipo(filtros.tipoData);
    const travada = situacaoTravada(filtros.tipoData);
    // Qualquer mudança de filtro volta para a página 1.
    function alterar(mudancas) {
        setFiltros((f) => ({ ...f, ...mudancas }));
        setPagina(1);
    }
    function aoMudarPeriodo(valor) {
        const mudancas = { periodo: valor };
        if (valor === "personalizado" && !filtros.inicioPersonalizado && !filtros.fimPersonalizado) {
            mudancas.inicioPersonalizado = `${hojeStr.slice(0, 8)}01`;
            mudancas.fimPersonalizado = hojeStr;
        }
        alterar(mudancas);
    }
    function aoLimpar() {
        setFiltros(FILTROS_INICIAIS);
        setPagina(1);
    }
    function aoExportar() {
        if (!periodoValido || selecionadas.length === 0)
            return;
        baixarCsv(gerarCsv(selecionadas, cols), nomeArquivoCsv(filtrosEf, periodo));
    }
    if (carregando)
        return _jsx("p", { className: "relatorios__estado", children: "Carregando relat\u00F3rios\u2026" });
    if (erro)
        return _jsx("p", { className: "relatorios__estado relatorios__estado--erro", children: erro });
    const filtrosAlterados = JSON.stringify(filtros) !== JSON.stringify(FILTROS_INICIAIS);
    const situacaoValor = travada ? situacaoEfetiva(filtros.tipoData, filtros.situacao) : filtros.situacao;
    const motivoAtivo = motivoHabilitado(filtros.tipoData, filtros.situacao);
    const labelResumo = (dimensoes.find((d) => d.valor === dimensaoAtual) ?? dimensoes[0]).rotulo;
    const maiorGrupo = Math.max(1, ...resumo.grupos.map((g) => g.total));
    function celula(coluna, l) {
        const vazio = _jsx("span", { className: "relatorios__vazio", children: "\u2014" });
        const texto = coluna.texto(l);
        switch (coluna.chave) {
            case "cliente":
                return onAbrirOportunidade
                    ? _jsx("button", { type: "button", className: "relatorios__link", onClick: () => onAbrirOportunidade(l.id), title: "Abrir oportunidade", children: texto || vazio })
                    : (texto || vazio);
            case "etapaStatus":
                return (_jsxs("span", { className: "relatorios__etapa", children: [_jsx("span", { children: l.status === "ativa" ? l.etapaNome : l.statusRotulo }), _jsx("span", { className: "relatorios__sub", children: l.status === "ativa" ? "Em aberto" : l.status === "perdido" && l.etapaPerdidaNome ? `Perdida em: ${l.etapaPerdidaNome}` : "" })] }));
            case "dataProximaAcao":
                if (!texto)
                    return vazio;
                return _jsx("span", { className: acaoVencida(l.proximaAcaoData, agoraStr) ? "relatorios__vencida" : "", children: texto });
            default:
                return texto ? texto : vazio;
        }
    }
    return (_jsxs("div", { className: "relatorios", children: [_jsxs("div", { className: "relatorios__cabecalho", children: [_jsxs("div", { children: [_jsx("h1", { children: "Relat\u00F3rios" }), _jsxs("p", { className: "relatorios__subtitulo", children: [visaoGlobal ? "Toda a operação" : "Sua carteira", " \u00B7 uma linha por oportunidade"] })] }), _jsxs("div", { className: "pipeline__topo-direita", children: [_jsx("button", { className: "pipeline__botao-atualizar", onClick: aoClicarAtualizar, disabled: atualizando || carregando, children: atualizando ? "Atualizando…" : "↻ Atualizar" }), ultimaAtualizacao && (_jsxs("span", { className: "pipeline__ultima-atualizacao", children: ["Atualizado \u00E0s ", formatarHoraCurta(ultimaAtualizacao)] }))] })] }), _jsxs("section", { className: "relatorios__filtros", "aria-label": "Filtros", children: [_jsxs("label", { children: ["Tipo de data", _jsx("select", { value: filtros.tipoData, onChange: (e) => alterar({ tipoData: e.target.value }), children: TIPOS_DATA.map((t) => (_jsx("option", { value: t.valor, children: t.rotulo }, t.valor))) })] }), _jsxs("label", { children: ["Per\u00EDodo", _jsx("select", { value: filtros.periodo, onChange: (e) => aoMudarPeriodo(e.target.value), children: OPCOES_PERIODO.map((o) => (_jsx("option", { value: o.valor, children: o.rotulo }, o.valor))) })] }), filtros.periodo === "personalizado" && (_jsxs(_Fragment, { children: [_jsxs("label", { children: ["Data inicial", _jsx("input", { type: "date", value: filtros.inicioPersonalizado, onChange: (e) => alterar({ inicioPersonalizado: e.target.value }), "aria-label": "Data inicial do per\u00EDodo", "aria-invalid": !periodoValido })] }), _jsxs("label", { children: ["Data final", _jsx("input", { type: "date", value: filtros.fimPersonalizado, onChange: (e) => alterar({ fimPersonalizado: e.target.value }), "aria-label": "Data final do per\u00EDodo", "aria-invalid": !periodoValido })] })] })), visaoGlobal && (_jsxs("label", { children: ["Respons\u00E1vel atual", _jsxs("select", { value: filtrosEf.responsavelId, onChange: (e) => alterar({ responsavelId: e.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), opcoesResp.map((o) => (_jsx("option", { value: o.id, children: o.rotulo }, o.id)))] })] })), _jsxs("label", { children: ["Origem", _jsxs("select", { value: filtros.origemId, onChange: (e) => alterar({ origemId: e.target.value }), children: [_jsx("option", { value: "", children: "Todas" }), origens.map((o) => (_jsx("option", { value: o.id, children: o.nome }, o.id)))] })] }), _jsxs("label", { children: ["Etapa / Status", _jsxs("select", { value: situacaoValor, disabled: travada, onChange: (e) => alterar({ situacao: e.target.value }), title: travada ? `Em "${tipo.rotulo}" o conjunto já é limitado a ${filtros.tipoData === "venda" ? "vendas" : "perdas"}.` : undefined, children: [_jsx("option", { value: "", children: "Todos" }), _jsx("optgroup", { label: "Status", children: opcoesSit.status.map((o) => (_jsx("option", { value: o.valor, children: o.rotulo }, o.valor))) }), _jsx("optgroup", { label: "Etapa (em aberto)", children: opcoesSit.etapas.map((o) => (_jsx("option", { value: o.valor, children: o.rotulo }, o.valor))) })] })] }), _jsxs("label", { children: ["Motivo da perda", _jsxs("select", { value: motivoAtivo ? filtros.motivoId : "", disabled: !motivoAtivo, onChange: (e) => alterar({ motivoId: e.target.value }), title: motivoAtivo ? undefined : "Disponível quando o Status é Perdido (ou o tipo de data é Perda).", children: [_jsx("option", { value: "", children: "Todos" }), motivosPerda.map((m) => (_jsx("option", { value: m.id, children: m.nome }, m.id)))] })] }), filtrosAlterados && (_jsx("button", { type: "button", className: "relatorios__limpar", onClick: aoLimpar, children: "Limpar filtros" }))] }), _jsxs("div", { className: "relatorios__info", children: [periodoValido
                        ? _jsx("span", { children: descricaoRecorte(filtrosEf, periodo) })
                        : _jsx("span", { className: "relatorios__aviso relatorios__aviso--erro", role: "alert", children: periodo.erro }), avisos.map((a) => (_jsx("span", { className: "relatorios__aviso", children: a }, a)))] }), _jsxs("section", { className: "relatorios__resumo", "aria-label": "Resumo", children: [_jsxs("div", { className: "relatorios__cards", children: [_jsxs("div", { className: "relatorios__card", children: [_jsx("span", { className: "relatorios__card-label", children: tipo.rotuloTotal }), _jsx("strong", { className: "relatorios__card-valor", children: periodoValido ? formatarNumero(resumo.total) : "—" })] }), filtros.tipoData === "entrada" && periodoValido && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relatorios__card", children: [_jsx("span", { className: "relatorios__card-label", children: "Em aberto agora" }), _jsx("strong", { className: "relatorios__card-valor", children: formatarNumero(resumo.porStatus.ativa) })] }), _jsxs("div", { className: "relatorios__card", children: [_jsx("span", { className: "relatorios__card-label", children: "Vendidas" }), _jsx("strong", { className: "relatorios__card-valor", children: formatarNumero(resumo.porStatus.ganho) })] }), _jsxs("div", { className: "relatorios__card", children: [_jsx("span", { className: "relatorios__card-label", children: "Perdidas" }), _jsx("strong", { className: "relatorios__card-valor", children: formatarNumero(resumo.porStatus.perdido) })] })] }))] }), periodoValido && resumo.total > 0 && (_jsxs("div", { className: "relatorios__agrupamento", children: [_jsxs("div", { className: "relatorios__agrupamento-topo", children: [_jsxs("h2", { children: ["Por ", labelResumo.toLowerCase()] }), dimensoes.length > 1 && (_jsxs("label", { children: ["Agrupar por", _jsx("select", { value: dimensaoAtual, onChange: (e) => setDimensao(e.target.value), children: dimensoes.map((d) => (_jsx("option", { value: d.valor, children: d.rotulo }, d.valor))) })] }))] }), _jsx("ul", { className: "relatorios__grupos", children: resumo.grupos.map((g) => (_jsxs("li", { children: [_jsx("span", { className: "relatorios__grupo-rotulo", children: g.rotulo }), _jsx("span", { className: "relatorios__grupo-barra", children: _jsx("span", { style: { width: `${Math.max(3, Math.round((g.total / maiorGrupo) * 100))}%` } }) }), _jsx("span", { className: "relatorios__grupo-valor", children: formatarNumero(g.total) }), _jsx("span", { className: "relatorios__grupo-pct", children: formatarPercentual(g.pct) })] }, g.chave || "_sem"))) })] }))] }), _jsxs("div", { className: "relatorios__barra", children: [_jsx("span", { className: "relatorios__contagem", "aria-live": "polite", children: periodoValido ? `${formatarNumero(selecionadas.length)} ${selecionadas.length === 1 ? "oportunidade encontrada" : "oportunidades encontradas"}` : "—" }), _jsxs("div", { className: "relatorios__barra-direita", children: [_jsxs("label", { children: ["Por p\u00E1gina", _jsx("select", { value: tamanhoPagina, onChange: (e) => { setTamanhoPagina(Number(e.target.value)); setPagina(1); }, children: TAMANHOS_PAGINA.map((n) => (_jsx("option", { value: n, children: n }, n))) })] }), _jsxs("button", { type: "button", className: "relatorios__exportar", onClick: aoExportar, disabled: !periodoValido || selecionadas.length === 0, title: "Exporta todas as oportunidades encontradas (n\u00E3o s\u00F3 a p\u00E1gina atual)", children: ["Exportar CSV", periodoValido && selecionadas.length > 0 ? ` (${formatarNumero(selecionadas.length)})` : ""] })] })] }), _jsx("div", { className: "relatorios__tabela-wrap", children: _jsxs("table", { className: "relatorios__tabela", children: [_jsx("thead", { children: _jsx("tr", { children: cols.map((c) => (_jsx("th", { scope: "col", children: c.rotulo }, c.chave))) }) }), _jsx("tbody", { children: visiveis.length === 0
                                ? (_jsx("tr", { children: _jsx("td", { className: "relatorios__sem-resultado", colSpan: cols.length, children: periodoValido ? "Nenhuma oportunidade encontrada para os filtros escolhidos." : "Ajuste o período para ver os resultados." }) }))
                                : visiveis.map((l) => (_jsx("tr", { children: cols.map((c) => (_jsx("td", { "data-rotulo": c.rotulo, children: celula(c, l) }, c.chave))) }, l.id))) })] }) }), selecionadas.length > 0 && (_jsxs("nav", { className: "relatorios__paginacao", "aria-label": "Pagina\u00E7\u00E3o", children: [_jsx("button", { type: "button", onClick: () => setPagina(pag.pagina - 1), disabled: pag.pagina <= 1, children: "\u2190 Anterior" }), _jsxs("span", { children: ["P\u00E1gina ", pag.pagina, " de ", pag.totalPaginas, " \u00B7 ", pag.inicio + 1, "\u2013", pag.fim, " de ", formatarNumero(selecionadas.length)] }), _jsx("button", { type: "button", onClick: () => setPagina(pag.pagina + 1), disabled: pag.pagina >= pag.totalPaginas, children: "Pr\u00F3xima \u2192" })] }))] }));
}
