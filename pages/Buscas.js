import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { listClientes, listUsuarios } from "../services/oportunidades.js";
import { listBuscasVeiculos } from "../services/buscas.js";
import { CartaoBusca, MensagemErroBusca, SeloSituacao } from "../components/BuscasVeiculos.js";
import { FILTROS_SITUACAO, filtrarBuscas, interpretarErro, resumoModelos, temVisaoGlobal, textoValidade, vencendoEmBreve, criteriosDaBusca } from "../utils/buscas.js";
function Buscas({ onAbrirOportunidade }) {
  const { idToken, usuario, logout } = useAuth();
  const [buscas, setBuscas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [termo, setTermo] = useState("");
  const [situacao, setSituacao] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
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
      const [b, c, u] = await Promise.all([listBuscasVeiculos(idToken), listClientes(idToken), listUsuarios(idToken)]);
      setBuscas(b);
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
  const opcoesResponsavel = useMemo(() => {
    const ids = new Set(buscas.map((b) => String(b.responsavelId)).filter(Boolean));
    return [...ids].map((id) => ({ id, nome: usuariosPorId.get(id)?.nome ?? `Usu\xE1rio ${id}` })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [buscas, usuariosPorId]);
  const filtradas = useMemo(() => filtrarBuscas(buscas, { termo, situacao, responsavelId: visaoGlobal ? responsavelId : "" }, clientesPorId), [buscas, termo, situacao, responsavelId, visaoGlobal, clientesPorId]);
  const contagem = useMemo(() => ({
    ativas: buscas.filter((b) => b.situacao === "ativa").length,
    vencendo: buscas.filter(vencendoEmBreve).length,
    vencidas: buscas.filter((b) => b.situacao === "expirada").length,
    encerradas: buscas.filter((b) => b.situacao === "encerrada" || b.situacao === "recuperada").length
  }), [buscas]);
  const selecionada = buscas.find((b) => b.id === selecionadaId) ?? null;
  const filtrosAlterados = termo !== "" || situacao !== "" || responsavelId !== "";
  function aoAtualizada(b) {
    setBuscas((lista) => lista.map((x) => x.id === b.id ? b : x));
    void carregar(false);
  }
  if (carregando) return /* @__PURE__ */ jsx("p", { className: "relatorios__estado", children: "Carregando buscas de ve\xEDculos\u2026" });
  const sessaoExpirada = erro?.tipo === "sessao";
  return /* @__PURE__ */ jsxs("div", { className: "relatorios buscas-pagina", children: [
    /* @__PURE__ */ jsxs("div", { className: "relatorios__cabecalho", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { children: "Buscas de Ve\xEDculos" }),
        /* @__PURE__ */ jsxs("p", { className: "relatorios__subtitulo", children: [
          visaoGlobal ? "Todas as buscas da opera\xE7\xE3o" : "Suas buscas",
          " \xB7 clientes que querem ser avisados quando surgir o ve\xEDculo certo"
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
    /* @__PURE__ */ jsxs("div", { className: "relatorios__cards buscas-pagina__resumo", children: [
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Ativas" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.ativas })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Vencendo em 7 dias" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.vencendo })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Vencidas" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.vencidas })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Encerradas" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.encerradas })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relatorios__filtros buscas-pagina__filtros", children: [
      /* @__PURE__ */ jsxs("label", { children: [
        "Pesquisar",
        /* @__PURE__ */ jsx("input", { type: "search", placeholder: "Cliente, modelo ou c\xF3digo\u2026", value: termo, onChange: (e) => setTermo(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Situa\xE7\xE3o",
        /* @__PURE__ */ jsx("select", { value: situacao, onChange: (e) => setSituacao(e.target.value), children: FILTROS_SITUACAO.map((s) => /* @__PURE__ */ jsx("option", { value: s.valor, children: s.rotulo }, s.valor)) })
      ] }),
      visaoGlobal && /* @__PURE__ */ jsxs("label", { children: [
        "Vendedor",
        /* @__PURE__ */ jsxs("select", { value: responsavelId, onChange: (e) => setResponsavelId(e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Todos os vendedores" }),
          opcoesResponsavel.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.nome }, o.id))
        ] })
      ] }),
      filtrosAlterados && /* @__PURE__ */ jsx("button", { type: "button", className: "relatorios__limpar", onClick: () => {
        setTermo("");
        setSituacao("");
        setResponsavelId("");
      }, children: "Limpar filtros" })
    ] }),
    /* @__PURE__ */ jsxs("p", { className: "relatorios__info", children: [
      filtradas.length,
      " ",
      filtradas.length === 1 ? "busca" : "buscas",
      filtrosAlterados ? " com os filtros aplicados" : ""
    ] }),
    /* @__PURE__ */ jsx("div", { className: "relatorios__tabela-wrap", children: /* @__PURE__ */ jsxs("table", { className: "relatorios__tabela buscas-pagina__tabela", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { children: "C\xF3digo" }),
        /* @__PURE__ */ jsx("th", { children: "Cliente" }),
        /* @__PURE__ */ jsx("th", { children: "Modelos" }),
        /* @__PURE__ */ jsx("th", { children: "Crit\xE9rios" }),
        /* @__PURE__ */ jsx("th", { children: "Situa\xE7\xE3o" }),
        /* @__PURE__ */ jsx("th", { children: "Vendedor" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: filtradas.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { className: "relatorios__sem-resultado", colSpan: 6, children: buscas.length === 0 ? "Nenhuma busca de ve\xEDculo registrada ainda." : "Nenhuma busca encontrada para os filtros escolhidos." }) }) : filtradas.map((b) => /* @__PURE__ */ jsxs("tr", { className: "buscas-pagina__linha", "data-busca-id": b.id, children: [
        /* @__PURE__ */ jsx("td", { "data-rotulo": "C\xF3digo", children: /* @__PURE__ */ jsx("button", { type: "button", className: "relatorios__link", onClick: () => setSelecionadaId(b.id), title: "Abrir detalhes e hist\xF3rico", children: b.codigo }) }),
        /* @__PURE__ */ jsx("td", { "data-rotulo": "Cliente", children: clientesPorId.get(b.clienteId)?.nome ?? "\u2014" }),
        /* @__PURE__ */ jsx("td", { "data-rotulo": "Modelos", children: resumoModelos(b) }),
        /* @__PURE__ */ jsx("td", { "data-rotulo": "Crit\xE9rios", children: criteriosDaBusca(b).join(" \xB7 ") || "\u2014" }),
        /* @__PURE__ */ jsx("td", { "data-rotulo": "Situa\xE7\xE3o", children: /* @__PURE__ */ jsxs("span", { className: "relatorios__etapa", children: [
          /* @__PURE__ */ jsx(SeloSituacao, { busca: b }),
          /* @__PURE__ */ jsx("span", { className: "relatorios__sub", children: textoValidade(b) })
        ] }) }),
        /* @__PURE__ */ jsx("td", { "data-rotulo": "Vendedor", children: usuariosPorId.get(b.responsavelId)?.nome ?? "\u2014" })
      ] }, b.id)) })
    ] }) }),
    selecionada && /* @__PURE__ */ jsx("div", { className: "side-panel__overlay", onClick: () => setSelecionadaId(null), children: /* @__PURE__ */ jsxs("aside", { className: "side-panel", onClick: (e) => e.stopPropagation(), "aria-label": `Busca ${selecionada.codigo}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "side-panel__header", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("h2", { children: [
            "Busca ",
            selecionada.codigo
          ] }),
          /* @__PURE__ */ jsx("p", { className: "side-panel__cliente", children: clientesPorId.get(selecionada.clienteId)?.nome ?? "Cliente n\xE3o identificado" })
        ] }),
        /* @__PURE__ */ jsx("button", { className: "side-panel__fechar", onClick: () => setSelecionadaId(null), "aria-label": "Fechar", children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "side-panel__body", children: /* @__PURE__ */ jsx("ul", { className: "buscas__lista", children: /* @__PURE__ */ jsx(
        CartaoBusca,
        {
          busca: selecionada,
          iniciarAberto: true,
          cliente: clientesPorId.get(selecionada.clienteId),
          responsavel: usuariosPorId.get(selecionada.responsavelId),
          onAtualizada: aoAtualizada,
          onRecarregar: () => carregar(false),
          onAbrirOportunidade
        },
        selecionada.id
      ) }) })
    ] }) })
  ] });
}
export {
  Buscas
};
