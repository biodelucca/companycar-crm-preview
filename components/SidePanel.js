import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { obterAnotacao, salvarAnotacao } from "../services/anotacoes.js";
import { obterChecklist, marcarItemChecklist } from "../services/checklist.js";
import { listEstoque, buscarVeiculosEstoque } from "../services/estoque.js";
import { TIPOS_PROXIMA_ACAO, descricaoProximaAcao } from "../utils/proximaAcao.js";
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
const formatoDataSimples = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
// Sprint 6 (2026-08-07) — item 5: formata só a data (sem hora), aceitando
// tanto "YYYY-MM-DD" (o que o <input type="date"> grava) quanto ISO
// completo (criadoEm) — mesma tolerância de formato de formatarDataEvento.
function formatarDataSimples(iso) {
    const data = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
    if (Number.isNaN(data.getTime()))
        return iso;
    return formatoDataSimples.format(data);
}
export function SidePanel({ oportunidade, cliente, responsavel, usuarios = [], etapas, etapaAtual, motivosPerda = [], origens = [], timelineEventos, onFechar, onMoverEtapa, onTransferir, onChecklistMarcado, onAssociarVeiculoEstoque, onEditarDados, onExcluir, onSalvarProximaAcao, onConcluirProximaAcao, }) {
    // BUG corrigido em 2026-08-04 — ver nota em services/estoque.ts:
    // listEstoque exige sessão válida desde a Sprint 4, mas este componente
    // nunca lia idToken do contexto de autenticação (a ação estava isenta de
    // sessão quando foi implementada, na Sprint 3, antes da Sprint 4 trancar
    // todos os endpoints).
    // Ciclo 22 "Funil Comercial — Bloco 1" (2026-08-12): `usuario` passou a
    // ser lido aqui também, para gravar quem marcou cada item do checklist
    // (mesmo idToken já existia; ver nota abaixo de 2026-08-04 sobre por que
    // este componente lê idToken direto do contexto).
    const { idToken, usuario } = useAuth();
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
    // Sprint 7 "Próximas Ações" (2026-08-07) — próxima ação estruturada
    // (tipo/data-hora/responsável), substitui o texto livre em memória do
    // Passo 7 (Sprint 1). "Toda oportunidade deverá possuir apenas uma
    // próxima ação ativa" (pedido do CEO): o formulário serve tanto para
    // definir a primeira ação quanto para editar a ativa — o botão "Concluir"
    // é o único jeito de "encerrar" uma ação e liberar espaço pra outra (ver
    // handleConcluir abaixo e o modal "Deseja criar outra?").
    const temAcaoAtiva = !!(oportunidade.proximaAcaoTipo || oportunidade.proximaAcao);
    const descricaoAcaoAtual = descricaoProximaAcao(oportunidade);
    const responsavelAcaoId = oportunidade.proximaAcaoResponsavelId || oportunidade.responsavelId;
    const nomeResponsavelAcao = usuarios.find((u) => u.id === responsavelAcaoId)?.nome ?? "—";
    const [editandoProximaAcao, setEditandoProximaAcao] = useState(false);
    const [paTipo, setPaTipo] = useState("");
    const [paOutroTexto, setPaOutroTexto] = useState("");
    const [paData, setPaData] = useState("");
    const [paResponsavelId, setPaResponsavelId] = useState("");
    const [salvandoProximaAcao, setSalvandoProximaAcao] = useState(false);
    const [erroProximaAcao, setErroProximaAcao] = useState(null);
    const [concluindoAcao, setConcluindoAcao] = useState(false);
    // Item 6 do pedido: sempre que concluir, perguntar "Deseja criar outra?".
    const [perguntandoNovaAcao, setPerguntandoNovaAcao] = useState(false);
    function iniciarEdicaoProximaAcao() {
        setPaTipo(oportunidade.proximaAcaoTipo ?? "");
        setPaOutroTexto(oportunidade.proximaAcaoOutroTexto ?? "");
        setPaData(oportunidade.proximaAcaoData ?? "");
        setPaResponsavelId(oportunidade.proximaAcaoResponsavelId || oportunidade.responsavelId);
        setErroProximaAcao(null);
        setEditandoProximaAcao(true);
    }
    async function salvarProximaAcaoForm() {
        if (!paTipo) {
            setErroProximaAcao("Selecione o tipo da próxima ação.");
            return;
        }
        if (paTipo === "Outro" && !paOutroTexto.trim()) {
            setErroProximaAcao('Descreva a ação quando o tipo for "Outro".');
            return;
        }
        if (!paData) {
            setErroProximaAcao("Informe a data e hora da próxima ação.");
            return;
        }
        setSalvandoProximaAcao(true);
        setErroProximaAcao(null);
        const resultado = await onSalvarProximaAcao({
            tipo: paTipo,
            outroTexto: paTipo === "Outro" ? paOutroTexto.trim() : undefined,
            data: paData,
            responsavelId: paResponsavelId || undefined,
        });
        setSalvandoProximaAcao(false);
        if (resultado.ok === false) {
            setErroProximaAcao(resultado.erro ?? "Não foi possível salvar a próxima ação agora.");
            return;
        }
        setEditandoProximaAcao(false);
    }
    async function handleConcluirProximaAcao() {
        setConcluindoAcao(true);
        setErroProximaAcao(null);
        const resultado = await onConcluirProximaAcao();
        setConcluindoAcao(false);
        if (resultado.ok === false) {
            setErroProximaAcao(resultado.erro ?? "Não foi possível concluir a ação agora.");
            return;
        }
        setPerguntandoNovaAcao(true);
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
        if (!idToken)
            return;
        let cancelado = false;
        setAnotacoesCarregando(true);
        setAnotacoesErro(null);
        setAnotacoesSalvoAgora(false);
        obterAnotacao(oportunidade.id, idToken)
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
    }, [oportunidade.id, idToken]);
    function handleSalvarAnotacoes() {
        setAnotacoesSalvando(true);
        setAnotacoesErro(null);
        salvarAnotacao(oportunidade.id, anotacoesTexto, idToken)
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
    // Ciclo 22 "Funil Comercial — Bloco 1" (2026-08-12) — checklist real por
    // etapa, buscado do backend sempre que a oportunidade aberta (ou a etapa
    // dela) muda — mesmo padrão de carregamento sob demanda já usado acima
    // para Anotações. Etapa entra na lista de dependências porque os itens
    // dependem da etapa ATUAL (obterChecklist_ já resolve isso no backend a
    // cada chamada) — se a oportunidade for movida com o painel aberto, o
    // checklist precisa recarregar para mostrar os itens da nova etapa.
    const [checklistItens, setChecklistItens] = useState([]);
    const [checklistCarregando, setChecklistCarregando] = useState(true);
    const [checklistErro, setChecklistErro] = useState(null);
    const [checklistMarcandoChave, setChecklistMarcandoChave] = useState(null);
    useEffect(() => {
        if (!idToken)
            return;
        let cancelado = false;
        setChecklistCarregando(true);
        setChecklistErro(null);
        obterChecklist(oportunidade.id, idToken)
            .then((itens) => {
            if (!cancelado)
                setChecklistItens(itens);
        })
            .catch(() => {
            if (!cancelado)
                setChecklistErro("Não foi possível carregar o checklist agora.");
        })
            .finally(() => {
            if (!cancelado)
                setChecklistCarregando(false);
        });
        return () => {
            cancelado = true;
        };
    }, [oportunidade.id, oportunidade.etapaId, idToken]);
    async function handleToggleChecklistItem(item) {
        if (checklistMarcandoChave)
            return; // evita clique duplo enquanto uma marcação está em voo
        const novoMarcado = !item.marcado;
        setChecklistMarcandoChave(item.chave);
        setChecklistErro(null);
        try {
            const atualizado = await marcarItemChecklist(oportunidade.id, item.chave, novoMarcado, usuario?.id, idToken);
            setChecklistItens(atualizado);
            if (novoMarcado)
                onChecklistMarcado?.(item.texto);
        }
        catch {
            setChecklistErro("Não foi possível atualizar este item agora.");
        }
        finally {
            setChecklistMarcandoChave(null);
        }
    }
    // Sprint 3 "Integração com Estoque do Simples" (2026-08-03) — busca e
    // associação de um veículo real do estoque. A lista completa (54 itens
    // na análise da Etapa 1) é carregada uma vez por abertura do painel —
    // igual ao padrão de Anotações acima, service isolado e sem cache no
    // frontend (o cache de 15-30min já existe no Apps Script, ver
    // Estoque.gs). Serve tanto para a busca quanto para mostrar dado ao vivo
    // (preço/km/disponibilidade) do veículo já associado, se houver.
    const [estoqueLista, setEstoqueLista] = useState([]);
    const [estoqueCarregando, setEstoqueCarregando] = useState(true);
    const [estoqueErro, setEstoqueErro] = useState(null);
    const [buscaVeiculoAberta, setBuscaVeiculoAberta] = useState(false);
    const [termoBuscaVeiculo, setTermoBuscaVeiculo] = useState("");
    const [associandoId, setAssociandoId] = useState(null);
    const [erroAssociar, setErroAssociar] = useState(null);
    // Sprint 8 "Performance e Estabilidade" (2026-08-10) — antes, esta busca
    // disparava sempre que o painel abria, mesmo para oportunidades sem
    // nenhum veículo associado e sem o usuário nunca clicar em "Associar
    // veículo do estoque": uma chamada de rede completa (54 itens, com
    // retry/backoff em caso de falha do Apps Script) que muitas vezes nunca
    // era usada. Agora só busca quando de fato precisa: (a) já existe um
    // veículo associado (`veiculoEstoqueId`), para mostrar preço/km/
    // disponibilidade ao vivo, ou (b) o usuário abriu a busca de associação
    // (`buscaVeiculoAberta`). Não muda o que aparece quando o usuário
    // efetivamente olha essa seção -- só adia a chamada até o momento em que
    // o dado é de fato necessário.
    useEffect(() => {
        if (!idToken)
            return;
        const precisaCatalogoEstoque = !!oportunidade.veiculoEstoqueId || buscaVeiculoAberta;
        if (!precisaCatalogoEstoque)
            return;
        let cancelado = false;
        setEstoqueCarregando(true);
        setEstoqueErro(null);
        listEstoque(idToken)
            .then((lista) => {
            if (!cancelado)
                setEstoqueLista(lista);
        })
            .catch(() => {
            if (!cancelado)
                setEstoqueErro("Não foi possível consultar o estoque agora.");
        })
            .finally(() => {
            if (!cancelado)
                setEstoqueCarregando(false);
        });
        return () => {
            cancelado = true;
        };
    }, [oportunidade.id, oportunidade.veiculoEstoqueId, idToken, buscaVeiculoAberta]);
    // Sprint 8 "Performance e Estabilidade" (2026-08-10): SidePanel é um
    // componente único e grande (sem fronteira de componente filho para os
    // campos de texto), então uma tecla digitada em QUALQUER campo (Anotações,
    // Editar dados, texto de "Outro" etc.) re-renderiza o componente inteiro
    // e recalculava estas duas buscas de novo a cada vez, mesmo sem
    // `estoqueLista`/`termoBuscaVeiculo`/o id do veículo terem mudado. Baixo
    // custo hoje (54 itens), mas useMemo evita o recálculo redundante sem
    // mudar nenhum resultado.
    const veiculoEstoqueAoVivo = useMemo(() => (oportunidade.veiculoEstoqueId ? estoqueLista.find((v) => v.id === oportunidade.veiculoEstoqueId) : undefined), [oportunidade.veiculoEstoqueId, estoqueLista]);
    // Só decide "indisponível" depois que a consulta terminou com sucesso —
    // enquanto carrega, não afirma nada sobre disponibilidade ainda.
    const veiculoEstoqueIndisponivel = !!oportunidade.veiculoEstoqueId && !estoqueCarregando && !estoqueErro && !veiculoEstoqueAoVivo;
    const resultadosBusca = useMemo(() => (buscaVeiculoAberta ? buscarVeiculosEstoque(estoqueLista, termoBuscaVeiculo).slice(0, 25) : []), [buscaVeiculoAberta, estoqueLista, termoBuscaVeiculo]);
    async function handleAssociarVeiculo(veiculoEstoqueId) {
        setAssociandoId(veiculoEstoqueId);
        setErroAssociar(null);
        const resultado = await onAssociarVeiculoEstoque(veiculoEstoqueId);
        setAssociandoId(null);
        if (resultado.ok === false) {
            setErroAssociar(resultado.erro ?? "Não foi possível associar este veículo agora.");
            return;
        }
        setBuscaVeiculoAberta(false);
        setTermoBuscaVeiculo("");
    }
    // Sprint 6 (2026-08-07) — itens 4 e 5: edição de dados cadastrais do
    // cliente (nome/telefone/cidade) + origem + "Data de início real" da
    // negociação, tudo num único formulário/ação (ver DadosEdicaoPainel
    // acima e editarDadosOportunidade_ no backend). O campo de data começa
    // vazio quando dataInicioNegociacao não foi definida ainda — vazio aqui
    // significa "continua usando a data de criação", não "sem data".
    const [editandoDados, setEditandoDados] = useState(false);
    const [edNome, setEdNome] = useState("");
    const [edTelefone, setEdTelefone] = useState("");
    const [edCidade, setEdCidade] = useState("");
    const [edOrigemId, setEdOrigemId] = useState("");
    const [edDataInicio, setEdDataInicio] = useState("");
    const [salvandoDados, setSalvandoDados] = useState(false);
    const [erroEdicaoDados, setErroEdicaoDados] = useState(null);
    function iniciarEdicaoDados() {
        setEdNome(cliente?.nome ?? "");
        setEdTelefone(cliente?.telefone ?? "");
        setEdCidade(cliente?.cidade ?? "");
        setEdOrigemId(oportunidade.origemId ?? "");
        setEdDataInicio(oportunidade.dataInicioNegociacao ?? "");
        setErroEdicaoDados(null);
        setEditandoDados(true);
    }
    async function salvarEdicaoDados() {
        const nome = edNome.trim();
        const telefone = edTelefone.trim();
        if (!nome || !telefone) {
            setErroEdicaoDados("Nome e telefone não podem ficar vazios.");
            return;
        }
        setSalvandoDados(true);
        setErroEdicaoDados(null);
        const resultado = await onEditarDados({
            nome,
            telefone,
            cidade: edCidade.trim(),
            origemId: edOrigemId,
            dataInicioNegociacao: edDataInicio,
        });
        setSalvandoDados(false);
        if (resultado.ok === false) {
            setErroEdicaoDados(resultado.erro ?? "Não foi possível salvar os dados agora.");
            return;
        }
        setEditandoDados(false);
    }
    // Sprint 6 (2026-08-07) — item 1 "Excluir negociação": exige confirmação
    // explícita (modal, mesmo padrão visual do modal de motivo de perda em
    // Pipeline.tsx — classes drop-motivo-*) antes de disparar a exclusão.
    const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
    const [excluindo, setExcluindo] = useState(false);
    const [erroExclusao, setErroExclusao] = useState(null);
    async function confirmarExclusao() {
        setExcluindo(true);
        setErroExclusao(null);
        const resultado = await onExcluir();
        setExcluindo(false);
        if (resultado.ok === false) {
            setErroExclusao(resultado.erro ?? "Não foi possível excluir esta negociação agora.");
            return;
        }
        // Sucesso: o painel é fechado pelo chamador (Pipeline.tsx), que também
        // remove a oportunidade do estado local — nada a fazer aqui.
    }
    return (_jsxs("div", { className: "side-panel__overlay", onClick: onFechar, children: [_jsxs("aside", { className: "side-panel", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "side-panel__header", children: [_jsxs("div", { children: [_jsx("h2", { children: oportunidade.veiculoInteresse }), _jsx("p", { className: "side-panel__cliente", children: cliente?.nome ?? "Cliente não identificado" })] }), _jsx("button", { className: "side-panel__fechar", onClick: onFechar, "aria-label": "Fechar", children: "\u2715" })] }), _jsxs("div", { className: "side-panel__tabs", children: [_jsx("button", { className: aba === "detalhes" ? "ativo" : "", onClick: () => setAba("detalhes"), children: "Detalhes" }), _jsx("button", { className: aba === "timeline" ? "ativo" : "", onClick: () => setAba("timeline"), children: "Timeline" }), _jsx("button", { className: aba === "checklist" ? "ativo" : "", onClick: () => setAba("checklist"), children: "Checklist" })] }), _jsxs("div", { className: "side-panel__body", children: [aba === "detalhes" && (_jsxs(_Fragment, { children: [_jsxs("dl", { className: "side-panel__lista", children: [_jsx("dt", { children: "Etapa" }), _jsx("dd", { children: etapaAtual?.nome ?? "—" }), _jsx("dt", { children: "Respons\u00E1vel" }), _jsx("dd", { children: responsavel?.nome ?? "—" }), _jsx("dt", { children: "Origem" }), _jsx("dd", { children: origemObj?.nome ?? "—" }), _jsx("dt", { children: "Telefone" }), _jsx("dd", { children: cliente?.telefone ?? "—" }), _jsx("dt", { children: "Cidade" }), _jsx("dd", { children: cliente?.cidade ?? "—" }), _jsx("dt", { children: "Data de in\u00EDcio" }), _jsx("dd", { children: formatarDataSimples(oportunidade.dataInicioNegociacao || oportunidade.criadoEm) }), _jsx("dt", { children: "Pr\u00F3xima a\u00E7\u00E3o" }), _jsx("dd", { children: temAcaoAtiva ? (_jsxs(_Fragment, { children: [descricaoAcaoAtual, oportunidade.proximaAcaoData ? ` — ${formatarDataEvento(oportunidade.proximaAcaoData)}` : "", ` · ${nomeResponsavelAcao}`] })) : ("Nenhuma próxima ação definida") }), oportunidade.condicaoComercial && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Condi\u00E7\u00E3o comercial" }), _jsx("dd", { children: oportunidade.condicaoComercial })] })), oportunidade.valorProposto && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Valor proposto" }), _jsx("dd", { children: formatoMoeda.format(oportunidade.valorProposto) })] })), oportunidade.veiculoTroca && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Ve\u00EDculo na troca" }), _jsxs("dd", { children: [oportunidade.veiculoTroca.modelo, " \u00B7 ", oportunidade.veiculoTroca.ano, " \u00B7", " ", oportunidade.veiculoTroca.km.toLocaleString("pt-BR"), " km"] })] })), !oportunidade.veiculoTroca && oportunidade.veiculoTrocaDescricao && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Ve\u00EDculo na troca" }), _jsx("dd", { children: oportunidade.veiculoTrocaDescricao })] })), motivoPerdaObj && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Motivo da perda" }), _jsxs("dd", { children: [motivoPerdaObj.nome, motivoPerdaObj.nome === "Outro" && oportunidade.motivoPerdaDescricaoOutro
                                                                ? ` — ${oportunidade.motivoPerdaDescricaoOutro}`
                                                                : ""] })] }))] }), _jsx("div", { className: "side-panel__secao", children: !editandoDados ? (_jsx("button", { className: "side-panel__botao-secundario", onClick: iniciarEdicaoDados, children: "Editar dados" })) : (_jsxs("div", { className: "side-panel__form", children: [_jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Nome do cliente *" }), _jsx("input", { type: "text", value: edNome, onChange: (e) => setEdNome(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Telefone *" }), _jsx("input", { type: "text", value: edTelefone, onChange: (e) => setEdTelefone(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Cidade" }), _jsx("input", { type: "text", value: edCidade, onChange: (e) => setEdCidade(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Origem" }), _jsxs("select", { value: edOrigemId, onChange: (e) => setEdOrigemId(e.target.value), children: [_jsx("option", { value: "", children: "Selecione a origem\u2026" }), origens.map((o) => (_jsx("option", { value: o.id, children: o.nome }, o.id)))] })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Data de in\u00EDcio real (opcional \u2014 em branco usa a data de cria\u00E7\u00E3o)" }), _jsx("input", { type: "date", value: edDataInicio, onChange: (e) => setEdDataInicio(e.target.value) })] }), erroEdicaoDados && _jsx("p", { className: "side-panel__aviso", children: erroEdicaoDados }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: salvarEdicaoDados, disabled: salvandoDados, children: salvandoDados ? "Salvando…" : "Salvar" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: () => setEditandoDados(false), disabled: salvandoDados, children: "Cancelar" })] })] })) }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Ve\u00EDculo do estoque" }), oportunidade.veiculoEstoqueId && (_jsxs("div", { className: "side-panel__veiculo-estoque", children: [veiculoEstoqueIndisponivel && (_jsx("p", { className: "side-panel__aviso", children: "Indispon\u00EDvel no estoque \u2014 dados abaixo s\u00E3o os \u00FAltimos conhecidos." })), (() => {
                                                        // Ao vivo (encontrado em listEstoque) tem prioridade;
                                                        // senão cai no snapshot congelado gravado na
                                                        // associação (nunca apaga, nunca substitui sozinho —
                                                        // decisão do CEO).
                                                        const marca = veiculoEstoqueAoVivo?.marca ?? oportunidade.veiculoEstoqueMarca;
                                                        const modeloVersao = veiculoEstoqueAoVivo?.modeloVersao ?? oportunidade.veiculoEstoqueModeloVersao;
                                                        const ano = veiculoEstoqueAoVivo?.ano ?? oportunidade.veiculoEstoqueAno;
                                                        const km = veiculoEstoqueAoVivo ? veiculoEstoqueAoVivo.km : oportunidade.veiculoEstoqueKm ?? null;
                                                        const preco = veiculoEstoqueAoVivo
                                                            ? veiculoEstoqueAoVivo.preco
                                                            : oportunidade.veiculoEstoquePreco ?? null;
                                                        const imagem = veiculoEstoqueAoVivo?.imagemPrincipal ?? oportunidade.veiculoEstoqueImagem;
                                                        return (_jsxs(_Fragment, { children: [imagem && (_jsx("img", { className: "side-panel__veiculo-estoque-imagem", src: imagem, alt: modeloVersao ?? "Veículo" })), _jsxs("dl", { className: "side-panel__lista", children: [_jsx("dt", { children: "Ve\u00EDculo" }), _jsx("dd", { children: [marca, modeloVersao, ano].filter(Boolean).join(" ") || "—" }), _jsx("dt", { children: "Km" }), _jsx("dd", { children: km !== null && km !== undefined ? `${km.toLocaleString("pt-BR")} km` : "—" }), _jsx("dt", { children: "Pre\u00E7o" }), _jsx("dd", { children: preco ? formatoMoeda.format(preco) : "Sem preço informado" })] })] }));
                                                    })()] })), estoqueErro && _jsx("p", { className: "side-panel__aviso", children: estoqueErro }), !buscaVeiculoAberta ? (_jsx("button", { className: "side-panel__botao-secundario", onClick: () => setBuscaVeiculoAberta(true), children: oportunidade.veiculoEstoqueId ? "Trocar veículo do estoque" : "Associar veículo do estoque" })) : (_jsxs("div", { className: "side-panel__form", children: [_jsx("input", { type: "text", placeholder: "Buscar por marca, modelo/vers\u00E3o ou ano\u2026", value: termoBuscaVeiculo, onChange: (e) => setTermoBuscaVeiculo(e.target.value), autoFocus: true }), estoqueCarregando && _jsx("p", { className: "side-panel__vazio-aba", children: "Carregando estoque\u2026" }), !estoqueCarregando && !estoqueErro && (_jsxs("ul", { className: "side-panel__estoque-resultados", children: [resultadosBusca.length === 0 && (_jsx("li", { className: "side-panel__vazio-aba", children: "Nenhum ve\u00EDculo encontrado." })), resultadosBusca.map((v) => (_jsxs("li", { className: "side-panel__estoque-item", children: [v.imagemPrincipal && _jsx("img", { src: v.imagemPrincipal, alt: v.modeloVersao ?? "Veículo" }), _jsxs("div", { className: "side-panel__estoque-item-info", children: [_jsx("strong", { children: [v.marca, v.modeloVersao, v.ano].filter(Boolean).join(" ") }), _jsxs("span", { children: [v.km !== null ? `${v.km.toLocaleString("pt-BR")} km` : "km —", " \u00B7", " ", v.preco ? formatoMoeda.format(v.preco) : "Sem preço informado"] })] }), _jsx("button", { className: "side-panel__botao-primario", onClick: () => handleAssociarVeiculo(v.id), disabled: associandoId !== null, children: associandoId === v.id ? "Associando…" : "Associar" })] }, v.id)))] })), erroAssociar && _jsx("p", { className: "side-panel__aviso", children: erroAssociar }), _jsx("div", { className: "side-panel__form-acoes", children: _jsx("button", { className: "side-panel__botao-secundario", onClick: () => {
                                                                setBuscaVeiculoAberta(false);
                                                                setTermoBuscaVeiculo("");
                                                                setErroAssociar(null);
                                                            }, children: "Cancelar" }) })] }))] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Anota\u00E7\u00F5es" }), anotacoesCarregando ? (_jsx("p", { className: "side-panel__vazio-aba", children: "Carregando anota\u00E7\u00F5es\u2026" })) : (_jsxs("div", { className: "side-panel__form", children: [_jsx("textarea", { className: "side-panel__anotacoes-textarea", value: anotacoesTexto, onChange: (e) => {
                                                            setAnotacoesTexto(e.target.value);
                                                            setAnotacoesSalvoAgora(false);
                                                        }, placeholder: "Observa\u00E7\u00F5es internas sobre esta oportunidade\u2026", rows: 4 }), anotacoesErro && _jsx("p", { className: "side-panel__aviso", children: anotacoesErro }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: handleSalvarAnotacoes, disabled: anotacoesSalvando || anotacoesTexto === anotacoesSalvo, children: anotacoesSalvando ? "Salvando…" : "Salvar" }), anotacoesSalvoAgora && !anotacoesSalvando && (_jsx("span", { className: "side-panel__anotacoes-status", children: "Salvo" }))] })] }))] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Pr\u00F3xima a\u00E7\u00E3o" }), !editandoProximaAcao ? (_jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-secundario", onClick: iniciarEdicaoProximaAcao, children: temAcaoAtiva ? "Editar próxima ação" : "Definir próxima ação" }), temAcaoAtiva && (_jsx("button", { className: "side-panel__botao-primario", onClick: handleConcluirProximaAcao, disabled: concluindoAcao, children: concluindoAcao ? "Concluindo…" : "✔ Concluir" }))] })) : (_jsxs("div", { className: "side-panel__form", children: [_jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Tipo da a\u00E7\u00E3o" }), _jsxs("select", { value: paTipo, onChange: (e) => setPaTipo(e.target.value), children: [_jsx("option", { value: "", children: "Selecione\u2026" }), TIPOS_PROXIMA_ACAO.map((t) => (_jsx("option", { value: t, children: t }, t)))] })] }), paTipo === "Outro" && (_jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Descreva a a\u00E7\u00E3o" }), _jsx("input", { type: "text", value: paOutroTexto, onChange: (e) => setPaOutroTexto(e.target.value) })] })), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Data e hora" }), _jsx("input", { type: "datetime-local", value: paData, onChange: (e) => setPaData(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Respons\u00E1vel pela a\u00E7\u00E3o" }), _jsx("select", { value: paResponsavelId, onChange: (e) => setPaResponsavelId(e.target.value), children: usuarios.map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id))) })] }), erroProximaAcao && _jsx("p", { className: "side-panel__aviso", children: erroProximaAcao }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: salvarProximaAcaoForm, disabled: salvandoProximaAcao, children: salvandoProximaAcao ? "Salvando…" : "Salvar" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: () => setEditandoProximaAcao(false), disabled: salvandoProximaAcao, children: "Cancelar" })] })] })), !editandoProximaAcao && erroProximaAcao && _jsx("p", { className: "side-panel__aviso", children: erroProximaAcao })] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Mover para outra etapa" }), etapaEhFinal ? (_jsxs("p", { className: "side-panel__aviso", children: ["Etapa final (", etapaAtual?.nome, ") \u2014 n\u00E3o pode ser alterada."] })) : (_jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: etapaAlvo, onChange: (e) => {
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
                                                                .map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] }), erroTransferencia && _jsx("p", { className: "side-panel__aviso", children: erroTransferencia }), _jsx("button", { className: "side-panel__botao-primario", onClick: confirmarTransferencia, disabled: transferindo || !responsavelAlvo, children: transferindo ? "Transferindo…" : "Confirmar transferência" })] })] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Excluir negocia\u00E7\u00E3o" }), erroExclusao && _jsx("p", { className: "side-panel__aviso", children: erroExclusao }), _jsx("button", { className: "side-panel__botao-perigo", onClick: () => setConfirmandoExclusao(true), children: "Excluir esta negocia\u00E7\u00E3o" })] })] })), aba === "timeline" && (_jsxs("ul", { className: "side-panel__timeline", children: [timelineEventos.length === 0 && (_jsx("li", { className: "side-panel__vazio-aba", children: "Sem eventos registrados ainda." })), timelineEventos.map((evento) => (_jsxs("li", { children: [_jsx("span", { className: "side-panel__timeline-data", children: formatarDataEvento(evento.dataHora) }), _jsx("span", { children: evento.descricao })] }, evento.id)))] })), aba === "checklist" && (_jsx(_Fragment, { children: checklistCarregando ? (_jsx("p", { className: "side-panel__vazio-aba", children: "Carregando checklist\u2026" })) : checklistErro && checklistItens.length === 0 ? (_jsx("p", { className: "side-panel__aviso", children: checklistErro })) : checklistItens.length === 0 ? (_jsx("p", { className: "side-panel__vazio-aba", children: etapaAtual?.nome === "Venda/Documentação"
                                        ? "Checklist desta etapa ainda não foi definido."
                                        : "Sem checklist para esta etapa." })) : (_jsxs(_Fragment, { children: [checklistErro && _jsx("p", { className: "side-panel__aviso", children: checklistErro }), _jsx("ul", { className: "side-panel__checklist", children: checklistItens.map((item) => (_jsxs("li", { children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: item.marcado, disabled: checklistMarcandoChave === item.chave, onChange: () => void handleToggleChecklistItem(item) }), item.texto] }), item.marcado && item.marcadoEm && (_jsx("span", { className: "side-panel__checklist-data", children: formatarDataEvento(item.marcadoEm) }))] }, item.chave))) })] })) }))] })] }), confirmandoExclusao && (_jsx("div", { className: "drop-motivo-overlay", onClick: () => !excluindo && setConfirmandoExclusao(false), children: _jsxs("div", { className: "drop-motivo-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Excluir negocia\u00E7\u00E3o" }), _jsxs("p", { className: "side-panel__cliente", children: ["Tem certeza que deseja excluir a negocia\u00E7\u00E3o de \"", cliente?.nome ?? "Cliente não identificado", "\" (", oportunidade.veiculoInteresse, ")? Esta a\u00E7\u00E3o n\u00E3o pode ser desfeita pela equipe."] }), erroExclusao && _jsx("p", { className: "side-panel__aviso", children: erroExclusao }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-perigo", onClick: confirmarExclusao, disabled: excluindo, children: excluindo ? "Excluindo…" : "Sim, excluir" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: () => setConfirmandoExclusao(false), disabled: excluindo, children: "Cancelar" })] })] }) })), perguntandoNovaAcao && (_jsx("div", { className: "drop-motivo-overlay", onClick: () => setPerguntandoNovaAcao(false), children: _jsxs("div", { className: "drop-motivo-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "A\u00E7\u00E3o conclu\u00EDda" }), _jsx("p", { className: "side-panel__cliente", children: "Deseja criar outra pr\u00F3xima a\u00E7\u00E3o para esta negocia\u00E7\u00E3o?" }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: () => {
                                        setPerguntandoNovaAcao(false);
                                        iniciarEdicaoProximaAcao();
                                    }, children: "Sim" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: () => setPerguntandoNovaAcao(false), children: "N\u00E3o" })] })] }) }))] }));
}
