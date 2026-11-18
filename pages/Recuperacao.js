import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { listClientes, listUsuarios } from "../services/oportunidades.js";
import { listCentralRecuperacao } from "../services/recuperacao.js";
import { MensagemErroBusca, SeloSituacao } from "../components/BuscasVeiculos.js";
import { criteriosDaBusca, formatarDataHora, formatarMoeda, interpretarErro, resumoModelos, temVisaoGlobal, textoValidade } from "../utils/buscas.js";
import {
  EXPLICACAO_NOVA,
  EXPLICACAO_SEM_ACOMPANHAMENTO,
  FILTROS_PERIODO_RECUPERACAO,
  FILTROS_STATUS_RECUPERACAO,
  contagemRecuperacao,
  filtrarDemandas,
  nomeVeiculo,
  opcoesModelo,
  opcoesResponsavel,
  rotuloCambioVeiculo,
  textoKm,
  textoSemAcompanhamento
} from "../utils/recuperacao.js";
function SelosDemanda({ demanda, horasSem }) {
  const r = demanda.resumo;
  return /* @__PURE__ */ jsxs("span", { className: "recup__selos", children: [
    r.semAcompanhamento && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--sem-acomp", title: EXPLICACAO_SEM_ACOMPANHAMENTO, children: textoSemAcompanhamento(r, horasSem) }),
    r.novas > 0 && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--nova", title: EXPLICACAO_NOVA, children: r.novas === 1 ? "1 nova" : `${r.novas} novas` }),
    /* @__PURE__ */ jsx(SeloSituacao, { busca: demanda.busca })
  ] });
}
function LinhaVeiculo({ v }) {
  const indisponivel = v.situacaoVeiculo === "indisponivel";
  return /* @__PURE__ */ jsxs("li", { className: `recup__veiculo${indisponivel ? " recup__veiculo--indisponivel" : ""}`, "data-veiculo-id": v.veiculoId, children: [
    /* @__PURE__ */ jsxs("span", { className: "recup__veiculo-nome", "data-rotulo": "Ve\xEDculo", children: [
      nomeVeiculo(v),
      v.nova && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--nova", title: EXPLICACAO_NOVA, children: "nova" })
    ] }),
    /* @__PURE__ */ jsx("span", { "data-rotulo": "Ano", children: v.ano || "\u2014" }),
    /* @__PURE__ */ jsx("span", { "data-rotulo": "Km", children: textoKm(v.km) }),
    /* @__PURE__ */ jsx("span", { "data-rotulo": "C\xE2mbio", children: rotuloCambioVeiculo(v.cambio) }),
    /* @__PURE__ */ jsx("span", { className: "recup__preco", "data-rotulo": "Pre\xE7o", children: v.preco === null ? "Sem pre\xE7o" : formatarMoeda(v.preco) }),
    /* @__PURE__ */ jsx("span", { "data-rotulo": "Encontrado em", children: formatarDataHora(v.encontradaEm) }),
    /* @__PURE__ */ jsx("span", { "data-rotulo": "Situa\xE7\xE3o", children: /* @__PURE__ */ jsx("span", { className: `recup__selo ${indisponivel ? "recup__selo--indisp" : "recup__selo--disp"}`, children: indisponivel ? "Indispon\xEDvel" : "Dispon\xEDvel" }) })
  ] });
}
function Recuperacao({ onAbrirOportunidade }) {
  const { idToken, usuario, logout } = useAuth();
  const [dados, setDados] = useState({ geradoEm: "", horasNova: 24, horasSemAcompanhamento: 24, demandas: [] });
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [termo, setTermo] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [modelo, setModelo] = useState("");
  const [status, setStatus] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const emAndamento = useRef(false);
  const carregar = useCallback(async (inicial) => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    if (inicial) setCarregando(true);
    else setAtualizando(true);
    setErro(null);
    try {
      const [d, c, u] = await Promise.all([listCentralRecuperacao(idToken), listClientes(idToken), listUsuarios(idToken)]);
      setDados(d);
      setClientes(c);
      setUsuarios(u);
      setAtualizadoEm(/* @__PURE__ */ new Date());
    } catch (e) {
      setErro(interpretarErro(e));
    } finally {
      emAndamento.current = false;
      setCarregando(false);
      setAtualizando(false);
    }
  }, [idToken]);
  useEffect(() => {
    void carregar(true);
  }, [carregar]);
  const clientesPorId = useMemo(() => new Map(clientes.map((c) => [String(c.id), c])), [clientes]);
  const usuariosPorId = useMemo(() => new Map(usuarios.map((u) => [String(u.id), u])), [usuarios]);
  const visaoGlobal = temVisaoGlobal(usuario);
  const modelos = useMemo(() => opcoesModelo(dados.demandas), [dados.demandas]);
  const responsaveis = useMemo(() => opcoesResponsavel(dados.demandas, usuariosPorId), [dados.demandas, usuariosPorId]);
  const filtradas = useMemo(
    () => filtrarDemandas(dados.demandas, { termo, responsavelId: visaoGlobal ? responsavelId : "", modelo, status, periodoDias: periodo }, clientesPorId, dados.geradoEm),
    [dados, termo, responsavelId, modelo, status, periodo, visaoGlobal, clientesPorId]
  );
  const contagem = useMemo(() => contagemRecuperacao(dados.demandas), [dados.demandas]);
  const selecionada = dados.demandas.find((d) => d.busca.id === selecionadaId) ?? null;
  const filtrosAlterados = termo !== "" || responsavelId !== "" || modelo !== "" || status !== "" || periodo !== "";
  const limpar = () => {
    setTermo("");
    setResponsavelId("");
    setModelo("");
    setStatus("");
    setPeriodo("");
  };
  if (carregando) return /* @__PURE__ */ jsx("p", { className: "relatorios__estado", children: "Carregando a Central de Recupera\xE7\xE3o\u2026" });
  const sessaoExpirada = erro?.tipo === "sessao";
  const nomeCliente = (b) => clientesPorId.get(b.clienteId)?.nome ?? "Cliente n\xE3o identificado";
  const nomeVendedor = (b) => usuariosPorId.get(b.responsavelId)?.nome ?? "\u2014";
  return /* @__PURE__ */ jsxs("div", { className: "relatorios buscas-pagina recup", children: [
    /* @__PURE__ */ jsxs("div", { className: "relatorios__cabecalho", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { children: "Central de Recupera\xE7\xE3o" }),
        /* @__PURE__ */ jsxs("p", { className: "relatorios__subtitulo", children: [
          visaoGlobal ? "Todas as demandas da opera\xE7\xE3o" : "Suas demandas",
          " \xB7 ve\xEDculos do estoque que combinam com o que o cliente procura (somente consulta)"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "buscas-pagina__atualizar", children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: "pipeline__botao-atualizar", onClick: () => carregar(false), disabled: atualizando, children: atualizando ? "Atualizando\u2026" : "\u21BB Atualizar" }),
        atualizadoEm && /* @__PURE__ */ jsxs("span", { className: "relatorios__subtitulo", children: [
          "Atualizado \xE0s ",
          atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
        ] })
      ] })
    ] }),
    erro && /* @__PURE__ */ jsx(MensagemErroBusca, { erro, recarregarEmRede: true, onRecarregar: () => carregar(false), onEntrarNovamente: sessaoExpirada ? () => logout() : void 0 }),
    /* @__PURE__ */ jsxs("div", { className: "relatorios__cards buscas-pagina__resumo recup__resumo", children: [
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", "data-indicador": "demandas", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Demandas com ve\xEDculo" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.demandas })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", "data-indicador": "novas", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Com novas correspond\xEAncias" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.novas })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", "data-indicador": "sem-acompanhamento", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Sem acompanhamento (24 h+)" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.semAcompanhamento })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", "data-indicador": "disponiveis", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Ve\xEDculos dispon\xEDveis" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.veiculosDisponiveis })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relatorios__filtros buscas-pagina__filtros recup__filtros", children: [
      /* @__PURE__ */ jsxs("label", { children: [
        "Pesquisar",
        /* @__PURE__ */ jsx("input", { type: "search", placeholder: "Cliente, modelo, ve\xEDculo ou c\xF3digo\u2026", value: termo, onChange: (e) => setTermo(e.target.value) })
      ] }),
      visaoGlobal && /* @__PURE__ */ jsxs("label", { children: [
        "Vendedor",
        /* @__PURE__ */ jsxs("select", { value: responsavelId, onChange: (e) => setResponsavelId(e.target.value), "aria-label": "Filtrar por vendedor", children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Todos os vendedores" }),
          responsaveis.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.nome }, o.id))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Modelo procurado",
        /* @__PURE__ */ jsxs("select", { value: modelo, onChange: (e) => setModelo(e.target.value), "aria-label": "Filtrar por modelo", children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Todos os modelos" }),
          modelos.map((m) => /* @__PURE__ */ jsx("option", { value: m, children: m }, m))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Situa\xE7\xE3o",
        /* @__PURE__ */ jsx("select", { value: status, onChange: (e) => setStatus(e.target.value), "aria-label": "Filtrar por situa\xE7\xE3o", children: FILTROS_STATUS_RECUPERACAO.map((s) => /* @__PURE__ */ jsx("option", { value: s.valor, children: s.rotulo }, s.valor)) })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Per\xEDodo",
        /* @__PURE__ */ jsx("select", { value: periodo, onChange: (e) => setPeriodo(e.target.value), "aria-label": "Filtrar por per\xEDodo da \xFAltima correspond\xEAncia", children: FILTROS_PERIODO_RECUPERACAO.map((p) => /* @__PURE__ */ jsx("option", { value: p.valor, children: p.rotulo }, p.valor)) })
      ] }),
      filtrosAlterados && /* @__PURE__ */ jsx("button", { type: "button", className: "relatorios__limpar", onClick: limpar, children: "Limpar filtros" })
    ] }),
    /* @__PURE__ */ jsxs("p", { className: "relatorios__info", children: [
      filtradas.length,
      " ",
      filtradas.length === 1 ? "demanda" : "demandas",
      filtrosAlterados ? " com os filtros aplicados" : ""
    ] }),
    filtradas.length === 0 ? /* @__PURE__ */ jsx("p", { className: "relatorios__sem-resultado recup__vazio", children: dados.demandas.length === 0 ? "Nenhum ve\xEDculo do estoque combinou com as buscas at\xE9 agora. Quando surgir, a demanda aparece aqui." : "Nenhuma demanda encontrada para os filtros escolhidos." }) : /* @__PURE__ */ jsx("ul", { className: "recup__lista", children: filtradas.map((d) => {
      const b = d.busca;
      return /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("article", { className: "recup__demanda", "data-busca-id": b.id, "data-codigo": b.codigo, "data-sem-acompanhamento": d.resumo.semAcompanhamento ? "sim" : "nao", "data-novas": d.resumo.novas, children: [
        /* @__PURE__ */ jsxs("header", { className: "recup__topo", children: [
          /* @__PURE__ */ jsxs("div", { className: "recup__titulo", children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "relatorios__link recup__abrir", onClick: () => setSelecionadaId(b.id), title: "Abrir detalhes da busca", children: nomeCliente(b) }),
            /* @__PURE__ */ jsx("span", { className: "recup__codigo", children: b.codigo })
          ] }),
          /* @__PURE__ */ jsx(SelosDemanda, { demanda: d, horasSem: dados.horasSemAcompanhamento })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "recup__procura", children: [
          /* @__PURE__ */ jsx("strong", { children: "Procura:" }),
          " ",
          resumoModelos(b),
          criteriosDaBusca(b).length > 0 && /* @__PURE__ */ jsxs("small", { children: [
            " \xB7 ",
            criteriosDaBusca(b).join(" \xB7 ")
          ] })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "recup__meta", children: [
          "Vendedor: ",
          /* @__PURE__ */ jsx("strong", { children: nomeVendedor(b) }),
          " \xB7 \xDAltima correspond\xEAncia: ",
          formatarDataHora(d.resumo.ultimaEncontradaEm),
          " \xB7",
          " ",
          d.resumo.total === 1 ? "1 ve\xEDculo compat\xEDvel" : `${d.resumo.total} ve\xEDculos compat\xEDveis`,
          d.resumo.indisponiveis > 0 ? ` (${d.resumo.indisponiveis} j\xE1 indispon\xEDvel${d.resumo.indisponiveis > 1 ? "is" : ""})` : ""
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "recup__veiculos", children: d.veiculos.map((v) => /* @__PURE__ */ jsx(LinhaVeiculo, { v }, v.id)) }),
        /* @__PURE__ */ jsx("div", { className: "recup__rodape", children: /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setSelecionadaId(b.id), children: "Ver detalhes" }) })
      ] }) }, b.id);
    }) }),
    selecionada && /* @__PURE__ */ jsx("div", { className: "side-panel__overlay", onClick: () => setSelecionadaId(null), children: /* @__PURE__ */ jsxs("aside", { className: "side-panel recup__painel", onClick: (e) => e.stopPropagation(), "aria-label": `Busca ${selecionada.busca.codigo}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "side-panel__header", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("h2", { children: [
            "Busca ",
            selecionada.busca.codigo
          ] }),
          /* @__PURE__ */ jsx("p", { className: "side-panel__cliente", children: nomeCliente(selecionada.busca) })
        ] }),
        /* @__PURE__ */ jsx("button", { className: "side-panel__fechar", onClick: () => setSelecionadaId(null), "aria-label": "Fechar", children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "side-panel__body recup__painel-corpo", children: [
        /* @__PURE__ */ jsxs("section", { className: "recup__secao", children: [
          /* @__PURE__ */ jsx("h3", { children: "O que o cliente procura" }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Modelos:" }),
            " ",
            resumoModelos(selecionada.busca)
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Crit\xE9rios:" }),
            " ",
            criteriosDaBusca(selecionada.busca).join(" \xB7 ") || "Sem crit\xE9rios adicionais"
          ] }),
          selecionada.busca.observacoes && /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Observa\xE7\xF5es:" }),
            " ",
            selecionada.busca.observacoes
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Situa\xE7\xE3o da busca:" }),
            " ",
            /* @__PURE__ */ jsx(SeloSituacao, { busca: selecionada.busca }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "relatorios__sub", children: textoValidade(selecionada.busca) })
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Vendedor respons\xE1vel:" }),
            " ",
            nomeVendedor(selecionada.busca)
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "recup__secao", children: [
          /* @__PURE__ */ jsx("h3", { children: "Acompanhamento" }),
          selecionada.resumo.semAcompanhamento && /* @__PURE__ */ jsxs("p", { className: "recup__aviso", children: [
            textoSemAcompanhamento(selecionada.resumo, dados.horasSemAcompanhamento),
            ". ",
            EXPLICACAO_SEM_ACOMPANHAMENTO
          ] }),
          selecionada.resumo.novas > 0 && /* @__PURE__ */ jsxs("p", { className: "recup__aviso recup__aviso--nova", children: [
            selecionada.resumo.novas === 1 ? "1 correspond\xEAncia nova." : `${selecionada.resumo.novas} correspond\xEAncias novas.`,
            " ",
            EXPLICACAO_NOVA
          ] }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "\xDAltimo registro de pessoa depois da correspond\xEAncia:" }),
            " ",
            selecionada.resumo.ultimaAtividadeHumanaEm ? formatarDataHora(selecionada.resumo.ultimaAtividadeHumanaEm) : "nenhum"
          ] }),
          /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "Esta tela \xE9 s\xF3 de consulta. O registro de contatos e resultados vir\xE1 em uma pr\xF3xima etapa." })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "recup__secao", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            "Ve\xEDculos encontrados (",
            selecionada.resumo.total,
            ")"
          ] }),
          /* @__PURE__ */ jsx("ul", { className: "recup__detalhe-veiculos", children: selecionada.veiculos.map((v) => /* @__PURE__ */ jsxs("li", { className: v.situacaoVeiculo === "indisponivel" ? "recup__veiculo--indisponivel" : "", "data-veiculo-id": v.veiculoId, children: [
            /* @__PURE__ */ jsx("strong", { children: nomeVeiculo(v) }),
            /* @__PURE__ */ jsxs("span", { children: [
              v.ano || "\u2014",
              " \xB7 ",
              textoKm(v.km),
              " \xB7 ",
              rotuloCambioVeiculo(v.cambio),
              " \xB7 ",
              v.preco === null ? "Sem pre\xE7o" : formatarMoeda(v.preco)
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "relatorios__sub", children: [
              "Encontrado em ",
              formatarDataHora(v.encontradaEm),
              " \xB7 ",
              v.situacaoVeiculo === "indisponivel" ? `Indispon\xEDvel${v.ausenteDesde ? ` desde ${formatarDataHora(v.ausenteDesde)}` : ""}` : "Dispon\xEDvel"
            ] }),
            v.regraExplicacao && /* @__PURE__ */ jsx("span", { className: "buscas__ajuda", children: v.regraExplicacao })
          ] }, v.id)) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "recup__acoes", children: selecionada.busca.oportunidadeExcluida ? /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "A oportunidade de origem foi exclu\xEDda." }) : /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => onAbrirOportunidade?.(selecionada.busca.oportunidadeId), children: "Abrir oportunidade de origem" }) })
      ] })
    ] }) })
  ] });
}
export {
  Recuperacao
};
