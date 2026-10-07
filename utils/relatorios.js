// Melhoria 7 "Relatórios gerenciais e individuais" — V1 (2026-10-07).
//
// Funções PURAS (sem React, sem rede) da tela de Relatórios. Tudo que define
// QUAIS oportunidades entram no relatório, COMO são resumidas e COMO são
// exportadas vive aqui, para que a tela, o resumo e o CSV usem sempre o MESMO
// conjunto de linhas (regra fundamental da V1: resumo = tabela = CSV).
//
// Organização pensada para uma migração futura para o backend (quando a base
// se aproximar de ~5.000 oportunidades): o estado de filtros é um objeto
// simples e serializável (ver FILTROS_INICIAIS), e filtrar / ordenar /
// resumir / paginar são funções separadas e independentes de React. Mover
// período, filtros, paginação e agregações para o servidor significa
// reimplementar estas funções no Apps Script mantendo os mesmos parâmetros —
// a interface (pages/Relatorios.js) só consome os resultados.
//
// Permissões: este módulo NÃO decide quem enxerga o quê. A visibilidade
// (Gerente/Administrador/visualiza_todas_oportunidades = tudo; demais =
// carteira) já vem aplicada pelo backend em listOportunidades/listClientes.
//
// Qual data responde a qual pergunta (decisão de negócio, 2026-10-07):
//   Entrada -> criado_em   |   Venda -> vendido_em   |   Perda -> perdido_em
// Sem fallback e sem Timeline: se a data não existe, não é inventada.
// Dias civis sempre em America/Sao_Paulo (utils/periodo.js).
import { descreverPeriodo, dentroDoPeriodo, diaSaoPaulo, formatarDia, periodoAlcancaVendasSemData } from "./periodo.js";
import { descricaoProximaAcao } from "./proximaAcao.js";

export const TIPOS_DATA = [
    { valor: "entrada", rotulo: "Entrada", rotuloData: "Data de entrada", rotuloTotal: "Leads encontrados" },
    { valor: "venda", rotulo: "Venda", rotuloData: "Data da venda", rotuloTotal: "Vendas encontradas" },
    { valor: "perda", rotulo: "Perda", rotuloData: "Data da perda", rotuloTotal: "Perdas encontradas" },
];

export const STATUS_ROTULOS = { ativa: "Em aberto", ganho: "Venda", perdido: "Perdido" };

// Estado inicial dos filtros (decisão do Guilherme: Entrada + Todo o período).
// `situacao` combina Status e Etapa em um único campo:
//   "" (todos) | "status:ativa" | "status:ganho" | "status:perdido" | "etapa:<id>"
export const FILTROS_INICIAIS = {
    tipoData: "entrada",
    periodo: "todos",
    inicioPersonalizado: "",
    fimPersonalizado: "",
    responsavelId: "",
    origemId: "",
    situacao: "",
    motivoId: "",
};

export const TAMANHOS_PAGINA = [25, 50, 100];
export const TAMANHO_PAGINA_PADRAO = 50;

export function dadosDoTipo(tipoData) {
    return TIPOS_DATA.find((t) => t.valor === tipoData) ?? TIPOS_DATA[0];
}

// ---------------------------------------------------------------------------
// Coerência entre Tipo de data e Status
// ---------------------------------------------------------------------------

// Venda trabalha SÓ com oportunidades vendidas; Perda SÓ com perdidas. O
// Status/Etapa escolhido pelo usuário é ignorado (e a tela o trava) nesses
// tipos — assim é impossível montar "Venda + Perdido". Ao voltar para
// Entrada, a escolha anterior do usuário continua guardada no estado.
export function situacaoEfetiva(tipoData, situacao) {
    if (tipoData === "venda")
        return "status:ganho";
    if (tipoData === "perda")
        return "status:perdido";
    return situacao || "";
}

export function situacaoTravada(tipoData) {
    return tipoData !== "entrada";
}

// Motivo da perda só faz sentido quando o conjunto é de perdidas.
export function motivoHabilitado(tipoData, situacao) {
    return situacaoEfetiva(tipoData, situacao) === "status:perdido";
}

export function motivoEfetivo(filtros) {
    return motivoHabilitado(filtros.tipoData, filtros.situacao) ? filtros.motivoId || "" : "";
}

// Grupo de situação usado para decidir colunas: "todos" | "ativa" | "ganho" | "perdido".
function grupoDaSituacao(sit) {
    if (!sit)
        return "todos";
    if (sit.startsWith("etapa:"))
        return "ativa";
    return sit.slice("status:".length);
}

// ---------------------------------------------------------------------------
// Formatação (sempre America/Sao_Paulo)
// ---------------------------------------------------------------------------

// Instante ISO (UTC) -> "DD/MM/AAAA" no dia de São Paulo; "" se vazio/inválido.
export function formatarInstante(valor) {
    const dia = diaSaoPaulo(valor);
    return dia ? formatarDia(dia) : "";
}

// proxima_acao_data ("AAAA-MM-DDTHH:mm" ou "AAAA-MM-DD HH:mm", já em horário de
// São Paulo; registros antigos podem vir só com a data) -> "DD/MM/AAAA HH:mm".
export function formatarAcaoData(valor) {
    const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m)
        return "";
    return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

// Mesma regra de "vencida" do Dashboard (ação de hoje com horário anterior ao
// agora é vencida; registro só com data vence no dia seguinte).
// `agoraStr` = agoraSaoPaulo() ("AAAA-MM-DDTHH:mm").
export function acaoVencida(proximaAcaoData, agoraStr) {
    const d = String(proximaAcaoData || "").trim().replace(" ", "T");
    if (!/^\d{4}-\d{2}-\d{2}/.test(d))
        return false;
    return d.length > 10 ? d.slice(0, 16) < agoraStr : d.slice(0, 10) < agoraStr.slice(0, 10);
}

// Telefone armazenado só com dígitos (ex.: 5548999545530). Formato brasileiro
// legível e que o Excel não converte em número: "(48) 99954-5530". Qualquer
// outro formato (poucos casos) é mantido como está.
export function formatarTelefone(valor) {
    let d = String(valor ?? "").replace(/\D/g, "");
    if (!d)
        return "";
    if ((d.length === 12 || d.length === 13) && d.startsWith("55"))
        d = d.slice(2);
    if (d.length === 10)
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 11)
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return d;
}

export function rotuloResponsavel(usuario) {
    if (!usuario)
        return "";
    return usuario.ativo ? usuario.nome : `${usuario.nome} (inativo)`;
}

// ---------------------------------------------------------------------------
// Linhas do relatório (uma por oportunidade)
// ---------------------------------------------------------------------------

function timestamp(inst) {
    const t = Date.parse(inst);
    return Number.isNaN(t) ? null : t;
}

// refs: { etapasPorId, clientesPorId, usuariosPorId, origensPorId, motivosPorId }
// (Maps id -> objeto, como os services já devolvem). Datas estruturadas só
// aparecem no status em que fazem sentido: vendido_em só em Venda, perdido_em
// só em Perdido (as 4 reabertas ainda ativas guardam um perdido_em residual
// que NÃO deve aparecer), próxima ação só em oportunidades em aberto (existem
// ações residuais em oportunidades encerradas).
export function montarLinhas(oportunidades, refs) {
    const { etapasPorId, clientesPorId, usuariosPorId, origensPorId, motivosPorId } = refs;
    const linhas = [];
    for (const o of oportunidades) {
        if (o.excluidoEm)
            continue;
        const etapa = etapasPorId.get(o.etapaId);
        const status = etapa ? etapa.tipo : null;
        const cliente = clientesPorId.get(o.clienteId);
        const responsavel = usuariosPorId.get(o.responsavelId);
        const perdida = status === "perdido";
        // "Etapa em que foi perdida": etapa_origem_perda_id é gravada no momento
        // da perda com a etapa de ONDE a oportunidade saiu (conferido em
        // produção: coincide com o evento "Movida de X para Perdido" da
        // Timeline em 701/701 casos). Nunca aceita uma etapa final.
        const etapaPerdida = perdida && o.etapaOrigemPerdaId ? etapasPorId.get(o.etapaOrigemPerdaId) : undefined;
        const etapaPerdidaValida = etapaPerdida && etapaPerdida.tipo === "ativa" ? etapaPerdida : undefined;
        const instEntrada = o.criadoEm || "";
        const instVenda = status === "ganho" ? o.vendidoEm || "" : "";
        const instPerda = perdida ? o.perdidoEm || "" : "";
        linhas.push({
            id: o.id,
            clienteNome: cliente?.nome || "Cliente não identificado",
            telefone: cliente?.telefone ?? "",
            veiculo: o.veiculoInteresse || "",
            origemId: o.origemId,
            origemNome: origensPorId.get(o.origemId)?.nome ?? "",
            responsavelId: o.responsavelId,
            responsavelRotulo: rotuloResponsavel(responsavel),
            etapaId: o.etapaId,
            etapaNome: etapa?.nome ?? "",
            status,
            statusRotulo: status ? STATUS_ROTULOS[status] ?? "" : "",
            instEntrada,
            instVenda,
            instPerda,
            tsEntrada: timestamp(instEntrada),
            tsVenda: timestamp(instVenda),
            tsPerda: timestamp(instPerda),
            motivoId: perdida ? o.motivoPerdaId || "" : "",
            motivoNome: perdida ? motivosPorId.get(o.motivoPerdaId)?.nome ?? "" : "",
            etapaPerdidaId: etapaPerdidaValida ? etapaPerdidaValida.id : "",
            etapaPerdidaNome: etapaPerdidaValida ? etapaPerdidaValida.nome : "",
            proximaAcao: status === "ativa" ? descricaoProximaAcao(o) : "",
            proximaAcaoData: status === "ativa" ? o.proximaAcaoData || "" : "",
        });
    }
    return linhas;
}

function campoInstante(tipoData) {
    return tipoData === "venda" ? "instVenda" : tipoData === "perda" ? "instPerda" : "instEntrada";
}

function campoTimestamp(tipoData) {
    return tipoData === "venda" ? "tsVenda" : tipoData === "perda" ? "tsPerda" : "tsEntrada";
}

// ---------------------------------------------------------------------------
// Filtro (UM ÚNICO conjunto alimenta resumo, tabela e CSV)
// ---------------------------------------------------------------------------

// `periodo` vem de resolverPeriodo (utils/periodo.js). Período inválido
// (personalizado incompleto/invertido) -> conjunto vazio.
// "Todo o período" não aplica recorte de data: aceita inclusive vendas antigas
// sem vendido_em (aparecem com "—"). Qualquer recorte por data só aceita
// registros COM a data do tipo escolhido — nada é completado artificialmente.
export function filtrarLinhas(linhas, filtros, periodo) {
    if (!periodo || periodo.erro)
        return [];
    const sit = situacaoEfetiva(filtros.tipoData, filtros.situacao);
    const motivo = motivoEfetivo(filtros);
    const campo = campoInstante(filtros.tipoData);
    return linhas.filter((l) => {
        if (filtros.responsavelId && l.responsavelId !== filtros.responsavelId)
            return false;
        if (filtros.origemId && l.origemId !== filtros.origemId)
            return false;
        if (sit.startsWith("status:") && l.status !== sit.slice("status:".length))
            return false;
        if (sit.startsWith("etapa:") && l.etapaId !== sit.slice("etapa:".length))
            return false;
        if (motivo && l.motivoId !== motivo)
            return false;
        return dentroDoPeriodo(l[campo], periodo);
    });
}

// Mais recentes primeiro, conforme a data do Tipo de data. Registros sem a
// data ficam por último; empate desfeito pelo id (ordem estável e previsível).
export function ordenarLinhas(linhas, tipoData) {
    const campo = campoTimestamp(tipoData);
    return [...linhas].sort((a, b) => {
        const ta = a[campo];
        const tb = b[campo];
        if (ta === null && tb !== null)
            return 1;
        if (ta !== null && tb === null)
            return -1;
        if (ta !== null && tb !== null && ta !== tb)
            return tb - ta;
        return String(a.id).localeCompare(String(b.id));
    });
}

export function paginar(total, pagina, tamanho) {
    const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
    const paginaEfetiva = Math.min(Math.max(1, pagina), totalPaginas);
    const inicio = (paginaEfetiva - 1) * tamanho;
    return { pagina: paginaEfetiva, totalPaginas, inicio, fim: Math.min(total, inicio + tamanho) };
}

// ---------------------------------------------------------------------------
// Responsável (filtro HISTÓRICO — não é seletor operacional)
// ---------------------------------------------------------------------------

// Usuários ativos + usuários INATIVOS que ainda têm oportunidades no conjunto
// carregado ("Ian (inativo)"). Não altera nenhum seletor operacional (nova
// oportunidade, transferência, próxima ação), que continuam só com ativos.
export function opcoesResponsavel(usuarios, linhas) {
    const comOportunidade = new Set(linhas.map((l) => l.responsavelId));
    return usuarios
        .filter((u) => u.ativo || comOportunidade.has(u.id))
        .map((u) => ({ id: u.id, rotulo: rotuloResponsavel(u), inativo: !u.ativo }))
        .sort((a, b) => (a.inativo === b.inativo ? a.rotulo.localeCompare(b.rotulo, "pt-BR") : a.inativo ? 1 : -1));
}

// Etapa / Status em um filtro só: status (Em aberto, Venda, Perdido) e as
// etapas abertas do funil. Venda/Perdido não se repetem como etapas.
export function opcoesSituacao(etapas) {
    const abertas = [...etapas].filter((e) => e.tipo === "ativa").sort((a, b) => a.ordem - b.ordem);
    return {
        status: [
            { valor: "status:ativa", rotulo: "Em aberto (todas as etapas)" },
            { valor: "status:ganho", rotulo: "Venda" },
            { valor: "status:perdido", rotulo: "Perdido" },
        ],
        etapas: abertas.map((e) => ({ valor: `etapa:${e.id}`, rotulo: e.nome })),
    };
}

// ---------------------------------------------------------------------------
// Resumo (agrupa EXATAMENTE as linhas filtradas)
// ---------------------------------------------------------------------------

// Agrupamentos oferecidos por Tipo de data. Venda NUNCA agrupa por
// responsável (a venda não tem histórico confiável de quem a conduziu).
// Responsável só é oferecido a quem tem visão global (para os demais seria
// sempre um único grupo: a própria carteira).
export function dimensoesResumo(tipoData, visaoGlobal) {
    const origem = { valor: "origem", rotulo: "Origem" };
    const responsavel = { valor: "responsavel", rotulo: "Responsável atual (carteira)" };
    if (tipoData === "venda")
        return [origem];
    if (tipoData === "perda") {
        const dims = [
            { valor: "motivo", rotulo: "Motivo da perda" },
            origem,
            { valor: "etapaPerda", rotulo: "Etapa em que foi perdida" },
        ];
        if (visaoGlobal)
            dims.push(responsavel);
        return dims;
    }
    const dims = [origem, { valor: "etapa", rotulo: "Etapa atual" }];
    if (visaoGlobal)
        dims.splice(1, 0, responsavel);
    return dims;
}

export function dimensaoEfetiva(tipoData, dimensao, visaoGlobal) {
    const dims = dimensoesResumo(tipoData, visaoGlobal);
    return dims.some((d) => d.valor === dimensao) ? dimensao : dims[0].valor;
}

const CHAVES_DIMENSAO = {
    origem: (l) => [l.origemId || "", l.origemNome || "Sem origem"],
    responsavel: (l) => [l.responsavelId || "", l.responsavelRotulo || "Sem responsável"],
    etapa: (l) => [l.etapaId || "", l.etapaNome || "Sem etapa"],
    motivo: (l) => [l.motivoId || "", l.motivoNome || "Não informado"],
    etapaPerda: (l) => [l.etapaPerdidaId || "", l.etapaPerdidaNome || "Não informada"],
};

export function resumir(linhas, dimensao, etapasPorId) {
    const total = linhas.length;
    const porStatus = { ativa: 0, ganho: 0, perdido: 0 };
    const mapa = new Map();
    const chaveDe = CHAVES_DIMENSAO[dimensao] ?? CHAVES_DIMENSAO.origem;
    for (const l of linhas) {
        if (l.status && porStatus[l.status] !== undefined)
            porStatus[l.status] += 1;
        const [chave, rotulo] = chaveDe(l);
        let g = mapa.get(chave);
        if (!g) {
            g = { chave, rotulo, total: 0, ativa: 0, ganho: 0, perdido: 0 };
            mapa.set(chave, g);
        }
        g.total += 1;
        if (l.status && g[l.status] !== undefined)
            g[l.status] += 1;
    }
    const grupos = [...mapa.values()].map((g) => ({ ...g, pct: total ? g.total / total : 0 }));
    const porEtapa = dimensao === "etapa" || dimensao === "etapaPerda";
    grupos.sort((a, b) => {
        if (porEtapa) {
            const oa = etapasPorId.get(a.chave)?.ordem ?? 999;
            const ob = etapasPorId.get(b.chave)?.ordem ?? 999;
            if (oa !== ob)
                return oa - ob;
        }
        return b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR");
    });
    return { total, porStatus, grupos };
}

// ---------------------------------------------------------------------------
// Colunas (a MESMA definição alimenta a tabela e o CSV)
// ---------------------------------------------------------------------------

// Evita redundância e colunas sempre vazias: a primeira coluna já é a data do
// Tipo de data; datas/motivo/próxima ação só aparecem quando o conjunto pode
// conter esses dados. Valores ausentes saem como texto vazio (a tela mostra "—").
export function colunas(filtros) {
    const tipo = filtros.tipoData;
    const grupo = grupoDaSituacao(situacaoEfetiva(tipo, filtros.situacao));
    const campo = campoInstante(tipo);
    const cols = [
        { chave: "data", rotulo: dadosDoTipo(tipo).rotuloData, texto: (l) => formatarInstante(l[campo]) },
        { chave: "cliente", rotulo: "Cliente", texto: (l) => l.clienteNome },
        { chave: "telefone", rotulo: "Telefone", texto: (l) => formatarTelefone(l.telefone) },
        { chave: "veiculo", rotulo: "Veículo", texto: (l) => l.veiculo },
        { chave: "origem", rotulo: "Origem", texto: (l) => l.origemNome },
        { chave: "responsavel", rotulo: "Responsável atual", texto: (l) => l.responsavelRotulo },
        { chave: "etapaStatus", rotulo: "Etapa / Status", texto: (l) => l.etapaNome },
    ];
    if (tipo !== "perda" && (grupo === "todos" || grupo === "perdido")) {
        cols.push({ chave: "dataPerda", rotulo: "Data da perda", texto: (l) => formatarInstante(l.instPerda) });
    }
    if (grupo === "todos" || grupo === "perdido") {
        cols.push({ chave: "motivo", rotulo: "Motivo da perda", texto: (l) => l.motivoNome });
    }
    if (tipo !== "venda" && (grupo === "todos" || grupo === "ganho")) {
        cols.push({ chave: "dataVenda", rotulo: "Data da venda", texto: (l) => formatarInstante(l.instVenda) });
    }
    if (grupo === "todos" || grupo === "ativa") {
        cols.push({ chave: "proximaAcao", rotulo: "Próxima Ação", texto: (l) => l.proximaAcao });
        cols.push({ chave: "dataProximaAcao", rotulo: "Data da Próxima Ação", texto: (l) => formatarAcaoData(l.proximaAcaoData) });
    }
    return cols;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const SEPARADOR_CSV = ";"; // Excel em português/Brasil usa ";" como separador de lista.

// Colunas do arquivo: as da tela (Etapa / Status vira duas colunas) + ID.
// NÃO inclui e-mail, observações, CPF nem data de nascimento.
export function colunasCsv(cols) {
    const out = [];
    for (const c of cols) {
        if (c.chave === "etapaStatus") {
            out.push({ rotulo: "Etapa", texto: (l) => l.etapaNome });
            out.push({ rotulo: "Status", texto: (l) => l.statusRotulo });
        }
        else {
            out.push({ rotulo: c.rotulo, texto: c.texto });
        }
    }
    out.push({ rotulo: "ID", texto: (l) => String(l.id) });
    return out;
}

// Proteção contra injeção de fórmula em planilhas (os textos vêm de leads
// externos): valores iniciados por = + - @ TAB CR ganham um apóstrofo. Números
// de telefone fora do padrão com 12+ dígitos também (o Excel os exibiria em
// notação científica).
export function celulaCsv(valor) {
    let s = String(valor ?? "");
    if (/^[=+\-@\t\r]/.test(s) || /^\d{12,}$/.test(s))
        s = `'${s}`;
    if (/[;"\r\n]/.test(s) || /^\s|\s$/.test(s))
        s = `"${s.replace(/"/g, '""')}"`;
    return s;
}

// Texto do CSV: BOM UTF-8 (acentuação no Excel), separador ";", linhas CRLF.
// Recebe o conjunto COMPLETO já filtrado e ordenado (nunca só a página).
export function gerarCsv(linhas, cols) {
    const colsCsv = colunasCsv(cols);
    const linhaCabecalho = colsCsv.map((c) => celulaCsv(c.rotulo)).join(SEPARADOR_CSV);
    const corpo = linhas.map((l) => colsCsv.map((c) => celulaCsv(c.texto(l))).join(SEPARADOR_CSV));
    return "﻿" + [linhaCabecalho, ...corpo].join("\r\n") + "\r\n";
}

export function nomeArquivoCsv(filtros, periodo) {
    const recorte = !periodo || periodo.inicio === null
        ? "todo-o-periodo"
        : periodo.inicio === periodo.fim
            ? periodo.inicio
            : `${periodo.inicio}_a_${periodo.fim}`;
    return `relatorio-oportunidades_${filtros.tipoData}_${recorte}.csv`;
}

// ---------------------------------------------------------------------------
// Textos de apoio
// ---------------------------------------------------------------------------

export function descricaoRecorte(filtros, periodo) {
    if (!periodo || periodo.erro)
        return "";
    const tipo = dadosDoTipo(filtros.tipoData).rotuloData.toLowerCase();
    const quando = descreverPeriodo(periodo);
    return periodo.inicio === null
        ? `Mostrando oportunidades por ${tipo}: ${quando}.`
        : `Mostrando oportunidades por ${tipo} em ${quando} (fuso America/Sao_Paulo).`;
}

export function avisosRelatorio(filtros, periodo) {
    const avisos = [];
    if (!periodo || periodo.erro)
        return avisos;
    if (filtros.tipoData === "venda") {
        if (periodoAlcancaVendasSemData(periodo)) {
            avisos.push("O histórico de datas de venda anterior a 24/08/2026 pode estar incompleto.");
            avisos.push(periodo.inicio === null
                ? "Em \"Todo o período\", as vendas antigas sem data registrada aparecem com \"—\"; em recortes por data, só entram vendas com data registrada."
                : "Vendas antigas sem data registrada não aparecem em recortes por data.");
        }
        if (filtros.responsavelId) {
            avisos.push("Responsável = carteira atual; pode não ser quem conduziu ou fechou a venda.");
        }
    }
    if (filtros.tipoData === "perda") {
        avisos.push("Considera as oportunidades que estão atualmente em Perdido, pela data da última perda registrada.");
    }
    return avisos;
}
