import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { listOportunidades, listEtapas, listClientes, listUsuarios } from "../services/oportunidades.js";
import { useAuth } from "../contexts/AuthContext.js";
import { ERRO_SESSAO_EXPIRADA } from "../services/auth.js";
import { OpportunityCard } from "../components/OpportunityCard.js";
import { SidePanel } from "../components/SidePanel.js";
// Pipeline — Kanban agrupado por etapa. Neste protótipo, apenas leitura:
// arrastar entre colunas e criar/editar oportunidade ficam para o próximo
// sprint, depois que o produto for validado (decisão do CEO em 2026-08-02).
export function Pipeline() {
    const { idToken, logout } = useAuth();
        const [etapas, setEtapas] = useState([]);
            const [oportunidades, setOportunidades] = useState([]);
                const [clientes, setClientes] = useState([]);
                    const [usuarios, setUsuarios] = useState([]);
                        const [carregando, setCarregando] = useState(true);
                            const [erro, setErro] = useState(null);
                                const [selecionada, setSelecionada] = useState(null);
                                    useEffect(() => {
                                            if (!idToken)
                                                        return;
                                                                Promise.all([listEtapas(idToken), listOportunidades(idToken), listClientes(idToken), listUsuarios(idToken)])
                                                                            .then(([etapasResp, oportunidadesResp, clientesResp, usuariosResp]) => {
                                                                                        setEtapas([...etapasResp].sort((a, b) => a.ordem - b.ordem));
                                                                                                    setOportunidades(oportunidadesResp);
                                                                                                                setClientes(clientesResp);
                                                                                                                            setUsuarios(usuariosResp);
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
                                                                                                                                                                                                                                                                                                                return (_jsxs("div", { className: "pipeline", children: [_jsx("div", { className: "pipeline__board", children: etapas.map((etapa) => {
                                                                                                                                                                                                                                                                                                                                    const opsDaEtapa = oportunidades.filter((o) => o.etapaId === etapa.id);
                                                                                                                                                                                                                                                                                                                                                        return (_jsxs("section", { className: `pipeline__coluna pipeline__coluna--${etapa.tipo}`, children: [_jsxs("header", { className: "pipeline__coluna-header", children: [_jsx("h2", { children: etapa.nome }), _jsx("span", { className: "pipeline__contagem", children: opsDaEtapa.length })] }), _jsxs("div", { className: "pipeline__coluna-cards", children: [opsDaEtapa.length === 0 && _jsx("p", { className: "pipeline__vazio", children: "Sem oportunidades" }), opsDaEtapa.map((o) => (_jsx(OpportunityCard, { oportunidade: o, cliente: clientePorId(o.clienteId), onClick: () => setSelecionada(o) }, o.id)))] })] }, etapa.id));
                                                                                                                                                                                                                                                                                                                                                                        }) }), selecionada && (_jsx(SidePanel, { oportunidade: selecionada, cliente: clientePorId(selecionada.clienteId), responsavel: usuarios.find((u) => u.id === selecionada.responsavelId), onFechar: () => setSelecionada(null) }))] }));
                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                        
