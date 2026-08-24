import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listOportunidades, listEtapas, listClientes, listUsuarios, listMotivosPerda, listOrigens, listTimeline, moverEtapaOportunidade, transferirOportunidade, criarOportunidade, excluirOportunidade, editarDadosOportunidade, atualizarProximaAcao, concluirProximaAcao, reabrirOportunidade, } from "../services/oportunidades.js";
import { associarVeiculoEstoque, listEstoque, buscarVeiculosEstoque } from "../services/estoque.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { OpportunityCard } from "../components/OpportunityCard.js";
import { SidePanel } from "../components/SidePanel.js";
import { formatarDataHoraCurta } from "../utils/proximaAcao.js";
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
// automático. Próxima ação e checklist continuaram só em memória por mais
// alguns ciclos — ver nota abaixo.
//
// Checklist: até o Ciclo 22 (2026-08-12), os itens eram placeholders
// genéricos por TIPO de etapa (CHECKLIST_GENERICO/CHECKLIST_VENDA), só em
// memória do navegador, sem persistência. A partir do Ciclo 22, o
// checklist é real (itens oficiais por etapa nomeada, definidos pelo
// Guilherme, persistidos no backend) e o próprio SidePanel busca e grava
// o estado (mesmo padrão já usado para Anotações) — o Pipeline não guarda
// mais nenhum estado de checklist, só recebe o callback onChecklistMarcado
// para registrar o evento local na Timeline (ver services/checklist.ts e
// Checklist.gs).
function novoEventoId() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
// Ciclo pós-produção (2026-08-13) — item 1 "Atualizar Pipeline": formata o
// horário da última atualização bem-sucedida (manual ou automática) para o
// texto discreto ao lado do botão "Atualizar".
function formatarHoraCurta(data) {
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
// Item 5 "Busca de lead": normalizações simples usadas só para comparar o
// termo digitado contra os dados já carregados — sem chamada nova ao
// backend, sem acento-insensibilidade (mantém a busca simples, como pedido).
function normalizarTexto(valor) {
    return String(valor || "").toLowerCase();
}
function normalizarDigitos(valor) {
    return String(valor || "").replace(/\D/g, "");
}
// Item 3 "Filtro por usuário para o Gerente": mesmos dois papéis com visão
// completa já usados no backend (ver PAPEIS_VISAO_COMPLETA_ em Auth.gs) —
// cópia deliberada, mesmo padrão de "duas fontes de verdade sincronizadas à
// mão" já usado em TIPOS_PROXIMA_ACAO (utils/proximaAcao.ts/Oportunidades.gs).
// Puramente de exibição: SDR/Closer já só recebem a própria carteira do
// backend (Oportunidades.gs), então o filtro nunca amplia o que alguém pode
// ver — só deixa o Gerente/Administrador recortar visualmente o que já lhes
// foi enviado.
var PAPEIS_VISAO_COMPLETA_PIPELINE = { "Gerente (Owner)": true, "Administrador": true };

// Mesmo breakpoint do CSS (@media max-width: 720px, ver src/index.css) —
// acima disso o drag-and-drop fica ativo; em telas menores só o seletor
// por botão no SidePanel funciona (requisito explícito da Sprint 1:
// "desktop only").
const LARGURA_MINIMA_DRAG = 721;
export function Pipeline({ oportunidadeInicialId, aoConsumirOportunidadeInicial, abrirNovaNegociacaoInicial, aoConsumirAbrirNovaNegociacaoInicial } = {}) {
    const { idToken, logout, usuario } = useAuth();
    // Ciclo pós-produção (2026-08-13) — itens 1, 3, 4, 5: estado novo, todo
    // ele só de exibição/transporte (nenhuma nova permissão, nenhuma escrita
    // nova no backend).
    const [filtroResponsavelId, setFiltroResponsavelId] = useState("");
    const [termoBusca, setTermoBusca] = useState("");
    // Ciclo "Refinamentos Operacionais" (2026-08-18) — item 1: ordenação dos
    // cards por data de criação (criadoEm), só visual — não mexe em etapa,
    // prioridade ou qualquer regra de negócio. "recentes" = mais novo
    // primeiro (padrão); "antigas" = mais antigo primeiro.
    const [ordemData, setOrdemData] = useState("recentes");
    const [atualizando, setAtualizando] = useState(false);
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
    const podeFiltrarPorResponsavel = !!(usuario && PAPEIS_VISAO_COMPLETA_PIPELINE[usuario.papel]);
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
    // Sprint 3.5 "Nova Negociação" (2026-08-03) — modal do botão "+ Nova
    // Negociação" no topo do Pipeline. Campos obrigatórios/opcionais e regras
    // (dedup por telefone, sempre entra em "Novo Lead") são todos do backend
    // (criarOportunidade_) — este estado é só o formulário em si; nnSalvando é
    // separado de salvandoAcao (usado por mover/transferir/associar) porque o
    // modal tem seu próprio botão "Salvar" com seu próprio spinner, sem
    // relação com uma oportunidade já selecionada.
    const [novaNegociacaoAberta, setNovaNegociacaoAberta] = useState(false);
    const [nnNome, setNnNome] = useState("");
    const [nnTelefone, setNnTelefone] = useState("");
    const [nnOrigemId, setNnOrigemId] = useState("");
    const [nnResponsavelId, setNnResponsavelId] = useState("");
    // Melhoria isolada "Etapa inicial na Nova Negociação" (2026-08-22):
    // etapa em que a oportunidade nasce -- opcional, padrão "Novo Lead"
    // (mesmo default que já existe no backend quando nada é enviado). Só
    // etapas ativas elegíveis para início (ver etapasElegiveisCriacao
    // abaixo) -- nunca Perdido nem Venda/Documentação.
    const [nnEtapaInicialId, setNnEtapaInicialId] = useState("");
    const [nnCidade, setNnCidade] = useState("");
    const [nnVeiculoInteresse, setNnVeiculoInteresse] = useState("");
    // Ciclo "Refinamentos Operacionais" (2026-08-18) — item 4: vínculo
    // opcional com um veículo real do estoque, já na criação — mesma busca/
    // serviço já usados pelo SidePanel para associar depois (services/
    // estoque.js), sem lógica nova. Puramente opcional: se o usuário não
    // usar esta seção, o fluxo fica idêntico ao de hoje (só texto livre em
    // nnVeiculoInteresse, sem veiculoEstoqueId nenhum).
    const [nnVeiculoEstoqueId, setNnVeiculoEstoqueId] = useState(null);
    const [nnBuscaVeiculoAberta, setNnBuscaVeiculoAberta] = useState(false);
    const [nnTermoBuscaVeiculo, setNnTermoBuscaVeiculo] = useState("");
    const [nnEstoqueLista, setNnEstoqueLista] = useState([]);
    const [nnEstoqueCarregando, setNnEstoqueCarregando] = useState(false);
    const [nnEstoqueErro, setNnEstoqueErro] = useState(null);
    const [nnAnotacoes, setNnAnotacoes] = useState("");
    const [nnProximaAcao, setNnProximaAcao] = useState("");
    const [nnProximaAcaoData, setNnProximaAcaoData] = useState("");
    const [nnSalvando, setNnSalvando] = useState(false);
    const [nnErro, setNnErro] = useState(null);
    // Destaque visual temporário do card recém-criado (ver critério de
    // aceite "destacar visualmente o novo card por alguns segundos") — some
    // sozinho depois de 4s, sem precisar de nenhuma ação do usuário.
    const [destaqueId, setDestaqueId] = useState(null);
    // Item 4 — busca do estoque só quando o usuário abre a seção (mesmo
    // padrão "sob demanda" já usado em SidePanel.js, ver nota de Sprint 8
    // lá: evita uma chamada de rede completa toda vez que o modal Nova
    // Negociação abre, mesmo quando ninguém vai vincular veículo nenhum).
    useEffect(() => {
        if (!idToken || !nnBuscaVeiculoAberta)
            return;
        let cancelado = false;
        setNnEstoqueCarregando(true);
        setNnEstoqueErro(null);
        listEstoque(idToken)
            .then((lista) => {
            if (!cancelado)
                setNnEstoqueLista(lista);
        })
            .catch(() => {
            if (!cancelado)
                setNnEstoqueErro("Não foi possível consultar o estoque agora.");
        })
            .finally(() => {
            if (!cancelado)
                setNnEstoqueCarregando(false);
        });
        return () => {
            cancelado = true;
        };
    }, [nnBuscaVeiculoAberta, idToken]);
    const nnResultadosBusca = useMemo(() => (nnBuscaVeiculoAberta ? buscarVeiculosEstoque(nnEstoqueLista, nnTermoBuscaVeiculo).slice(0, 25) : []), [nnBuscaVeiculoAberta, nnEstoqueLista, nnTermoBuscaVeiculo]);
    function selecionarVeiculoEstoqueNovaNegociacao(veiculo) {
        setNnVeiculoEstoqueId(veiculo.id);
        setNnVeiculoInteresse([veiculo.marca, veiculo.modeloVersao, veiculo.ano].filter(Boolean).join(" "));
        setNnBuscaVeiculoAberta(false);
        setNnTermoBuscaVeiculo("");
    }
    function removerVeiculoEstoqueNovaNegociacao() {
        setNnVeiculoEstoqueId(null);
    }
    useEffect(() => {
        function aoRedimensionar() {
            setIsDesktop(window.innerWidth >= LARGURA_MINIMA_DRAG);
        }
        window.addEventListener("resize", aoRedimensionar);
        return () => window.removeEventListener("resize", aoRedimensionar);
    }, []);
    // Ciclo pós-produção (2026-08-13) — item 1 "Atualizar Pipeline": o corpo
    // do carregamento (antes só dentro do useEffect de montagem) virou uma
    // função reaproveitável, chamada tanto na montagem quanto pelo botão
    // "Atualizar" e pela atualização automática (item 4) — mesmas 7
    // chamadas de sempre, mesma lógica de junção da Timeline, nenhuma ação
    // nova no backend. `comSpinner` distingue a tela cheia de "Carregando
    // pipeline..." (só na primeira carga) de uma atualização silenciosa em
    // segundo plano (spinner discreto no botão via `atualizando`, sem
    // esconder o Kanban já visível).
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
            // Ciclo "Refinamentos Operacionais" (2026-08-18) — item 3: ordem
            // alfabética é só de exibição (ids/dados históricos intocados).
            setOrigens([...origensResp].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
            // Timeline: semeia com um evento de criação por oportunidade (para a
            // aba não começar vazia, mesma lógica desde o Passo 6) e junta com o
            // que já está persistido de verdade na planilha (mudança de etapa e
            // transferência, ver Timeline.gs) — os eventos novos gerados nesta
            // sessão são adicionados por cima via registrarEvento.
            //
            // Sprint 3.5 "Nova Negociação" (2026-08-03): a partir de agora
            // criarOportunidade_ grava um evento "criacao" de verdade na aba
            // Timeline (com autor e responsável reais na descrição) — para
            // essas oportunidades, a semente genérica abaixo duplicaria a
            // criação (uma sintética + uma real). Só semeia para oportunidades
            // que ainda não têm um "criacao" persistido de verdade.
            const idsComCriacaoPersistida = new Set(timelineResp.filter((ev) => ev.tipoEvento === "criacao").map((ev) => ev.oportunidadeId));
            const eventosCriacao = oportunidadesResp
                .filter((o) => !idsComCriacaoPersistida.has(o.id))
                .map((o) => ({
                id: "criacao-" + o.id,
                oportunidadeId: o.id,
                tipoEvento: "criacao",
                descricao: "Oportunidade criada",
                usuarioId: o.responsavelId,
                dataHora: o.criadoEm,
            }));
            setTimelineEventos([...eventosCriacao, ...timelineResp]);
            setUltimaAtualizacao(new Date());
            setErro(null);
        })
            .catch((e) => {
            // Ver comentário equivalente em Dashboard.tsx — mesmo bug, mesmo
            // conserto (catch que faltava + tratamento específico de sessão
            // expirada).
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            // Item 4: uma atualização em segundo plano que falhar não deve
            // substituir o Kanban já visível por uma mensagem de erro — só a
            // primeira carga (comSpinner) mostra erro de tela cheia. Uma
            // atualização silenciosa que falhar simplesmente tenta de novo
            // no próximo ciclo, sem incomodar quem está usando o sistema.
            if (comSpinner) {
                setErro("Não foi possível carregar o pipeline. Tente recarregar a página.");
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
    // Item 1 "Atualizar Pipeline" — clique manual do botão.
    function aoClicarAtualizar() {
        if (atualizando || carregando)
            return;
        void carregarDados(false);
    }
    // Item 4 "Atualização automática do Pipeline" — solução conservadora:
    // só atualiza quando a aba está visível E nenhuma interação está em
    // andamento (painel lateral fechado, nenhum modal de Nova Negociação
    // ou de motivo de perda aberto). Como nada é tocado enquanto qualquer
    // um desses estiver aberto, nunca há campo em edição, painel ou modal
    // para interromper — satisfaz todos os requisitos pedidos sem precisar
    // de nenhuma lógica de merge campo a campo. Intervalo de 3 minutos:
    // volume de uso é baixo (~30 leads/dia, poucos usuários simultâneos),
    // suficiente para não deixar ninguém olhando dado muito desatualizado
    // por muito tempo sem gerar chamadas excessivas ao backend. Sem
    // WebSocket/tempo real, como pedido.
    useEffect(() => {
        if (!idToken)
            return;
        var INTERVALO_ATUALIZACAO_MS = 3 * 60 * 1000;
        var intervalo = window.setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible")
                return;
            var algumaInteracaoAberta = selecionadaId !== null || novaNegociacaoAberta || dropPendente !== null;
            if (algumaInteracaoAberta)
                return;
            void carregarDados(false);
        }, INTERVALO_ATUALIZACAO_MS);
        return () => window.clearInterval(intervalo);
    }, [idToken, carregarDados, selecionadaId, novaNegociacaoAberta, dropPendente]);
    useEffect(() => {
        if (carregando || !oportunidadeInicialId)
            return;
        setSelecionadaId(oportunidadeInicialId);
        aoConsumirOportunidadeInicial?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carregando, oportunidadeInicialId]);
    // Ciclo pós-produção (2026-08-13) — item 6 "+ Nova Negociação no
    // Dashboard": mesmo padrão de ponte acima (oportunidadeInicialId), só
    // que abrindo o modal de Nova Negociação já existente em vez de
    // selecionar uma oportunidade — nenhum fluxo novo, reaproveita
    // abrirNovaNegociacao() tal como já usado pelo botão do próprio
    // Pipeline (função declarada mais abaixo neste componente; acessível
    // aqui por hoisting de function declaration, mesmo padrão já usado
    // pelo resto do arquivo).
    useEffect(() => {
        if (carregando || !abrirNovaNegociacaoInicial)
            return;
        abrirNovaNegociacao();
        aoConsumirAbrirNovaNegociacaoInicial?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carregando, abrirNovaNegociacaoInicial]);
    // Sprint 8 "Performance e Estabilidade" (2026-08-10): mapas id -> objeto/
    // lista construídos uma vez por mudança de dado (useMemo), em vez de
    // clientePorId/etapaPorId fazerem um Array.find() (O(n)) toda vez que
    // são chamados -- e são chamados uma vez por card renderizado, então
    // virava O(n²) numa coluna com várias oportunidades. Precisam ficar
    // ANTES dos early-returns de carregando/erro abaixo (mesma razão do
    // Dashboard.tsx: hooks não podem ser chamados depois de um return
    // condicional) -- calcular em cima dos arrays vazios do estado inicial
    // é barato e inofensivo.
    const clientesPorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
    const etapasPorId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);
    // Melhoria isolada "Etapa inicial na Nova Negociação" (2026-08-22):
    // etapas elegíveis para iniciar uma oportunidade -- só as ativas do
    // funil (nunca Perdido nem Venda/Documentação), na mesma ordem já
    // usada em todo o resto do Pipeline (listEtapas_ já devolve ordenado
    // por "ordem").
    const etapasElegiveisCriacao = useMemo(() => etapas.filter((e) => e.tipo === "ativa"), [etapas]);
    const etapaNovoLeadId = useMemo(() => etapas.find((e) => e.nome === "Novo Lead")?.id ?? "", [etapas]);
    // Ciclo pós-produção (2026-08-13) — itens 3 e 5: recorte visual do
    // Kanban por responsável (só Gerente/Administrador, ver
    // podeFiltrarPorResponsavel acima) e por termo de busca (nome do
    // cliente, telefone, veículo de interesse/estoque e o texto livre do
    // veículo na troca, onde a placa costuma aparecer -- ver nota em
    // services/oportunidades.ts sobre veiculoTrocaDescricao). Filtra sobre
    // `oportunidades` já carregado/autorizado -- nenhuma chamada nova ao
    // backend, nenhuma mudança de permissão: SDR/Closer já só têm a própria
    // carteira aqui (Oportunidades.gs), então a busca deles nunca alcança
    // dado de outra pessoa; para o Gerente, a busca respeita o filtro de
    // responsável porque opera sobre o resultado dele (aplicado antes).
    const oportunidadesVisiveis = useMemo(() => {
        let lista = oportunidades;
        if (podeFiltrarPorResponsavel && filtroResponsavelId) {
            lista = lista.filter((o) => o.responsavelId === filtroResponsavelId);
        }
        const termo = termoBusca.trim();
        if (!termo)
            return lista;
        const termoTexto = normalizarTexto(termo);
        const termoDigitos = normalizarDigitos(termo);
        return lista.filter((o) => {
            const cliente = clientesPorId.get(o.clienteId);
            const camposTexto = [cliente?.nome, o.veiculoInteresse, o.veiculoTrocaDescricao, o.veiculoEstoqueModeloVersao];
            if (camposTexto.some((v) => v && normalizarTexto(v).includes(termoTexto)))
                return true;
            if (termoDigitos.length >= 3) {
                const telefoneDigitos = normalizarDigitos(cliente?.telefone);
                if (telefoneDigitos.includes(termoDigitos))
                    return true;
            }
            return false;
        });
    }, [oportunidades, podeFiltrarPorResponsavel, filtroResponsavelId, termoBusca, clientesPorId]);
    // Agrupamento do Kanban: antes, cada coluna fazia `oportunidades.filter(...)`
    // dentro do próprio loop de render (etapas.map(...)) -- uma varredura
    // completa do array de oportunidades por coluna, em TODO render do
    // Pipeline (inclusive por uma tecla digitada num modal aberto, sem
    // relação nenhuma com o Kanban). Agora é um único Map construído só
    // quando `oportunidades`/`etapas` mudam de verdade.
    //
    // Ciclo pós-produção (2026-08-13): passou a agrupar `oportunidadesVisiveis`
    // (recorte por responsável/busca) em vez de `oportunidades` bruto -- só
    // afeta o que aparece nas colunas do Kanban; toda ação de escrita
    // (mover etapa, transferir etc.) continua operando sobre `oportunidades`
    // completo, nunca sobre o recorte.
    const oportunidadesPorEtapaId = useMemo(() => {
        const mapa = new Map();
        for (const etapa of etapas)
            mapa.set(etapa.id, []);
        for (const o of oportunidadesVisiveis) {
            const lista = mapa.get(o.etapaId);
            if (lista)
                lista.push(o);
            else
                mapa.set(o.etapaId, [o]);
        }
        // Ciclo "Refinamentos Operacionais" (2026-08-18) — item 1: ordena os
        // cards de cada coluna por criadoEm (data de criação do lead — sempre
        // presente e estável, ao contrário de atualizadoEm, que muda a
        // qualquer edição). Só reordena a exibição; não altera moverEtapa,
        // dedupe ou qualquer outra lógica.
        const multiplicador = ordemData === "antigas" ? 1 : -1;
        for (const lista of mapa.values()) {
            lista.sort((a, b) => multiplicador * String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? "")));
        }
        return mapa;
    }, [oportunidadesVisiveis, etapas, ordemData]);
    // Eventos de Timeline agrupados e já ordenados por oportunidade -- antes
    // recalculado (filter + sort) a cada render enquanto o painel lateral
    // estava aberto, mesmo para mudanças de estado sem nenhuma relação com a
    // Timeline. Só recalcula quando `timelineEventos` de fato cresce (nova
    // ação registrada).
    const eventosPorOportunidadeId = useMemo(() => {
        const mapa = new Map();
        for (const ev of timelineEventos) {
            const lista = mapa.get(ev.oportunidadeId);
            if (lista)
                lista.push(ev);
            else
                mapa.set(ev.oportunidadeId, [ev]);
        }
        for (const lista of mapa.values()) {
            lista.sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
        }
        return mapa;
    }, [timelineEventos]);
    // Handlers estáveis (useCallback, sem dependências que mudam por
    // render) passados ao OpportunityCard -- pré-condição para o
    // React.memo em OpportunityCard.tsx realmente evitar re-render de
    // cards que não mudaram (ver comentário lá). Recebem o id da
    // oportunidade como argumento (contrato novo, ver OpportunityCard.tsx)
    // em vez de o Pipeline criar um closure "() => algo(o.id)" novo por
    // card a cada render.
    const handleClickCard = useCallback((id) => {
        setSelecionadaId(id);
    }, []);
    const handleDragStartCardEstavel = useCallback((id, e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        setArrastandoId(id);
    }, []);
    const handleDragEndCardEstavel = useCallback(() => {
        setArrastandoId(null);
        setColunaSobreId(null);
    }, []);
    if (carregando)
        return _jsx("p", { className: "pipeline-loading", children: "Carregando pipeline..." });
    if (erro)
        return _jsx("p", { className: "pipeline-loading", children: erro });
    const clientePorId = (id) => clientesPorId.get(id);
    const etapaPorId = (id) => etapasPorId.get(id);
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
    // Item 5 "Reabrir oportunidade perdida" (Ciclo 22, 2026-08-18) — ação
    // deliberada e SEPARADA de moverEtapa (que continua recusando qualquer
    // movimentação para fora de ganho/perdido, sem nenhuma mudança aqui).
    // Duas camadas de validação de etapa, mesma filosofia de sempre: aqui é
    // a primeira barreira (feedback imediato), quem manda é o backend
    // (reabrirOportunidade_ valida de novo). Mesmo padrão {ok, erro} das
    // demais ações de escrita desta tela.
    async function reabrir(oportunidadeId, novaEtapaId) {
        const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
        const etapaAtual = oportunidade ? etapaPorId(oportunidade.etapaId) : undefined;
        const etapaNova = etapaPorId(novaEtapaId);
        if (!oportunidade || !etapaNova)
            return { ok: false, erro: "Etapa de destino inválida." };
        if (!etapaAtual || etapaAtual.tipo !== "perdido") {
            return { ok: false, erro: "Só é possível reabrir oportunidades que estão em Perdido." };
        }
        if (etapaNova.tipo === "ganho" || etapaNova.tipo === "perdido") {
            return { ok: false, erro: "Etapa de destino da reabertura precisa ser uma etapa ativa do funil." };
        }
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            await reabrirOportunidade({ oportunidadeId, novaEtapaId, usuarioId: usuario?.id }, idToken);
            const agora = new Date().toISOString();
            const atualizacao = { etapaId: novaEtapaId, atualizadoEm: agora, reabertoEm: agora, reabertoPor: usuario?.id };
            setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? { ...o, ...atualizacao } : o)));
            const nomeAtor = usuario?.nome ?? "Alguém";
            const descricao = `${nomeAtor} reabriu de "${etapaAtual.nome}" para "${etapaNova.nome}"`;
            registrarEvento(oportunidadeId, descricao, "reabertura");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível reabrir a oportunidade agora.";
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
    // Sprint 3 "Integração com Estoque do Simples" (2026-08-03) — associação
    // de um veículo real do estoque. Mesmo padrão {ok, erro} de moverEtapa/
    // transferir. O backend (associarVeiculoEstoque_) grava o snapshot e
    // preenche veiculo_interesse; aqui só refletimos o retorno no estado
    // local (mesma filosofia: quem manda é o backend, o frontend não
    // recalcula nada por conta própria).
    async function associarVeiculo(oportunidadeId, veiculoEstoqueId) {
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            const resultado = await associarVeiculoEstoque({
                oportunidadeId,
                veiculoEstoqueId,
                usuarioId: usuario?.id,
            }, idToken);
            const agora = new Date().toISOString();
            setOportunidades((prev) => prev.map((o) => o.id === oportunidadeId
                ? {
                    ...o,
                    veiculoInteresse: resultado.veiculoInteresse,
                    veiculoEstoqueId: resultado.veiculoEstoque.id,
                    veiculoEstoqueMarca: resultado.veiculoEstoque.marca ?? undefined,
                    veiculoEstoqueModeloVersao: resultado.veiculoEstoque.modeloVersao ?? undefined,
                    veiculoEstoqueAno: resultado.veiculoEstoque.ano ?? undefined,
                    veiculoEstoqueKm: resultado.veiculoEstoque.km ?? undefined,
                    veiculoEstoquePreco: resultado.veiculoEstoque.preco ?? undefined,
                    veiculoEstoqueImagem: resultado.veiculoEstoque.imagemPrincipal ?? undefined,
                    veiculoEstoqueAssociadoEm: agora,
                    atualizadoEm: agora,
                }
                : o));
            registrarEvento(oportunidadeId, `${usuario?.nome ?? "Alguém"} associou o veículo "${resultado.veiculoInteresse}" (Simples #${veiculoEstoqueId})`, "veiculo_associado");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível associar o veículo agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    // Sprint 6 "Operação do dia a dia" (2026-08-07) — item 1 "Excluir
    // negociação". Exclusão é lógica no backend (ver excluirOportunidade_ em
    // Oportunidades.gs) — aqui só removemos do estado local do Kanban e
    // fechamos o painel lateral após confirmar sucesso. A confirmação em si
    // (modal) já aconteceu dentro do SidePanel antes desta função ser
    // chamada.
    async function excluir(oportunidadeId) {
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            await excluirOportunidade(oportunidadeId, usuario?.id, idToken);
            setOportunidades((prev) => prev.filter((o) => o.id !== oportunidadeId));
            setSelecionadaId((atual) => (atual === oportunidadeId ? null : atual));
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível excluir a oportunidade agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    // Sprint 6 (2026-08-07) — itens 4 e 5 "Editar dados do cliente"/"Editar
    // data de início da negociação". Um único endpoint no backend
    // (editarDadosOportunidade_) atualiza cliente e oportunidade juntos —
    // aqui refletimos as duas mudanças no estado local a partir do retorno
    // da API (mesma filosofia "quem manda é o backend" das outras ações) e
    // registramos um evento local na Timeline espelhando a descrição que o
    // backend já gravou de verdade.
    async function editarDados(oportunidadeId, dados) {
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            const resultado = await editarDadosOportunidade({ oportunidadeId, ...dados, usuarioId: usuario?.id }, idToken);
            setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? resultado.oportunidade : o)));
            const clienteAtualizado = resultado.cliente;
            if (clienteAtualizado) {
                setClientes((prev) => prev.map((c) => (c.id === clienteAtualizado.id ? clienteAtualizado : c)));
            }
            registrarEvento(oportunidadeId, `${usuario?.nome ?? "Alguém"} editou dados cadastrais da negociação`, "dados_editados");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível salvar os dados agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    // Sprint 3.5 "Nova Negociação" (2026-08-03) — abre o modal com o
    // formulário limpo. Reseta todo o estado do formulário aqui (em vez de só
    // no ponto de sucesso) para o caso do usuário abrir, cancelar e abrir de
    // novo não herdar lixo de uma tentativa anterior.
    function abrirNovaNegociacao() {
        setNnNome("");
        setNnTelefone("");
        setNnOrigemId("");
        setNnResponsavelId("");
        setNnEtapaInicialId(etapaNovoLeadId);
        setNnCidade("");
        setNnVeiculoInteresse("");
        setNnVeiculoEstoqueId(null);
        setNnBuscaVeiculoAberta(false);
        setNnTermoBuscaVeiculo("");
        setNnEstoqueErro(null);
        setNnAnotacoes("");
        setNnProximaAcao("");
        setNnProximaAcaoData("");
        setNnErro(null);
        setNovaNegociacaoAberta(true);
    }
    function fecharNovaNegociacao() {
        if (nnSalvando)
            return; // não fecha no meio de uma gravação em andamento
        setNovaNegociacaoAberta(false);
    }
    // Validação client-side espelha exatamente as 4 obrigatoriedades do
    // backend (nome, telefone, origem, responsável) — mesma filosofia de
    // "duas camadas" já usada em moverEtapa: aqui é feedback imediato, quem
    // manda de verdade é o backend (criarOportunidade_ valida de novo).
    async function salvarNovaNegociacao() {
        const nome = nnNome.trim();
        const telefone = nnTelefone.trim();
        if (!nome || !telefone || !nnOrigemId || !nnResponsavelId) {
            setNnErro("Nome, telefone, origem e responsável são obrigatórios.");
            return;
        }
        setNnSalvando(true);
        setNnErro(null);
        try {
            const resultado = await criarOportunidade({
                nome,
                telefone,
                origemId: nnOrigemId,
                responsavelId: nnResponsavelId,
                etapaInicialId: nnEtapaInicialId || undefined,
                cidade: nnCidade.trim() || undefined,
                veiculoInteresse: nnVeiculoInteresse.trim() || undefined,
                veiculoEstoqueId: nnVeiculoEstoqueId || undefined,
                anotacoesIniciais: nnAnotacoes.trim() || undefined,
                proximaAcao: nnProximaAcao.trim() || undefined,
                proximaAcaoData: nnProximaAcaoData || undefined,
                usuarioId: usuario?.id,
            }, idToken);
            // Cliente pode ser reaproveitado (telefone já cadastrado) ou novo —
            // só adiciona ao estado local se ainda não estiver lá, pra não
            // duplicar na lista quando o backend reaproveitou um existente.
            setClientes((prev) => (prev.some((c) => c.id === resultado.cliente.id) ? prev : [...prev, resultado.cliente]));
            setOportunidades((prev) => [...prev, resultado.oportunidade]);
            const nomeAtor = usuario?.nome ?? "Alguém";
            const nomeResponsavel = usuarios.find((u) => u.id === nnResponsavelId)?.nome ?? "?";
            let descricaoCriacao = `${nomeAtor} criou a oportunidade`;
            if (usuario && usuario.id !== nnResponsavelId)
                descricaoCriacao += ` (responsável: "${nomeResponsavel}")`;
            // Melhoria isolada "Etapa inicial na Nova Negociação" (2026-08-22):
            // eco local do mesmo texto que o backend grava no evento
            // "criacao" (ver criarOportunidade_) quando a oportunidade nasce
            // fora de Novo Lead -- sem gerar nenhum evento "mudanca_etapa"
            // separado, para não fabricar uma movimentação que não aconteceu.
            if (nnEtapaInicialId && nnEtapaInicialId !== etapaNovoLeadId) {
                const nomeEtapaInicial = etapasPorId.get(nnEtapaInicialId)?.nome ?? "?";
                descricaoCriacao += ` já na etapa "${nomeEtapaInicial}"`;
            }
            registrarEvento(resultado.oportunidade.id, descricaoCriacao, "criacao");
            // Critérios de aceite: fechar modal, atualizar Kanban (já feito acima
            // via setOportunidades), abrir o painel lateral da nova oportunidade,
            // destacar o card por alguns segundos.
            setNovaNegociacaoAberta(false);
            setSelecionadaId(resultado.oportunidade.id);
            setDestaqueId(resultado.oportunidade.id);
            window.setTimeout(() => {
                setDestaqueId((atual) => (atual === resultado.oportunidade.id ? null : atual));
            }, 4000);
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível criar a negociação agora.";
            setNnErro(mensagem);
        }
        finally {
            setNnSalvando(false);
        }
    }
    // Sprint 7 "Próximas Ações" (2026-08-07) — criar/editar a próxima ação
    // estruturada (persiste de verdade, ver atualizarProximaAcao_ em
    // Oportunidades.gs) e concluí-la. Substitui o Passo 7 (Sprint 1), que
    // nunca persistia — ficava só em memória do navegador. Mesmo padrão
    // {ok, erro} das demais ações de escrita desta tela.
    async function salvarProximaAcao(oportunidadeId, dados) {
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            const oportunidadeAtualizada = await atualizarProximaAcao({ oportunidadeId, tipo: dados.tipo, outroTexto: dados.outroTexto, data: dados.data, responsavelId: dados.responsavelId, usuarioId: usuario?.id }, idToken);
            setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? oportunidadeAtualizada : o)));
            const descricaoTipo = dados.tipo === "Outro" ? dados.outroTexto || "Outro" : dados.tipo;
            const responsavelId = dados.responsavelId || oportunidadeAtualizada.responsavelId;
            const nomeResponsavel = usuarios.find((u) => u.id === responsavelId)?.nome ?? "?";
            // Texto espelha exatamente o que atualizarProximaAcao_ (Oportunidades.gs)
            // já persistiu de verdade na aba Timeline — ver formatarDataHoraCurta em
            // utils/proximaAcao.ts. Precisa bater 1:1 porque este evento aparece na
            // tela antes de qualquer reload; um texto diferente do que está
            // realmente salvo confundiria quem está lendo a Timeline.
            registrarEvento(oportunidadeId, `"${usuario?.nome ?? "Alguém"}" criou: ${descricaoTipo} -- ${formatarDataHoraCurta(dados.data)} (responsável: ${nomeResponsavel}).`, "proxima_acao_criada");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível salvar a próxima ação agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    async function concluirAcao(oportunidadeId) {
        const oportunidadeAtual = oportunidades.find((o) => o.id === oportunidadeId);
        const descricaoAntes = oportunidadeAtual
            ? oportunidadeAtual.proximaAcaoTipo
                ? oportunidadeAtual.proximaAcaoTipo === "Outro"
                    ? oportunidadeAtual.proximaAcaoOutroTexto || "Outro"
                    : oportunidadeAtual.proximaAcaoTipo
                : oportunidadeAtual.proximaAcao
            : "";
        setSalvandoAcao(true);
        setAcaoErro(null);
        try {
            const oportunidadeAtualizada = await concluirProximaAcao(oportunidadeId, usuario?.id, idToken);
            setOportunidades((prev) => prev.map((o) => (o.id === oportunidadeId ? oportunidadeAtualizada : o)));
            // Mesmo racional do evento acima: espelha exatamente o texto que
            // concluirProximaAcao_ já persistiu na aba Timeline.
            registrarEvento(oportunidadeId, `"${usuario?.nome ?? "Alguém"}" concluiu: ${descricaoAntes}.`, "proxima_acao_concluida");
            return { ok: true };
        }
        catch (e) {
            const mensagem = e instanceof Error ? e.message : "Não foi possível concluir a ação agora.";
            setAcaoErro(mensagem);
            return { ok: false, erro: mensagem };
        }
        finally {
            setSalvandoAcao(false);
        }
    }
    // --- Drag-and-drop (desktop) ------------------------------------------
    //
    // Sprint 8 "Performance e Estabilidade" (2026-08-10): handleDragStartCard/
    // handleDragEndCard (fábrica de closure + função recriada por render)
    // foram substituídas pelas versões estáveis handleDragStartCardEstavel/
    // handleDragEndCardEstavel (useCallback, declaradas antes do
    // early-return acima) para o React.memo do OpportunityCard funcionar de
    // verdade -- ver comentário lá. Mesmo comportamento, só a identidade da
    // função passada como prop que agora não muda a cada render.
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
    return (_jsxs("div", { className: "pipeline", children: [_jsxs("div", { className: "pipeline__topo", children: [_jsxs("div", { className: "pipeline__topo-esquerda", children: [podeFiltrarPorResponsavel && (_jsxs("select", { className: "pipeline__filtro-responsavel", value: filtroResponsavelId, onChange: (e) => setFiltroResponsavelId(e.target.value), "aria-label": "Filtrar por respons\u00E1vel", children: [_jsx("option", { value: "", children: "Todos os respons\u00E1veis" }), usuarios.filter((u) => u.ativo).map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] })), _jsx("input", { type: "text", className: "pipeline__busca", placeholder: "Buscar por nome, telefone ou placa\u2026", value: termoBusca, onChange: (e) => setTermoBusca(e.target.value), "aria-label": "Buscar lead" }), _jsxs("select", { className: "pipeline__ordenacao", value: ordemData, onChange: (e) => setOrdemData(e.target.value), "aria-label": "Ordenar cards por data", children: [_jsx("option", { value: "recentes", children: "Mais recentes primeiro" }), _jsx("option", { value: "antigas", children: "Mais antigas primeiro" })] })] }), _jsxs("div", { className: "pipeline__topo-direita", children: [_jsx("button", { className: "pipeline__botao-atualizar", onClick: aoClicarAtualizar, disabled: atualizando || carregando, children: atualizando ? "Atualizando\u2026" : "\u21BB Atualizar" }), ultimaAtualizacao && (_jsxs("span", { className: "pipeline__ultima-atualizacao", children: ["Atualizado \u00E0s ", formatarHoraCurta(ultimaAtualizacao)] })), _jsx("button", { className: "pipeline__botao-nova", onClick: abrirNovaNegociacao, children: "+ Nova Negocia\u00E7\u00E3o" })] })] }), acaoErro && _jsx("p", { className: "pipeline__aviso-acao", children: acaoErro }), _jsx("div", { className: "pipeline__board", children: etapas.map((etapa) => {
                    // Sprint 8: vem do Map memoizado (oportunidadesPorEtapaId) em vez
                    // de filtrar o array inteiro de novo a cada render/coluna.
                    const opsDaEtapa = oportunidadesPorEtapaId.get(etapa.id) ?? [];
                    const etapaFinal = etapa.tipo === "ganho" || etapa.tipo === "perdido";
                    const arrastavel = isDesktop && !etapaFinal;
                    return (_jsxs("section", { className: `pipeline__coluna pipeline__coluna--${etapa.tipo}` +
                            (colunaSobreId === etapa.id ? " pipeline__coluna--sobre" : ""), onDragOver: isDesktop ? handleDragOverColuna(etapa.id) : undefined, onDrop: isDesktop ? handleDropColuna(etapa.id) : undefined, children: [_jsxs("header", { className: "pipeline__coluna-header", children: [_jsx("h2", { children: etapa.nome }), _jsx("span", { className: "pipeline__contagem", children: opsDaEtapa.length })] }), _jsxs("div", { className: "pipeline__coluna-cards", children: [opsDaEtapa.length === 0 && _jsx("p", { className: "pipeline__vazio", children: "Sem oportunidades" }), opsDaEtapa.map((o) => (_jsx(OpportunityCard, { oportunidade: o, cliente: clientePorId(o.clienteId), onClick: handleClickCard, arrastavel: arrastavel, onDragStart: handleDragStartCardEstavel, onDragEnd: handleDragEndCardEstavel, destaque: destaqueId === o.id }, o.id)))] })] }, etapa.id));
                }) }), oportunidadeSelecionada &&
                (() => {
                    const etapaAtual = etapaPorId(oportunidadeSelecionada.etapaId);
                    // Sprint 8: vem do Map memoizado (eventosPorOportunidadeId, já
                    // filtrado e ordenado) em vez de filtrar+ordenar timelineEventos
                    // inteiro de novo a cada render enquanto o painel está aberto.
                    const eventosDaOportunidade = eventosPorOportunidadeId.get(oportunidadeSelecionada.id) ?? [];
                    return (_jsx(SidePanel, { oportunidade: oportunidadeSelecionada, cliente: clientePorId(oportunidadeSelecionada.clienteId), responsavel: usuarios.find((u) => u.id === oportunidadeSelecionada.responsavelId), usuarios: usuarios, etapas: etapas, etapaAtual: etapaAtual, motivosPerda: motivosPerda, origens: origens, timelineEventos: eventosDaOportunidade, onFechar: () => setSelecionadaId(null), onMoverEtapa: (novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto) => moverEtapa(oportunidadeSelecionada.id, novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto), onReabrir: (novaEtapaId) => reabrir(oportunidadeSelecionada.id, novaEtapaId), onTransferir: (novoResponsavelId) => transferir(oportunidadeSelecionada.id, novoResponsavelId), onAssociarVeiculoEstoque: (veiculoEstoqueId) => associarVeiculo(oportunidadeSelecionada.id, veiculoEstoqueId), onSalvarProximaAcao: (dados) => salvarProximaAcao(oportunidadeSelecionada.id, dados), onConcluirProximaAcao: () => concluirAcao(oportunidadeSelecionada.id), onChecklistMarcado: (textoItem) => registrarEvento(oportunidadeSelecionada.id, `Item do checklist concluído: "${textoItem}"`, "checklist"), onEditarDados: (dados) => editarDados(oportunidadeSelecionada.id, dados), onExcluir: () => excluir(oportunidadeSelecionada.id) }));
                })(), dropPendente && (_jsx("div", { className: "drop-motivo-overlay", onClick: cancelarDropPendente, children: _jsxs("div", { className: "drop-motivo-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Motivo da perda" }), _jsxs("p", { className: "side-panel__cliente", children: ["Movendo \"", oportunidadeDropPendente?.veiculoInteresse ?? "", "\" para Perdido"] }), _jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: motivoModalAlvo, onChange: (e) => setMotivoModalAlvo(e.target.value), children: [_jsx("option", { value: "", children: "Selecione o motivo da perda\u2026" }), motivosPerda.map((m) => (_jsx("option", { value: m.id, children: m.nome }, m.id)))] }), motivosPerda.find((m) => m.id === motivoModalAlvo)?.nome === "Outro" && (_jsx("input", { type: "text", placeholder: "Descreva o motivo\u2026", value: motivoModalOutro, onChange: (e) => setMotivoModalOutro(e.target.value) })), motivoModalErro && _jsx("p", { className: "side-panel__aviso", children: motivoModalErro }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: confirmarDropPendente, disabled: salvandoAcao, children: salvandoAcao ? "Movendo…" : "Confirmar" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: cancelarDropPendente, children: "Cancelar" })] })] })] }) })), novaNegociacaoAberta && (_jsx("div", { className: "nova-negociacao-overlay", onClick: fecharNovaNegociacao, children: _jsxs("div", { className: "nova-negociacao-modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { children: "Nova negocia\u00E7\u00E3o" }), _jsxs("div", { className: "side-panel__form", children: [_jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Nome do cliente *" }), _jsx("input", { type: "text", value: nnNome, onChange: (e) => setNnNome(e.target.value), autoFocus: true })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Telefone *" }), _jsx("input", { type: "text", value: nnTelefone, onChange: (e) => setNnTelefone(e.target.value), placeholder: "(48) 99999-0000" })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Origem *" }), _jsxs("select", { value: nnOrigemId, onChange: (e) => setNnOrigemId(e.target.value), children: [_jsx("option", { value: "", children: "Selecione a origem\u2026" }), origens.map((o) => (_jsx("option", { value: o.id, children: o.nome }, o.id)))] })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Respons\u00E1vel *" }), _jsxs("select", { value: nnResponsavelId, onChange: (e) => setNnResponsavelId(e.target.value), children: [_jsx("option", { value: "", children: "Selecione o respons\u00E1vel\u2026" }), usuarios
                                                    .filter((u) => u.ativo)
                                                    .map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Etapa inicial" }), _jsx("select", { value: nnEtapaInicialId, onChange: (e) => setNnEtapaInicialId(e.target.value), children: etapasElegiveisCriacao.map((et) => (_jsx("option", { value: et.id, children: et.nome }, et.id))) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Cidade" }), _jsx("input", { type: "text", value: nnCidade, onChange: (e) => setNnCidade(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Ve\u00EDculo de interesse" }), _jsx("input", { type: "text", value: nnVeiculoInteresse, onChange: (e) => setNnVeiculoInteresse(e.target.value) })] }), _jsxs("div", { className: "side-panel__secao", children: [_jsx("h3", { className: "side-panel__secao-titulo", children: "Ve\u00EDculo do estoque (opcional)" }), nnVeiculoEstoqueId && (_jsxs("p", { className: "side-panel__proxima-acao-meta", children: ["Vinculado ao estoque.", " ", _jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: removerVeiculoEstoqueNovaNegociacao, children: "Remover v\u00EDnculo" })] })), !nnVeiculoEstoqueId && !nnBuscaVeiculoAberta && (_jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setNnBuscaVeiculoAberta(true), children: "Vincular ve\u00EDculo do estoque" })), !nnVeiculoEstoqueId && nnBuscaVeiculoAberta && (_jsxs("div", { className: "side-panel__form", children: [_jsx("input", { type: "text", placeholder: "Buscar por marca, modelo/vers\u00E3o ou ano\u2026", value: nnTermoBuscaVeiculo, onChange: (e) => setNnTermoBuscaVeiculo(e.target.value), autoFocus: true }), nnEstoqueCarregando && _jsx("p", { className: "side-panel__vazio-aba", children: "Carregando estoque\u2026" }), !nnEstoqueCarregando && !nnEstoqueErro && (_jsxs("ul", { className: "side-panel__estoque-resultados", children: [nnResultadosBusca.length === 0 && (_jsx("li", { className: "side-panel__vazio-aba", children: "Nenhum ve\u00EDculo encontrado." })), nnResultadosBusca.map((v) => (_jsxs("li", { className: "side-panel__estoque-item", children: [v.imagemPrincipal && _jsx("img", { src: v.imagemPrincipal, alt: v.modeloVersao ?? "Ve\u00EDculo" }), _jsx("div", { className: "side-panel__estoque-item-info", children: _jsx("strong", { children: [v.marca, v.modeloVersao, v.ano].filter(Boolean).join(" ") }) }), _jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: () => selecionarVeiculoEstoqueNovaNegociacao(v), children: "Selecionar" })] }, v.id)))] })), nnEstoqueErro && _jsx("p", { className: "side-panel__aviso", children: nnEstoqueErro }), _jsx("div", { className: "side-panel__form-acoes", children: _jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => { setNnBuscaVeiculoAberta(false); setNnTermoBuscaVeiculo(""); }, children: "Cancelar" }) })] }))] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Anota\u00E7\u00F5es iniciais" }), _jsx("textarea", { value: nnAnotacoes, onChange: (e) => setNnAnotacoes(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Pr\u00F3xima a\u00E7\u00E3o" }), _jsx("input", { type: "text", value: nnProximaAcao, onChange: (e) => setNnProximaAcao(e.target.value) })] }), _jsxs("label", { className: "side-panel__campo", children: [_jsx("span", { children: "Data e hora da pr\u00F3xima a\u00E7\u00E3o" }), _jsx("input", { type: "datetime-local", value: nnProximaAcaoData, onChange: (e) => setNnProximaAcaoData(e.target.value) })] }), nnErro && _jsx("p", { className: "side-panel__aviso", children: nnErro }), _jsxs("div", { className: "side-panel__form-acoes", children: [_jsx("button", { className: "side-panel__botao-primario", onClick: salvarNovaNegociacao, disabled: nnSalvando, children: nnSalvando ? "Salvando…" : "Salvar" }), _jsx("button", { className: "side-panel__botao-secundario", onClick: fecharNovaNegociacao, disabled: nnSalvando, children: "Cancelar" })] })] })] }) }))] }));
}
