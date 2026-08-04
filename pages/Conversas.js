import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { listOportunidades, listEtapas, listUsuarios, listMotivosPerda, listTimeline, moverEtapaOportunidade, transferirOportunidade, } from "../services/oportunidades.js";
import { listConversas, listMensagensConversa, enviarMensagemWhatsapp, vincularConversaOportunidade, } from "../services/whatsapp.js";
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const formatoDiaCompleto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
function formatarDataHora(iso) {
    if (!iso)
        return "";
    const data = new Date(iso);
    if (Number.isNaN(data.getTime()))
        return iso;
    return formatoDataHora.format(data);
}
// Mesmo breakpoint usado no CSS (@media max-width: 720px) e no Pipeline —
// abaixo disso a tela vira painel único (lista OU conversa) em vez de
// lista e conversa lado a lado.
const LARGURA_MOBILE = 721;
// Atualização automática: intervalo conservador o bastante para não gerar
// carga desnecessária no Apps Script (cota de execução por dia é
// compartilhada com o resto do CRM), mas curto o bastante para a equipe
// não precisar mais dar F5 pra ver mensagem nova — esse era o maior gap
// em relação ao Digisac.
const INTERVALO_ATUALIZACAO_MS = 20000;
const CHAVE_LOCALSTORAGE_LEITURA = "companycar_conversas_ultima_leitura_v1";
function lerUltimasLeituras() {
    try {
        const bruto = window.localStorage.getItem(CHAVE_LOCALSTORAGE_LEITURA);
        return bruto ? JSON.parse(bruto) : {};
    }
    catch {
        return {};
    }
}
function gravarUltimasLeituras(mapa) {
    try {
        window.localStorage.setItem(CHAVE_LOCALSTORAGE_LEITURA, JSON.stringify(mapa));
    }
    catch {
        // localStorage indisponível (ex.: modo privado) — o indicador de não
        // lida simplesmente não persiste entre sessões; não é crítico.
    }
}
// Mensagens enviadas pelo CRM chegam do backend já com "*Nome:*\n\n" na
// frente (é a formatação de negrito que o próprio WhatsApp usa — ver
// enviarMensagemWhatsapp_ em WhatsApp.gs). Sem isso, a tela mostrava o
// asterisco cru pro atendente, o que pesava contra a legibilidade e contra
// a "identificação clara do atendente" pedida pelo CEO.
const PADRAO_PREFIXO_AUTOR = /^\*(.+?):\*\n\n([\s\S]*)$/;
function separarAutorEtexto(direcao, conteudo) {
    if (direcao !== "enviada")
        return { autor: null, texto: conteudo };
    const match = conteudo.match(PADRAO_PREFIXO_AUTOR);
    if (!match)
        return { autor: null, texto: conteudo };
    return { autor: match[1], texto: match[2] };
}
function rotuloDia(iso) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime()))
        return "";
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    if (data.toDateString() === hoje.toDateString())
        return "Hoje";
    if (data.toDateString() === ontem.toDateString())
        return "Ontem";
    return formatoDiaCompleto.format(data);
}
function agruparPorDia(mensagens) {
    const grupos = [];
    for (const m of mensagens) {
        const data = new Date(m.enviadoEm);
        const chaveDia = Number.isNaN(data.getTime()) ? "?" : data.toDateString();
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.chave === chaveDia) {
            ultimo.mensagens.push(m);
        }
        else {
            grupos.push({ chave: chaveDia, rotulo: rotuloDia(m.enviadoEm), mensagens: [m] });
        }
    }
    return grupos;
}
function normalizarBusca(texto) {
    const semAcentos = texto
        .toLowerCase()
        .normalize("NFD")
        .split("")
        .filter((ch) => {
        const codigo = ch.charCodeAt(0);
        return codigo < 0x0300 || codigo > 0x036f;
    })
        .join("");
    return semAcentos;
}
function apenasDigitos(texto) {
    return texto.replace(/\D/g, "");
}
export function Conversas({ onAbrirNoPipeline }) {
    const { idToken, logout, usuario } = useAuth();
    const [conversas, setConversas] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [etapas, setEtapas] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [motivosPerda, setMotivosPerda] = useState([]);
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
    // --- Refinamento de UX (2026-08-04) -------------------------------
    const [busca, setBusca] = useState("");
    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < LARGURA_MOBILE : false);
    const [ultimaLeituraPorChave, setUltimaLeituraPorChave] = useState(() => lerUltimasLeituras());
    const [painelAcoesAberto, setPainelAcoesAberto] = useState(false);
    const [etapaAlvo, setEtapaAlvo] = useState("");
    const [motivoAlvo, setMotivoAlvo] = useState("");
    const [motivoOutro, setMotivoOutro] = useState("");
    const [responsavelAlvo, setResponsavelAlvo] = useState("");
    const [salvandoAcaoRapida, setSalvandoAcaoRapida] = useState(false);
    const [erroAcaoRapida, setErroAcaoRapida] = useState(null);
    const [sucessoAcaoRapida, setSucessoAcaoRapida] = useState(null);
    const [timelineAberta, setTimelineAberta] = useState(false);
    const [carregandoTimeline, setCarregandoTimeline] = useState(false);
    const [timelineCache, setTimelineCache] = useState({});
    const conversasRef = useRef([]);
    const mensagensContainerRef = useRef(null);
    useEffect(() => {
        conversasRef.current = conversas;
    }, [conversas]);
    useEffect(() => {
        function aoRedimensionar() {
            setIsMobile(window.innerWidth < LARGURA_MOBILE);
        }
        window.addEventListener("resize", aoRedimensionar);
        return () => window.removeEventListener("resize", aoRedimensionar);
    }, []);
    useEffect(() => {
        if (!idToken)
            return;
        Promise.all([
            listConversas(idToken),
            listOportunidades(idToken),
            listEtapas(idToken),
            listUsuarios(idToken),
            listMotivosPerda(idToken),
        ])
            .then(([conversasResp, oportunidadesResp, etapasResp, usuariosResp, motivosPerdaResp]) => {
            setConversas(conversasResp);
            setOportunidades(oportunidadesResp);
            setEtapas(etapasResp);
            setUsuarios(usuariosResp);
            setMotivosPerda(motivosPerdaResp);
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
    // Atualização automática da lista de conversas — silenciosa (não mexe no
    // spinner de carregando nem interrompe o que a pessoa está digitando).
    // Pausa quando a aba está em segundo plano pra não gastar chamada à toa.
    useEffect(() => {
        if (!idToken)
            return;
        const intervalo = window.setInterval(() => {
            if (document.hidden)
                return;
            listConversas(idToken)
                .then((novasConversas) => {
                setConversas(novasConversas);
            })
                .catch((e) => {
                if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA)
                    logout();
                // outros erros de atualização silenciosa: só tenta de novo no
                // próximo ciclo, sem quebrar a tela.
            });
        }, INTERVALO_ATUALIZACAO_MS);
        return () => window.clearInterval(intervalo);
    }, [idToken, logout]);
    function marcarComoLida(conversa) {
        setUltimaLeituraPorChave((prev) => {
            const referencia = conversa.ultimaInteracaoEm || new Date().toISOString();
            if (prev[conversa.chave] && prev[conversa.chave] >= referencia)
                return prev;
            const novo = { ...prev, [conversa.chave]: referencia };
            gravarUltimasLeituras(novo);
            return novo;
        });
    }
    function conversaNaoLida(c) {
        if (c.ultimaMensagemDirecao !== "recebida")
            return false;
        const lida = ultimaLeituraPorChave[c.chave];
        if (!lida)
            return true;
        return new Date(c.ultimaInteracaoEm).getTime() > new Date(lida).getTime();
    }
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
        // Reseta a caixa de resposta / o formulário de vínculo / o painel de
        // ações rápidas ao trocar de conversa, para não herdar rascunho ou
        // erro de uma conversa anterior.
        setTexto("");
        setErroEnvio(null);
        setVincularOportunidadeId("");
        setErroVincular(null);
        setPainelAcoesAberto(false);
        setEtapaAlvo("");
        setMotivoAlvo("");
        setMotivoOutro("");
        setResponsavelAlvo("");
        setErroAcaoRapida(null);
        setSucessoAcaoRapida(null);
        setTimelineAberta(false);
        marcarComoLida(conversa);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selecionadaChave, idToken, logout]);
    // Atualização automática das mensagens da conversa aberta — mesma lógica
    // de pausa em segundo plano. Só substitui o estado se algo realmente
    // mudou (compara tamanho + id da última mensagem), pra não "pular" a
    // rolagem do usuário à toa a cada ciclo.
    useEffect(() => {
        if (!idToken || !selecionadaChave)
            return;
        const intervalo = window.setInterval(() => {
            if (document.hidden)
                return;
            const conversa = conversasRef.current.find((c) => c.chave === selecionadaChave);
            if (!conversa)
                return;
            const filtro = conversa.oportunidadeId ? { oportunidadeId: conversa.oportunidadeId } : { telefone: conversa.telefone };
            listMensagensConversa(filtro, idToken)
                .then((novasMensagens) => {
                setMensagens((prev) => {
                    const mesmoTamanho = prev.length === novasMensagens.length;
                    const mesmaUltima = prev[prev.length - 1]?.id === novasMensagens[novasMensagens.length - 1]?.id;
                    if (mesmoTamanho && mesmaUltima)
                        return prev;
                    return novasMensagens;
                });
                marcarComoLida(conversa);
            })
                .catch((e) => {
                if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA)
                    logout();
            });
        }, INTERVALO_ATUALIZACAO_MS);
        return () => window.clearInterval(intervalo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idToken, selecionadaChave, logout]);
    // Rolagem automática para a última mensagem — antes a conversa abria
    // "no topo" e era preciso arrastar manualmente até o fim para ver a
    // mensagem mais recente.
    useEffect(() => {
        const container = mensagensContainerRef.current;
        if (!container)
            return;
        container.scrollTop = container.scrollHeight;
    }, [mensagens, selecionadaChave]);
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
    const oportunidadeAtual = conversaSelecionada?.oportunidadeId
        ? oportunidades.find((o) => o.id === conversaSelecionada.oportunidadeId)
        : undefined;
    const etapaAtualObj = oportunidadeAtual ? etapas.find((e) => e.id === oportunidadeAtual.etapaId) : undefined;
    const etapaEhFinal = etapaAtualObj?.tipo === "ganho" || etapaAtualObj?.tipo === "perdido";
    const buscaNormalizada = normalizarBusca(busca.trim());
    const buscaDigitos = apenasDigitos(busca);
    const conversasFiltradas = conversas.filter((c) => {
        if (!buscaNormalizada)
            return true;
        const oportunidade = c.oportunidadeId ? oportunidades.find((o) => o.id === c.oportunidadeId) : undefined;
        const alvoTexto = normalizarBusca([c.clienteNome, c.telefone, oportunidade?.veiculoInteresse ?? ""].join(" "));
        if (alvoTexto.includes(buscaNormalizada))
            return true;
        if (buscaDigitos && apenasDigitos(c.telefone).includes(buscaDigitos))
            return true;
        return false;
    });
    const totalNaoLidas = conversas.filter(conversaNaoLida).length;
    function selecionarConversa(c) {
        setSelecionadaChave(c.chave);
    }
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
    // --- Ações rápidas (2026-08-04) — reaproveitam moverEtapaOportunidade_ e
    // transferirOportunidade_, os mesmos endpoints já usados no Pipeline.
    // Nenhuma ação nova do lado do backend.
    async function confirmarMoverEtapa() {
        if (!conversaSelecionada?.oportunidadeId || !etapaAlvo || !usuario)
            return;
        const destino = etapas.find((e) => e.id === etapaAlvo);
        if (!destino)
            return;
        let motivoParaEnviar;
        let motivoOutroParaEnviar;
        if (destino.tipo === "perdido") {
            if (!motivoAlvo) {
                setErroAcaoRapida("Selecione o motivo da perda.");
                return;
            }
            const motivoObj = motivosPerda.find((m) => m.id === motivoAlvo);
            if (motivoObj?.nome === "Outro" && !motivoOutro.trim()) {
                setErroAcaoRapida('Descreva o motivo quando selecionar "Outro".');
                return;
            }
            motivoParaEnviar = motivoAlvo;
            motivoOutroParaEnviar = motivoObj?.nome === "Outro" ? motivoOutro.trim() : undefined;
        }
        setSalvandoAcaoRapida(true);
        setErroAcaoRapida(null);
        setSucessoAcaoRapida(null);
        try {
            await moverEtapaOportunidade({
                oportunidadeId: conversaSelecionada.oportunidadeId,
                novaEtapaId: etapaAlvo,
                motivoPerdaId: motivoParaEnviar,
                motivoPerdaOutroTexto: motivoOutroParaEnviar,
                usuarioId: usuario.id,
            }, idToken);
            setOportunidades((prev) => prev.map((o) => (o.id === conversaSelecionada.oportunidadeId ? { ...o, etapaId: etapaAlvo } : o)));
            setSucessoAcaoRapida(`Movida para "${destino.nome}".`);
            setEtapaAlvo("");
            setMotivoAlvo("");
            setMotivoOutro("");
        }
        catch (e) {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErroAcaoRapida(e instanceof Error ? e.message : "Não foi possível mover a etapa agora.");
        }
        finally {
            setSalvandoAcaoRapida(false);
        }
    }
    async function executarTransferencia(novoResponsavelId) {
        if (!conversaSelecionada?.oportunidadeId || !novoResponsavelId)
            return;
        setSalvandoAcaoRapida(true);
        setErroAcaoRapida(null);
        setSucessoAcaoRapida(null);
        try {
            await transferirOportunidade({ oportunidadeId: conversaSelecionada.oportunidadeId, novoResponsavelId, usuarioId: usuario?.id }, idToken);
            setOportunidades((prev) => prev.map((o) => (o.id === conversaSelecionada.oportunidadeId ? { ...o, responsavelId: novoResponsavelId } : o)));
            setConversas((prev) => prev.map((c) => (c.chave === conversaSelecionada.chave ? { ...c, responsavelId: novoResponsavelId } : c)));
            const novoResponsavel = usuarios.find((u) => u.id === novoResponsavelId);
            setSucessoAcaoRapida(`Responsável: ${novoResponsavel?.nome ?? "atualizado"}.`);
            setResponsavelAlvo("");
        }
        catch (e) {
            if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA) {
                logout();
                return;
            }
            setErroAcaoRapida(e instanceof Error ? e.message : "Não foi possível transferir esta negociação agora.");
        }
        finally {
            setSalvandoAcaoRapida(false);
        }
    }
    function assumir() {
        if (usuario)
            void executarTransferencia(usuario.id);
    }
    function confirmarTransferir() {
        if (responsavelAlvo)
            void executarTransferencia(responsavelAlvo);
    }
    async function alternarTimeline() {
        if (!conversaSelecionada?.oportunidadeId)
            return;
        const oportunidadeId = conversaSelecionada.oportunidadeId;
        const abrir = !timelineAberta;
        setTimelineAberta(abrir);
        if (abrir && !timelineCache[oportunidadeId] && idToken) {
            setCarregandoTimeline(true);
            try {
                const todos = await listTimeline(idToken);
                const doOportunidade = todos
                    .filter((t) => t.oportunidadeId === oportunidadeId)
                    .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
                setTimelineCache((prev) => ({ ...prev, [oportunidadeId]: doOportunidade }));
            }
            catch (e) {
                if (e instanceof Error && e.message === ERRO_SESSAO_EXPIRADA)
                    logout();
                // painel secundário — falha aqui não precisa travar o resto da tela.
            }
            finally {
                setCarregandoTimeline(false);
            }
        }
    }
    const gruposMensagens = agruparPorDia(mensagens);
    const mostrarLista = !isMobile || !selecionadaChave;
    const mostrarThread = !isMobile || !!selecionadaChave;
    return (_jsxs("div", { className: "conversas", children: [mostrarLista && (_jsxs("aside", { className: "conversas__lista", children: [_jsxs("header", { className: "conversas__lista-header", children: [_jsx("h2", { children: "Conversas" }), totalNaoLidas > 0 && _jsxs("span", { className: "conversas__badge-naolidas", children: [totalNaoLidas, " n\u00E3o lida", totalNaoLidas > 1 ? "s" : ""] }), _jsx("span", { className: "conversas__contagem", children: conversas.length })] }), _jsx("div", { className: "conversas__busca", children: _jsx("input", { type: "text", placeholder: "Buscar por cliente, telefone ou ve\u00EDculo\u2026", value: busca, onChange: (e) => setBusca(e.target.value) }) }), conversas.length === 0 && _jsx("p", { className: "conversas__vazio", children: "Nenhuma conversa ainda." }), conversas.length > 0 && conversasFiltradas.length === 0 && (_jsxs("p", { className: "conversas__vazio", children: ["Nenhuma conversa encontrada para \"", busca, "\"."] })), _jsx("ul", { className: "conversas__itens", children: conversasFiltradas.map((c) => {
                            const responsavel = c.responsavelId ? usuarios.find((u) => u.id === c.responsavelId) : undefined;
                            const naoLida = conversaNaoLida(c);
                            return (_jsx("li", { children: _jsxs("button", { className: `conversas__item ${selecionadaChave === c.chave ? "conversas__item--ativo" : ""} ${naoLida ? "conversas__item--naolida" : ""}`, onClick: () => selecionarConversa(c), children: [_jsx("span", { className: "conversas__item-avatar", "aria-hidden": "true", children: c.clienteNome.charAt(0).toUpperCase() }), _jsxs("span", { className: "conversas__item-corpo", children: [_jsxs("span", { className: "conversas__item-topo", children: [_jsx("strong", { children: c.clienteNome }), _jsx("span", { className: "conversas__item-hora", children: formatarDataHora(c.ultimaInteracaoEm) })] }), _jsxs("span", { className: "conversas__item-preview", children: [c.ultimaMensagemDirecao === "enviada" ? "Você: " : "", separarAutorEtextoPreview(c.ultimaMensagemDirecao, c.ultimaMensagemTexto) || "—"] }), _jsxs("span", { className: "conversas__item-rodape", children: [c.pendenteVinculo ? (_jsx("span", { className: "conversas__badge conversas__badge--pendente", children: "Pendente de v\u00EDnculo" })) : (_jsx("span", { className: "conversas__badge", children: responsavel?.nome ?? "Sem responsável" })), naoLida && _jsx("span", { className: "conversas__ponto-naolida", "aria-label": "N\u00E3o lida" })] })] })] }) }, c.chave));
                        }) })] })), mostrarThread && (_jsx("section", { className: "conversas__thread", children: !conversaSelecionada ? (_jsx("p", { className: "conversas__thread-vazio", children: "Selecione uma conversa para ver o hist\u00F3rico." })) : (_jsxs(_Fragment, { children: [_jsxs("header", { className: "conversas__thread-header", children: [isMobile && (_jsx("button", { className: "conversas__voltar", onClick: () => setSelecionadaChave(null), children: "\u2190 Conversas" })), _jsxs("div", { className: "conversas__thread-header-info", children: [_jsx("h3", { children: conversaSelecionada.clienteNome }), _jsx("span", { className: "conversas__thread-telefone", children: conversaSelecionada.telefone })] }), conversaSelecionada.oportunidadeId && !conversaSelecionada.pendenteVinculo && (_jsxs("div", { className: "conversas__thread-header-acoes", children: [_jsx("button", { className: "conversas__acoes-toggle", onClick: () => setPainelAcoesAberto((v) => !v), children: painelAcoesAberto ? "Ações ▲" : "Ações ▾" }), onAbrirNoPipeline && (_jsx("button", { className: "conversas__acoes-toggle", onClick: () => onAbrirNoPipeline(conversaSelecionada.oportunidadeId), children: "Abrir oportunidade \u2197" }))] }))] }), painelAcoesAberto && oportunidadeAtual && (_jsxs("div", { className: "conversas__painel-acoes", children: [etapaEhFinal ? (_jsxs("p", { className: "conversas__acoes-aviso", children: ["Esta negocia\u00E7\u00E3o j\u00E1 est\u00E1 em etapa final (", etapaAtualObj?.nome, ") \u2014 para reabrir, use o Pipeline."] })) : (_jsxs("div", { className: "conversas__acao-bloco", children: [_jsx("label", { children: "Mover para etapa" }), _jsxs("div", { className: "conversas__acao-linha", children: [_jsxs("select", { value: etapaAlvo, onChange: (e) => {
                                                        setEtapaAlvo(e.target.value);
                                                        setErroAcaoRapida(null);
                                                    }, children: [_jsx("option", { value: "", children: "Selecione\u2026" }), etapas
                                                            .filter((e) => e.id !== oportunidadeAtual.etapaId)
                                                            .map((e) => (_jsx("option", { value: e.id, children: e.nome }, e.id)))] }), _jsx("button", { className: "side-panel__botao-primario", disabled: !etapaAlvo || salvandoAcaoRapida, onClick: () => void confirmarMoverEtapa(), children: "Mover" })] }), etapaAlvo && etapas.find((e) => e.id === etapaAlvo)?.tipo === "perdido" && (_jsx("div", { className: "conversas__acao-linha", children: _jsxs("select", { value: motivoAlvo, onChange: (e) => setMotivoAlvo(e.target.value), children: [_jsx("option", { value: "", children: "Motivo da perda\u2026" }), motivosPerda.map((m) => (_jsx("option", { value: m.id, children: m.nome }, m.id)))] }) })), motivosPerda.find((m) => m.id === motivoAlvo)?.nome === "Outro" && (_jsx("input", { type: "text", placeholder: "Descreva o motivo\u2026", value: motivoOutro, onChange: (e) => setMotivoOutro(e.target.value) }))] })), _jsxs("div", { className: "conversas__acao-bloco", children: [_jsx("label", { children: "Respons\u00E1vel" }), _jsxs("div", { className: "conversas__acao-linha", children: [usuario && conversaSelecionada.responsavelId !== usuario.id && (_jsx("button", { className: "side-panel__botao-secundario", disabled: salvandoAcaoRapida, onClick: assumir, children: "Assumir para mim" })), _jsxs("select", { value: responsavelAlvo, onChange: (e) => setResponsavelAlvo(e.target.value), children: [_jsx("option", { value: "", children: "Transferir para\u2026" }), usuarios
                                                            .filter((u) => u.ativo && u.id !== conversaSelecionada.responsavelId)
                                                            .map((u) => (_jsx("option", { value: u.id, children: u.nome }, u.id)))] }), _jsx("button", { className: "side-panel__botao-primario", disabled: !responsavelAlvo || salvandoAcaoRapida, onClick: confirmarTransferir, children: "Transferir" })] })] }), _jsxs("div", { className: "conversas__acao-bloco", children: [_jsx("button", { className: "conversas__acoes-toggle", onClick: () => void alternarTimeline(), children: timelineAberta ? "Ocultar linha do tempo ▲" : "Ver linha do tempo ▾" }), timelineAberta && (_jsxs("ul", { className: "conversas__timeline", children: [carregandoTimeline && _jsx("li", { children: "Carregando\u2026" }), !carregandoTimeline &&
                                                    (timelineCache[conversaSelecionada.oportunidadeId] ?? []).map((ev) => (_jsxs("li", { children: [_jsx("span", { className: "conversas__timeline-hora", children: formatarDataHora(ev.dataHora) }), " ", ev.descricao] }, ev.id))), !carregandoTimeline && (timelineCache[conversaSelecionada.oportunidadeId] ?? []).length === 0 && (_jsx("li", { children: "Sem eventos registrados ainda." }))] }))] }), erroAcaoRapida && _jsx("p", { className: "side-panel__aviso", children: erroAcaoRapida }), sucessoAcaoRapida && _jsx("p", { className: "conversas__acoes-sucesso", children: sucessoAcaoRapida })] })), conversaSelecionada.pendenteVinculo && (_jsxs("div", { className: "conversas__vincular", children: [_jsx("p", { className: "side-panel__aviso", children: "Este cliente tem mais de uma negocia\u00E7\u00E3o em aberto \u2014 escolha a qual esta conversa pertence antes de responder." }), _jsxs("div", { className: "side-panel__form", children: [_jsxs("select", { value: vincularOportunidadeId, onChange: (e) => setVincularOportunidadeId(e.target.value), children: [_jsx("option", { value: "", children: "Selecione a negocia\u00E7\u00E3o\u2026" }), oportunidadesAbertasCliente.map((o) => (_jsx("option", { value: o.id, children: o.veiculoInteresse || `Oportunidade #${o.id}` }, o.id)))] }), oportunidadesAbertasCliente.length === 0 && (_jsx("p", { className: "conversas__thread-vazio", children: "Este cliente n\u00E3o tem nenhuma negocia\u00E7\u00E3o em aberto no momento." })), erroVincular && _jsx("p", { className: "side-panel__aviso", children: erroVincular }), _jsx("div", { className: "side-panel__form-acoes", children: _jsx("button", { className: "side-panel__botao-primario", onClick: () => void vincular(), disabled: vinculando || !vincularOportunidadeId, children: vinculando ? "Vinculando…" : "Vincular" }) })] })] })), _jsxs("div", { className: "conversas__mensagens", ref: mensagensContainerRef, children: [carregandoMensagens && _jsx("p", { className: "conversas__thread-vazio", children: "Carregando mensagens..." }), erroMensagens && _jsx("p", { className: "conversas__thread-vazio", children: erroMensagens }), !carregandoMensagens &&
                                    !erroMensagens &&
                                    gruposMensagens.map((grupo) => (_jsxs("div", { className: "conversas__grupo-dia", children: [_jsx("div", { className: "conversas__separador-dia", children: _jsx("span", { children: grupo.rotulo }) }), grupo.mensagens.map((m) => {
                                                const { autor, texto: corpo } = separarAutorEtexto(m.direcao, m.conteudoTexto);
                                                return (_jsxs("div", { className: `conversas__balao ${m.direcao === "enviada" ? "conversas__balao--enviada" : "conversas__balao--recebida"}`, children: [autor && _jsx("span", { className: "conversas__balao-autor", children: autor }), _jsx("p", { children: corpo }), _jsx("span", { className: "conversas__balao-hora", children: formatarDataHora(m.enviadoEm) })] }, m.id));
                                            })] }, grupo.chave))), !carregandoMensagens && !erroMensagens && mensagens.length === 0 && (_jsx("p", { className: "conversas__thread-vazio", children: "Nenhuma mensagem nesta conversa ainda." }))] }), !conversaSelecionada.pendenteVinculo && (_jsxs("div", { className: "conversas__caixa-envio", children: [usuario && (_jsxs("p", { className: "conversas__enviando-como", children: ["Enviando como ", _jsx("strong", { children: usuario.nomeExibicaoWhatsapp || usuario.nome })] })), erroEnvio && _jsx("p", { className: "side-panel__aviso", children: erroEnvio }), _jsxs("div", { className: "conversas__caixa-envio-linha", children: [_jsx("textarea", { value: texto, onChange: (e) => setTexto(e.target.value), placeholder: "Digite sua mensagem\u2026", onKeyDown: (e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    void enviar();
                                                }
                                            } }), _jsx("button", { className: "side-panel__botao-primario", onClick: () => void enviar(), disabled: enviando || !texto.trim(), children: enviando ? "Enviando…" : "Enviar" })] })] }))] })) }))] }));
}
// Usado só na prévia da lista de conversas — mesma lógica de
// separarAutorEtexto, mas devolve só o corpo (sem rótulo, já que a prévia
// já tem "Você: " na frente quando aplicável).
function separarAutorEtextoPreview(direcao, conteudo) {
    return separarAutorEtexto(direcao, conteudo).texto;
}
