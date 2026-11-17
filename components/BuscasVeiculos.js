import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import {
  listBuscasVeiculos,
  listCatalogoModelos,
  listHistoricoBuscaVeiculo,
  cadastrarBuscaVeiculo,
  editarBuscaVeiculo,
  renovarBuscaVeiculo,
  reativarBuscaVeiculo,
  encerrarBuscaVeiculo,
  solicitarModeloCatalogo,
  transferirBuscaVeiculo
} from "../services/buscas.js";
import {
  CAMBIOS,
  MAX_MODELOS,
  MAX_OBSERVACOES,
  MAX_OBS_ENCERRAMENTO,
  MOTIVOS_ENCERRAMENTO,
  MOTIVOS_PERDA_INDISPONIBILIDADE,
  criteriosDaBusca,
  formatarDataHora,
  formularioDaBusca,
  formularioVazio,
  gerarRequisicaoId,
  interpretarErro,
  modelosDaBusca,
  nomeModelo,
  normalizarTexto,
  payloadPreferencias,
  podeOperarBusca,
  podeRegistrarBusca,
  resumoModelos,
  rotuloCambio,
  rotuloMotivoEncerramento,
  rotuloSituacao,
  textoValidade,
  validarFormulario,
  vencendoEmBreve,
  podeTransferirBusca,
  destinosDeTransferencia,
  temVisaoGlobal
} from "../utils/buscas.js";
function SeloSituacao({ busca }) {
  const classe = busca.situacao === "ativa" ? vencendoEmBreve(busca) ? "alerta" : "ativa" : busca.situacao === "expirada" ? "vencida" : busca.situacao;
  return /* @__PURE__ */ jsxs("span", { className: `buscas__selo buscas__selo--${classe}`, children: [
    rotuloSituacao(busca.situacao),
    busca.reativacoes > 0 && busca.situacao !== "encerrada" ? " \xB7 reativada" : ""
  ] });
}
function MensagemErroBusca({ erro, onRecarregar, onEntrarNovamente, recarregarEmRede }) {
  if (!erro) return null;
  return /* @__PURE__ */ jsxs("div", { className: "buscas__erro", role: "alert", children: [
    /* @__PURE__ */ jsx("span", { children: erro.texto }),
    (erro.tipo === "versao" || recarregarEmRede && erro.tipo === "rede") && onRecarregar && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: onRecarregar, children: "Recarregar" }),
    erro.tipo === "sessao" && onEntrarNovamente && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: onEntrarNovamente, children: "Entrar novamente" })
  ] });
}
function SeletorModelos({ catalogo, selecionados, onChange, onModeloSolicitado, desabilitado, idToken }) {
  const [termo, setTermo] = useState("");
  const [solicitando, setSolicitando] = useState(false);
  const [solTipo, setSolTipo] = useState("carro");
  const [solMarca, setSolMarca] = useState("");
  const [solModelo, setSolModelo] = useState("");
  const [enviandoSol, setEnviandoSol] = useState(false);
  const [erroSol, setErroSol] = useState(null);
  const [infoSol, setInfoSol] = useState(null);
  const requisicaoSol = useRef(null);
  const tipoTravado = selecionados[0]?.tipo ?? null;
  const idsSelecionados = new Set(selecionados.map((m) => m.id));
  const cheio = selecionados.length >= MAX_MODELOS;
  const resultados = useMemo(() => {
    const t = normalizarTexto(termo);
    return catalogo.filter((m) => !idsSelecionados.has(m.id) && (!tipoTravado || m.tipo === tipoTravado)).filter((m) => {
      if (!t) return true;
      const alvo = normalizarTexto(`${m.marca} ${m.modelo} ${(m.apelidos ?? []).join(" ")}`);
      return t.split(/\s+/).every((p) => alvo.includes(p));
    }).slice(0, 8);
  }, [catalogo, termo, tipoTravado, selecionados]);
  function adicionar(m) {
    if (cheio || desabilitado) return;
    onChange([...selecionados, m]);
    setTermo("");
  }
  function remover(id) {
    if (desabilitado) return;
    onChange(selecionados.filter((m) => m.id !== id));
  }
  function abrirSolicitacao() {
    setSolicitando(true);
    setErroSol(null);
    setInfoSol(null);
    setSolModelo(termo.trim());
    setSolTipo(tipoTravado ?? "carro");
    requisicaoSol.current = gerarRequisicaoId();
  }
  async function enviarSolicitacao() {
    if (enviandoSol) return;
    if (!solModelo.trim()) {
      setErroSol({ tipo: "negocio", texto: "Informe o nome do modelo." });
      return;
    }
    setEnviandoSol(true);
    setErroSol(null);
    try {
      const r = await solicitarModeloCatalogo({ tipo: tipoTravado ?? solTipo, marca: solMarca.trim(), texto: solModelo.trim(), requisicaoId: requisicaoSol.current }, idToken);
      onModeloSolicitado?.(r.modelo);
      if (!idsSelecionados.has(r.modelo.id) && !cheio) onChange([...selecionados, r.modelo]);
      setInfoSol(r.existente ? "Este modelo j\xE1 estava no cat\xE1logo e foi adicionado \xE0 busca." : "Modelo solicitado: j\xE1 pode ser usado na busca e ficar\xE1 aguardando valida\xE7\xE3o da Ger\xEAncia.");
      setSolicitando(false);
      setTermo("");
      requisicaoSol.current = null;
    } catch (e) {
      setErroSol(interpretarErro(e));
    } finally {
      setEnviandoSol(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "buscas__modelos", children: [
    selecionados.length > 0 && /* @__PURE__ */ jsx("ul", { className: "buscas__chips", "aria-label": "Modelos escolhidos", children: selecionados.map((m, i) => /* @__PURE__ */ jsxs("li", { className: "buscas__chip", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        nomeModelo(m),
        /* @__PURE__ */ jsxs("small", { children: [
          i === 0 ? " \xB7 principal" : " \xB7 alternativo",
          m.status === "solicitado" ? " \xB7 aguardando valida\xE7\xE3o" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => remover(m.id), disabled: desabilitado, "aria-label": `Remover ${nomeModelo(m)}`, children: "\u2715" })
    ] }, m.id)) }),
    !cheio ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          placeholder: selecionados.length ? "Adicionar outro modelo (opcional)\u2026" : "Buscar modelo (ex.: Corolla, Onix, CG 160)\u2026",
          value: termo,
          onChange: (e) => setTermo(e.target.value),
          disabled: desabilitado
        }
      ),
      /* @__PURE__ */ jsxs("ul", { className: "buscas__resultados", children: [
        resultados.map((m) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => adicionar(m), disabled: desabilitado, children: [
          nomeModelo(m),
          " ",
          /* @__PURE__ */ jsxs("small", { children: [
            m.tipo === "moto" ? "moto" : "carro",
            m.status === "solicitado" ? " \xB7 aguardando valida\xE7\xE3o" : ""
          ] })
        ] }) }, m.id)),
        resultados.length === 0 && /* @__PURE__ */ jsx("li", { className: "side-panel__vazio-aba", children: "Nenhum modelo do cat\xE1logo encontrado." })
      ] })
    ] }) : /* @__PURE__ */ jsxs("p", { className: "side-panel__vazio-aba", children: [
      "Limite de ",
      MAX_MODELOS,
      " modelos por busca."
    ] }),
    tipoTravado && /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "Carros e motos n\xE3o podem ser combinados na mesma busca." }),
    infoSol && /* @__PURE__ */ jsx("p", { className: "buscas__sucesso", role: "status", children: infoSol }),
    !solicitando && !desabilitado && /* @__PURE__ */ jsx("button", { type: "button", className: "buscas__link", onClick: abrirSolicitacao, children: "N\xE3o encontrou? Solicitar inclus\xE3o do modelo" }),
    solicitando && /* @__PURE__ */ jsxs("div", { className: "buscas__solicitacao", children: [
      /* @__PURE__ */ jsx("strong", { children: "Solicitar modelo n\xE3o cadastrado" }),
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Categoria" }),
        /* @__PURE__ */ jsxs("select", { value: tipoTravado ?? solTipo, onChange: (e) => setSolTipo(e.target.value), disabled: !!tipoTravado || enviandoSol, children: [
          /* @__PURE__ */ jsx("option", { value: "carro", children: "Carro" }),
          /* @__PURE__ */ jsx("option", { value: "moto", children: "Moto" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Marca" }),
        /* @__PURE__ */ jsx("input", { type: "text", value: solMarca, onChange: (e) => setSolMarca(e.target.value), maxLength: 40, disabled: enviandoSol, placeholder: "Ex.: Honda" })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Modelo / vers\xE3o *" }),
        /* @__PURE__ */ jsx("input", { type: "text", value: solModelo, onChange: (e) => setSolModelo(e.target.value), maxLength: 60, disabled: enviandoSol, placeholder: "Ex.: City Hatchback" })
      ] }),
      /* @__PURE__ */ jsx(MensagemErroBusca, { erro: erroSol }),
      /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes", children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: enviarSolicitacao, disabled: enviandoSol, children: enviandoSol ? "Solicitando\u2026" : "Solicitar e usar" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setSolicitando(false), disabled: enviandoSol, children: "Cancelar" })
      ] })
    ] })
  ] });
}
function EditorBusca({ modo, busca, oportunidade, onConcluir, onCancelar }) {
  const { idToken, logout } = useAuth();
  const [catalogo, setCatalogo] = useState([]);
  const [catalogoErro, setCatalogoErro] = useState(null);
  const [catalogoCarregando, setCatalogoCarregando] = useState(true);
  const carregarCatalogo = useCallback(async () => {
    setCatalogoErro(null);
    setCatalogoCarregando(true);
    try {
      setCatalogo(await listCatalogoModelos(idToken));
    } catch (e) {
      setCatalogoErro(interpretarErro(e));
    } finally {
      setCatalogoCarregando(false);
    }
  }, [idToken]);
  useEffect(() => {
    void carregarCatalogo();
  }, [carregarCatalogo]);
  const aoModeloSolicitado = useCallback((m) => setCatalogo((c) => c.some((x) => x.id === m.id) ? c : [...c, m]), []);
  const [form, setForm] = useState(() => modo === "editar" ? formularioDaBusca(busca) : formularioVazio());
  const [errosCampo, setErrosCampo] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [duplicidade, setDuplicidade] = useState(null);
  const requisicaoRef = useRef(gerarRequisicaoId());
  const enviandoRef = useRef(false);
  function alterar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrosCampo((e) => ({ ...e, [campo]: void 0 }));
    setDuplicidade(null);
  }
  async function enviar(confirmarDuplicidade) {
    if (enviandoRef.current) return;
    const anoAtual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(/* @__PURE__ */ new Date()));
    const { erros, valores } = validarFormulario(form, anoAtual, { exigirInteresse: modo === "criar" });
    setErrosCampo(erros);
    if (Object.keys(erros).length) {
      setErro({ tipo: "negocio", texto: "Corrija os campos indicados." });
      return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const pref = payloadPreferencias(form, valores);
      if (modo === "criar") {
        const r = await cadastrarBuscaVeiculo({
          oportunidadeId: oportunidade.id,
          ...pref,
          interesseConfirmado: true,
          confirmarDuplicidade: confirmarDuplicidade === true,
          requisicaoId: requisicaoRef.current
        }, idToken);
        if (r.duplicidade) {
          setDuplicidade(r.duplicidade);
          return;
        }
        onConcluir(r.busca, { criada: true, reaproveitada: r.reaproveitada });
      } else {
        const r = await editarBuscaVeiculo({ buscaId: busca.id, versaoEsperada: busca.versao, ...pref, requisicaoId: requisicaoRef.current }, idToken);
        onConcluir(r.busca ?? busca, { criada: false, alterado: r.alterado, aviso: r.aviso });
      }
    } catch (e) {
      setErro(interpretarErro(e));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }
  const cliente = oportunidade?.clienteNome;
  return /* @__PURE__ */ jsxs("div", { className: "side-panel__form buscas__form", children: [
    /* @__PURE__ */ jsx("h3", { className: "side-panel__secao-titulo", children: modo === "criar" ? "Registrar busca de ve\xEDculo" : `Editar busca ${busca.codigo}` }),
    modo === "criar" && cliente && /* @__PURE__ */ jsxs("p", { className: "side-panel__cliente", children: [
      "Cliente: ",
      cliente,
      ". A busca fica vinculada a esta negocia\xE7\xE3o e ao vendedor respons\xE1vel; n\xE3o cria nova oportunidade."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "side-panel__campo", children: [
      /* @__PURE__ */ jsx("span", { children: "Modelos *" }),
      catalogoCarregando && /* @__PURE__ */ jsx("small", { className: "buscas__ajuda", children: "Carregando cat\xE1logo de modelos\u2026" }),
      catalogoErro && /* @__PURE__ */ jsx(MensagemErroBusca, { erro: catalogoErro, recarregarEmRede: true, onRecarregar: carregarCatalogo, onEntrarNovamente: () => logout() }),
      /* @__PURE__ */ jsx(SeletorModelos, { catalogo, selecionados: form.modelos, onChange: (m) => alterar("modelos", m), onModeloSolicitado: aoModeloSolicitado, desabilitado: enviando, idToken }),
      errosCampo.modelos && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.modelos })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "buscas__linha", children: [
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Ano m\xEDnimo" }),
        /* @__PURE__ */ jsx("input", { type: "text", inputMode: "numeric", value: form.anoMin, onChange: (e) => alterar("anoMin", e.target.value), disabled: enviando, placeholder: "Ex.: 2018" }),
        errosCampo.anoMin && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.anoMin })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Ano m\xE1ximo" }),
        /* @__PURE__ */ jsx("input", { type: "text", inputMode: "numeric", value: form.anoMax, onChange: (e) => alterar("anoMax", e.target.value), disabled: enviando, placeholder: "Ex.: 2022" }),
        errosCampo.anoMax && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.anoMax })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "buscas__linha", children: [
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Pre\xE7o m\xE1ximo (R$)" }),
        /* @__PURE__ */ jsx("input", { type: "text", inputMode: "decimal", value: form.precoMax, onChange: (e) => alterar("precoMax", e.target.value), disabled: enviando, placeholder: "Ex.: 80.000" }),
        errosCampo.precoMax && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.precoMax })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
        /* @__PURE__ */ jsx("span", { children: "Quilometragem m\xE1xima" }),
        /* @__PURE__ */ jsx("input", { type: "text", inputMode: "numeric", value: form.kmMax, onChange: (e) => alterar("kmMax", e.target.value), disabled: enviando, placeholder: "Ex.: 90.000" }),
        errosCampo.kmMax && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.kmMax })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
      /* @__PURE__ */ jsx("span", { children: "C\xE2mbio" }),
      /* @__PURE__ */ jsx("select", { value: form.cambio, onChange: (e) => alterar("cambio", e.target.value), disabled: enviando, children: CAMBIOS.map((c) => /* @__PURE__ */ jsx("option", { value: c.valor, children: c.rotulo }, c.valor)) })
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "Observa\xE7\xE3o breve (",
        form.observacoes.length,
        "/",
        MAX_OBSERVACOES,
        ")"
      ] }),
      /* @__PURE__ */ jsx("textarea", { value: form.observacoes, onChange: (e) => alterar("observacoes", e.target.value), disabled: enviando, maxLength: MAX_OBSERVACOES }),
      errosCampo.observacoes && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.observacoes })
    ] }),
    modo === "criar" && /* @__PURE__ */ jsxs("label", { className: "buscas__confirmacao", children: [
      /* @__PURE__ */ jsx("input", { type: "checkbox", checked: form.interesse, onChange: (e) => alterar("interesse", e.target.checked), disabled: enviando }),
      /* @__PURE__ */ jsx("span", { children: "O cliente confirmou que deseja ser avisado quando surgir um ve\xEDculo compat\xEDvel. *" })
    ] }),
    errosCampo.interesse && /* @__PURE__ */ jsx("small", { className: "buscas__erro-campo", children: errosCampo.interesse }),
    modo === "criar" && /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "A busca vale por 30 dias e pode ser renovada." }),
    duplicidade && /* @__PURE__ */ jsx("div", { className: "buscas__duplicidade", role: "alert", children: duplicidade.tipo === "identica" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("strong", { children: "J\xE1 existe uma busca id\xEAntica para esta negocia\xE7\xE3o." }),
      /* @__PURE__ */ jsx("ul", { children: duplicidade.buscas.map((b) => /* @__PURE__ */ jsxs("li", { children: [
        b.codigo,
        " \xB7 ",
        resumoModelos(b),
        " \xB7 ",
        rotuloSituacao(b.situacao)
      ] }, b.id)) }),
      /* @__PURE__ */ jsx("p", { children: "Para evitar duplicidade, o registro n\xE3o foi criado. Use a busca existente (renove ou edite se necess\xE1rio)." })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("strong", { children: [
        "Este cliente j\xE1 tem ",
        duplicidade.total === 1 ? "uma busca parecida" : `${duplicidade.total} buscas parecidas`,
        " para o mesmo modelo."
      ] }),
      /* @__PURE__ */ jsx("ul", { children: duplicidade.buscas.map((b) => /* @__PURE__ */ jsxs("li", { children: [
        b.codigo,
        " \xB7 ",
        resumoModelos(b),
        " \xB7 ",
        rotuloSituacao(b.situacao)
      ] }, b.id)) }),
      /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes", children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: () => enviar(true), disabled: enviando, children: enviando ? "Registrando\u2026" : "Registrar mesmo assim" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setDuplicidade(null), disabled: enviando, children: "Voltar" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(MensagemErroBusca, { erro, onEntrarNovamente: () => logout(), onRecarregar: onCancelar }),
    !(duplicidade && duplicidade.tipo === "parecida") && /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: () => enviar(false), disabled: enviando || duplicidade && duplicidade.tipo === "identica", children: enviando ? modo === "criar" ? "Registrando\u2026" : "Salvando\u2026" : modo === "criar" ? "Registrar busca" : "Salvar altera\xE7\xF5es" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: onCancelar, disabled: enviando, children: "Cancelar" })
    ] })
  ] });
}
function HistoricoBusca({ buscaId, versao }) {
  const { idToken } = useAuth();
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState(null);
  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setEventos(await listHistoricoBuscaVeiculo(buscaId, idToken));
    } catch (e) {
      setErro(interpretarErro(e));
    }
  }, [buscaId, idToken]);
  useEffect(() => {
    void carregar();
  }, [carregar, versao]);
  if (erro) return /* @__PURE__ */ jsx(MensagemErroBusca, { erro, recarregarEmRede: true, onRecarregar: carregar });
  if (!eventos) return /* @__PURE__ */ jsx("p", { className: "side-panel__vazio-aba", children: "Carregando hist\xF3rico\u2026" });
  if (!eventos.length) return /* @__PURE__ */ jsx("p", { className: "side-panel__vazio-aba", children: "Sem eventos registrados." });
  return /* @__PURE__ */ jsx("ul", { className: "side-panel__timeline buscas__historico", children: eventos.map((ev) => /* @__PURE__ */ jsxs("li", { children: [
    /* @__PURE__ */ jsx("span", { className: "side-panel__timeline-data", children: formatarDataHora(ev.dataHora) }),
    /* @__PURE__ */ jsx("span", { children: ev.descricao })
  ] }, ev.id)) });
}
function DetalheBusca({ busca, cliente, responsavel, onAbrirOportunidade }) {
  const criterios = criteriosDaBusca(busca);
  return /* @__PURE__ */ jsxs("div", { className: "buscas__detalhe", children: [
    /* @__PURE__ */ jsxs("dl", { className: "side-panel__lista", children: [
      /* @__PURE__ */ jsx("dt", { children: "Situa\xE7\xE3o" }),
      /* @__PURE__ */ jsx("dd", { children: /* @__PURE__ */ jsx(SeloSituacao, { busca }) }),
      /* @__PURE__ */ jsx("dt", { children: "Modelos" }),
      /* @__PURE__ */ jsx("dd", { children: modelosDaBusca(busca).map((m, i) => /* @__PURE__ */ jsxs("div", { children: [
        nomeModelo(m) || "Modelo removido do cat\xE1logo",
        i === 0 ? " (principal)" : "",
        m.status === "solicitado" ? " \xB7 aguardando valida\xE7\xE3o" : ""
      ] }, m.id || i)) }),
      cliente && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("dt", { children: "Cliente" }),
        /* @__PURE__ */ jsxs("dd", { children: [
          cliente.nome,
          cliente.telefone ? ` \xB7 ${cliente.telefone}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("dt", { children: "Vendedor" }),
      /* @__PURE__ */ jsx("dd", { children: responsavel?.nome ?? "\u2014" }),
      /* @__PURE__ */ jsx("dt", { children: "Crit\xE9rios" }),
      /* @__PURE__ */ jsx("dd", { children: criterios.length ? criterios.join(" \xB7 ") : "Sem crit\xE9rios al\xE9m do modelo" }),
      /* @__PURE__ */ jsx("dt", { children: "Validade" }),
      /* @__PURE__ */ jsx("dd", { children: textoValidade(busca) }),
      busca.observacoes && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("dt", { children: "Observa\xE7\xE3o" }),
        /* @__PURE__ */ jsx("dd", { children: busca.observacoes })
      ] }),
      /* @__PURE__ */ jsx("dt", { children: "Registrada em" }),
      /* @__PURE__ */ jsx("dd", { children: formatarDataHora(busca.criadoEm) }),
      busca.renovacoes > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("dt", { children: "Renova\xE7\xF5es" }),
        /* @__PURE__ */ jsxs("dd", { children: [
          busca.renovacoes,
          busca.renovadaEm ? ` (\xFAltima em ${formatarDataHora(busca.renovadaEm)})` : ""
        ] })
      ] }),
      busca.reativacoes > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("dt", { children: "Reativa\xE7\xF5es" }),
        /* @__PURE__ */ jsxs("dd", { children: [
          busca.reativacoes,
          busca.reativadaEm ? ` (\xFAltima em ${formatarDataHora(busca.reativadaEm)})` : ""
        ] })
      ] }),
      busca.situacao === "encerrada" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("dt", { children: "Encerramento" }),
        /* @__PURE__ */ jsxs("dd", { children: [
          rotuloMotivoEncerramento(busca.motivoEncerramento),
          busca.observacaoEncerramento ? ` \u2014 ${busca.observacaoEncerramento}` : ""
        ] })
      ] })
    ] }),
    busca.aguardandoValidacao && /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "H\xE1 modelo aguardando valida\xE7\xE3o da Ger\xEAncia; a busca j\xE1 est\xE1 valendo." }),
    busca.oportunidadeExcluida && /* @__PURE__ */ jsx("p", { className: "side-panel__aviso", children: "A negocia\xE7\xE3o de origem foi exclu\xEDda: a busca n\xE3o pode ser alterada." }),
    onAbrirOportunidade && !busca.oportunidadeExcluida && /* @__PURE__ */ jsx("button", { type: "button", className: "buscas__link", onClick: () => onAbrirOportunidade(busca.oportunidadeId), children: "Abrir a negocia\xE7\xE3o de origem" })
  ] });
}
function AcoesBusca({ busca, usuarios, onEditar, onAtualizada, onRecarregar }) {
  const { idToken, usuario, logout } = useAuth();
  const [ocupado, setOcupado] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [interesse, setInteresse] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const requisicoes = useRef({});
  const ocupadoRef = useRef(false);
  const pode = podeOperarBusca(usuario, busca);
  const situacao = busca.situacao;
  const versaoRef = useRef(busca.versao);
  versaoRef.current = busca.versao;
  function requisicao(chave) {
    if (!requisicoes.current[chave]) requisicoes.current[chave] = gerarRequisicaoId();
    return requisicoes.current[chave];
  }
  async function executar(chave, fn, textoSucesso) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setOcupado(chave);
    setErro(null);
    setAviso(null);
    try {
      const r = await fn(requisicao(chave));
      requisicoes.current[chave] = null;
      setDialogo(null);
      setAviso(r.aviso ?? (r.reaproveitada ? "Esta opera\xE7\xE3o j\xE1 tinha sido registrada." : textoSucesso));
      if (r.busca) onAtualizada(r.busca);
    } catch (e) {
      setErro(interpretarErro(e));
    } finally {
      ocupadoRef.current = false;
      setOcupado(null);
    }
  }
  const renovar = () => executar("renovar", (req) => renovarBuscaVeiculo({ buscaId: busca.id, versaoEsperada: versaoRef.current, requisicaoId: req }, idToken), "Busca renovada por mais 30 dias.");
  const reativar = () => {
    if (!interesse) {
      setErro({ tipo: "negocio", texto: "Confirme novamente que o cliente deseja ser avisado." });
      return;
    }
    return executar("reativar", (req) => reativarBuscaVeiculo({ buscaId: busca.id, versaoEsperada: versaoRef.current, interesseConfirmado: true, requisicaoId: req }, idToken), "Busca reativada por 30 dias.");
  };
  const encerrar = () => {
    if (!motivo) {
      setErro({ tipo: "negocio", texto: "Escolha o motivo do encerramento." });
      return;
    }
    return executar("encerrar", (req) => encerrarBuscaVeiculo({ buscaId: busca.id, versaoEsperada: versaoRef.current, motivo, observacao: obs.trim(), requisicaoId: req }, idToken), "Busca encerrada.");
  };
  const transferir = () => {
    if (!destino) {
      setErro({ tipo: "negocio", texto: "Escolha o novo respons\xE1vel." });
      return;
    }
    return executar("transferir:" + destino, (req) => transferirBuscaVeiculo({ buscaId: busca.id, versaoEsperada: versaoRef.current, novoResponsavelId: destino, requisicaoId: req }, idToken), "Busca transferida.");
  };
  function abrirDialogo(tipo) {
    setErro(null);
    setAviso(null);
    setDestino("");
    setInteresse(false);
    setMotivo("");
    setObs("");
    setDialogo(tipo);
  }
  if (!pode) {
    return /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "Voc\xEA pode consultar esta busca, mas n\xE3o alter\xE1-la (somente o vendedor respons\xE1vel, a Ger\xEAncia e a vis\xE3o global operacional)." });
  }
  const podeAlterarAtiva = situacao === "ativa" || situacao === "expirada";
  const podeTransferir = podeTransferirBusca(usuario, busca, usuarios);
  const destinos = destinosDeTransferencia(usuarios, busca);
  const nomeAtual = (usuarios ?? []).find((u) => String(u.id) === String(busca.responsavelId))?.nome;
  return /* @__PURE__ */ jsxs("div", { className: "buscas__acoes", children: [
    aviso && /* @__PURE__ */ jsx("p", { className: "buscas__sucesso", role: "status", children: aviso }),
    /* @__PURE__ */ jsx(MensagemErroBusca, { erro: dialogo ? null : erro, onRecarregar, onEntrarNovamente: () => logout() }),
    /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes buscas__botoes", children: [
      podeAlterarAtiva && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: onEditar, disabled: !!ocupado, children: "Editar" }),
      podeAlterarAtiva && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: renovar, disabled: !!ocupado, children: ocupado === "renovar" ? "Renovando\u2026" : "Renovar (30 dias)" }),
      podeAlterarAtiva && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-perigo", onClick: () => abrirDialogo("encerrar"), disabled: !!ocupado, children: "Encerrar" }),
      situacao === "encerrada" && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: () => abrirDialogo("reativar"), disabled: !!ocupado, children: "Reativar" }),
      podeTransferir && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => abrirDialogo("transferir"), disabled: !!ocupado, children: "Transferir" })
    ] }),
    !podeTransferir && temVisaoGlobal(usuario) && /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "Transfer\xEAncia: Ger\xEAncia, respons\xE1vel pela busca ou, se o respons\xE1vel estiver inativo, a vis\xE3o global." }),
    dialogo && /* @__PURE__ */ jsx("div", { className: "drop-motivo-overlay", onClick: () => !ocupado && setDialogo(null), children: /* @__PURE__ */ jsx("div", { className: "drop-motivo-modal", role: "dialog", "aria-modal": "true", onClick: (e) => e.stopPropagation(), children: dialogo === "transferir" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("h3", { children: [
        "Transferir busca ",
        busca.codigo,
        "?"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "side-panel__cliente", children: resumoModelos(busca) }),
      /* @__PURE__ */ jsxs("div", { className: "side-panel__form", children: [
        /* @__PURE__ */ jsxs("p", { className: "buscas__ajuda", children: [
          "Respons\xE1vel atual: ",
          nomeAtual ?? "\u2014 (sem respons\xE1vel ativo)",
          ". Os pr\xF3ximos avisos desta busca seguir\xE3o o novo respons\xE1vel; o hist\xF3rico e a Timeline registram a mudan\xE7a."
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
          /* @__PURE__ */ jsx("span", { children: "Novo respons\xE1vel *" }),
          /* @__PURE__ */ jsxs("select", { value: destino, onChange: (e) => {
            setDestino(e.target.value);
            setErro(null);
          }, disabled: !!ocupado, autoFocus: true, children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Selecione o novo respons\xE1vel\u2026" }),
            destinos.map((u) => /* @__PURE__ */ jsx("option", { value: u.id, children: u.nome }, u.id))
          ] })
        ] }),
        /* @__PURE__ */ jsx(MensagemErroBusca, { erro, onRecarregar, onEntrarNovamente: () => logout() }),
        /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: transferir, disabled: !!ocupado, children: ocupado ? "Transferindo\u2026" : "Transferir busca" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setDialogo(null), disabled: !!ocupado, children: "Cancelar" })
        ] })
      ] })
    ] }) : dialogo === "encerrar" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("h3", { children: [
        "Encerrar busca ",
        busca.codigo,
        "?"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "side-panel__cliente", children: resumoModelos(busca) }),
      /* @__PURE__ */ jsxs("div", { className: "side-panel__form", children: [
        /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
          /* @__PURE__ */ jsx("span", { children: "Motivo do encerramento *" }),
          /* @__PURE__ */ jsxs("select", { value: motivo, onChange: (e) => {
            setMotivo(e.target.value);
            setErro(null);
          }, disabled: !!ocupado, autoFocus: true, children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Selecione o motivo\u2026" }),
            MOTIVOS_ENCERRAMENTO.map((m) => /* @__PURE__ */ jsx("option", { value: m.valor, children: m.rotulo }, m.valor))
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "side-panel__campo", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            "Observa\xE7\xE3o (opcional, ",
            obs.length,
            "/",
            MAX_OBS_ENCERRAMENTO,
            ")"
          ] }),
          /* @__PURE__ */ jsx("textarea", { value: obs, onChange: (e) => setObs(e.target.value), maxLength: MAX_OBS_ENCERRAMENTO, disabled: !!ocupado })
        ] }),
        /* @__PURE__ */ jsx(MensagemErroBusca, { erro, onRecarregar, onEntrarNovamente: () => logout() }),
        /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-perigo", onClick: encerrar, disabled: !!ocupado, children: ocupado === "encerrar" ? "Encerrando\u2026" : "Encerrar busca" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setDialogo(null), disabled: !!ocupado, children: "Cancelar" })
        ] })
      ] })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("h3", { children: [
        "Reativar busca ",
        busca.codigo,
        "?"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "side-panel__cliente", children: resumoModelos(busca) }),
      /* @__PURE__ */ jsxs("div", { className: "side-panel__form", children: [
        /* @__PURE__ */ jsxs("label", { className: "buscas__confirmacao", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: interesse, onChange: (e) => {
            setInteresse(e.target.checked);
            setErro(null);
          }, disabled: !!ocupado, autoFocus: true }),
          /* @__PURE__ */ jsx("span", { children: "O cliente reconfirmou que deseja ser avisado quando surgir um ve\xEDculo compat\xEDvel. *" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "A busca volta a valer por 30 dias." }),
        /* @__PURE__ */ jsx(MensagemErroBusca, { erro, onRecarregar, onEntrarNovamente: () => logout() }),
        /* @__PURE__ */ jsxs("div", { className: "side-panel__form-acoes", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: reativar, disabled: !!ocupado, children: ocupado === "reativar" ? "Reativando\u2026" : "Reativar busca" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setDialogo(null), disabled: !!ocupado, children: "Cancelar" })
        ] })
      ] })
    ] }) }) })
  ] });
}
function CartaoBusca({ busca, usuarios, cliente, responsavel, onAtualizada, onRecarregar, onAbrirOportunidade, iniciarAberto }) {
  const [aberto, setAberto] = useState(!!iniciarAberto);
  const [editando, setEditando] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const criterios = criteriosDaBusca(busca);
  return /* @__PURE__ */ jsxs("li", { className: "buscas__cartao", "data-busca-id": busca.id, children: [
    /* @__PURE__ */ jsxs("button", { type: "button", className: "buscas__cartao-topo", onClick: () => setAberto((v) => !v), "aria-expanded": aberto, children: [
      /* @__PURE__ */ jsxs("span", { className: "buscas__cartao-titulo", children: [
        /* @__PURE__ */ jsx("strong", { children: busca.codigo }),
        " \xB7 ",
        resumoModelos(busca)
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "buscas__cartao-meta", children: [
        /* @__PURE__ */ jsx(SeloSituacao, { busca }),
        " ",
        /* @__PURE__ */ jsx("small", { children: textoValidade(busca) })
      ] }),
      criterios.length > 0 && /* @__PURE__ */ jsx("small", { className: "buscas__cartao-criterios", children: criterios.join(" \xB7 ") }),
      busca.aguardandoValidacao && /* @__PURE__ */ jsx("small", { className: "buscas__cartao-criterios", children: "Modelo aguardando valida\xE7\xE3o da Ger\xEAncia; a busca j\xE1 est\xE1 valendo." })
    ] }),
    aberto && /* @__PURE__ */ jsx("div", { className: "buscas__cartao-corpo", children: editando ? /* @__PURE__ */ jsx(
      EditorBusca,
      {
        modo: "editar",
        busca,
        onCancelar: () => setEditando(false),
        onConcluir: (b) => {
          setEditando(false);
          onAtualizada(b);
        }
      }
    ) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(DetalheBusca, { busca, cliente, responsavel, onAbrirOportunidade }),
      /* @__PURE__ */ jsx(AcoesBusca, { busca, usuarios, onEditar: () => setEditando(true), onAtualizada, onRecarregar }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "buscas__link", onClick: () => setMostrarHistorico((v) => !v), children: mostrarHistorico ? "Ocultar hist\xF3rico" : "Ver hist\xF3rico" }),
      mostrarHistorico && /* @__PURE__ */ jsx(HistoricoBusca, { buscaId: busca.id, versao: busca.versao })
    ] }) })
  ] });
}
function BuscasDaOportunidade({ oportunidade, cliente, responsavel, usuarios, motivoPerdaObj, sugerirRegistro, onAbrirBuscas }) {
  const { idToken, usuario, logout } = useAuth();
  const [buscas, setBuscas] = useState(null);
  const [erro, setErro] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const usuariosPorId = useMemo(() => new Map((usuarios ?? []).map((u) => [String(u.id), u])), [usuarios]);
  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setBuscas(await listBuscasVeiculos(idToken, { oportunidadeId: oportunidade.id }));
    } catch (e) {
      setErro(interpretarErro(e));
      setBuscas((b) => b ?? []);
    }
  }, [idToken, oportunidade.id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  function abrirFormulario() {
    setSucesso(null);
    setFormAberto(true);
  }
  function aoAtualizada(b) {
    setBuscas((lista) => (lista ?? []).map((x) => x.id === b.id ? b : x));
    void carregar();
  }
  const podeRegistrar = podeRegistrarBusca(usuario, oportunidade);
  const motivoIndisponibilidade = MOTIVOS_PERDA_INDISPONIBILIDADE.includes(String(oportunidade.motivoPerdaId ?? ""));
  const oportunidadeParaForm = { ...oportunidade, clienteNome: cliente?.nome };
  return /* @__PURE__ */ jsxs("div", { className: "buscas__aba", children: [
    sugerirRegistro && motivoIndisponibilidade && !formAberto && /* @__PURE__ */ jsxs("div", { className: "buscas__sugestao", role: "status", children: [
      "Esta negocia\xE7\xE3o foi perdida por falta do ve\xEDculo (",
      motivoPerdaObj?.nome ?? "indisponibilidade",
      "). Se o cliente quer ser avisado quando surgir um modelo compat\xEDvel, registre a busca."
    ] }),
    sucesso && /* @__PURE__ */ jsx("p", { className: "buscas__sucesso", role: "status", children: sucesso }),
    erro && /* @__PURE__ */ jsx(MensagemErroBusca, { erro, recarregarEmRede: true, onRecarregar: carregar, onEntrarNovamente: () => logout() }),
    buscas === null && /* @__PURE__ */ jsx("p", { className: "side-panel__vazio-aba", children: "Carregando buscas\u2026" }),
    buscas !== null && buscas.length === 0 && !formAberto && /* @__PURE__ */ jsx("p", { className: "side-panel__vazio-aba", children: "Nenhuma busca de ve\xEDculo registrada para esta negocia\xE7\xE3o." }),
    buscas !== null && buscas.length > 0 && /* @__PURE__ */ jsx("ul", { className: "buscas__lista", children: buscas.map((b) => /* @__PURE__ */ jsx(
      CartaoBusca,
      {
        busca: b,
        usuarios,
        cliente,
        responsavel: usuariosPorId.get(String(b.responsavelId)),
        onAtualizada: aoAtualizada,
        onRecarregar: carregar,
        iniciarAberto: buscas.length === 1,
        onAbrirOportunidade: null
      },
      b.id
    )) }),
    formAberto ? /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(
      EditorBusca,
      {
        modo: "criar",
        oportunidade: oportunidadeParaForm,
        onCancelar: () => setFormAberto(false),
        onConcluir: (b, info) => {
          setFormAberto(false);
          setSucesso(info.reaproveitada ? `Busca ${b.codigo} j\xE1 estava registrada.` : `Busca ${b.codigo} registrada: vale por 30 dias.`);
          setBuscas((lista) => [b, ...(lista ?? []).filter((x) => x.id !== b.id)]);
          void carregar();
        }
      }
    ) }) : podeRegistrar ? /* @__PURE__ */ jsx("button", { type: "button", className: motivoIndisponibilidade ? "side-panel__botao-primario" : "side-panel__botao-secundario", onClick: abrirFormulario, children: "Registrar busca de ve\xEDculo" }) : /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "Somente o vendedor respons\xE1vel, a Ger\xEAncia e a vis\xE3o global operacional registram buscas." }),
    onAbrirBuscas && /* @__PURE__ */ jsx("button", { type: "button", className: "buscas__link", onClick: onAbrirBuscas, children: "Ver todas as buscas de ve\xEDculos" })
  ] });
}
export {
  AcoesBusca,
  BuscasDaOportunidade,
  CartaoBusca,
  DetalheBusca,
  EditorBusca,
  HistoricoBusca,
  MensagemErroBusca,
  SeletorModelos,
  SeloSituacao
};
