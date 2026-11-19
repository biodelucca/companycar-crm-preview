import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { listClientes, listUsuarios } from "../services/oportunidades.js";
import { listCentralRecuperacao, registrarContatoRecuperacao } from "../services/recuperacao.js";
import { encerrarBuscaVeiculo } from "../services/buscas.js";
import { MensagemErroBusca, SeloSituacao } from "../components/BuscasVeiculos.js";
import { MAX_OBS_ENCERRAMENTO, MOTIVOS_ENCERRAMENTO, criteriosDaBusca, formatarDataHora, formatarDia, formatarMoeda, gerarRequisicaoId, interpretarErro, resumoModelos, temVisaoGlobal, textoValidade } from "../utils/buscas.js";
import {
  AVISO_CLIENTE_INTERESSADO,
  AVISO_SEM_INTERESSE,
  CANAIS_CONTATO,
  EXPLICACAO_NOVA,
  EXPLICACAO_SEM_ACOMPANHAMENTO,
  FILTROS_PERIODO_RECUPERACAO,
  FILTROS_STATUS_RECUPERACAO,
  MAX_DIAS_PROXIMO_CONTATO,
  MAX_OBS_CONTATO,
  MAX_VEICULOS_CONTATO,
  PASSOS_CONTATO,
  RESULTADOS_CONTATO,
  alternarVeiculo,
  contagemRecuperacao,
  diaSP,
  escolherPasso,
  escolherResultado,
  filtrarDemandas,
  formularioContatoVazio,
  nomeVeiculo,
  opcoesModelo,
  opcoesResponsavel,
  passoExigeData,
  passoProibeData,
  payloadContato,
  rotuloCambioVeiculo,
  somarDiasDia,
  textoContato,
  textoKm,
  textoSemAcompanhamento,
  validarContato
} from "../utils/recuperacao.js";
function SelosDemanda({ demanda, horasSem }) {
  const r = demanda.resumo;
  return /* @__PURE__ */ jsxs("span", { className: "recup__selos", children: [
    r.semAcompanhamento && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--sem-acomp", title: EXPLICACAO_SEM_ACOMPANHAMENTO, children: textoSemAcompanhamento(r, horasSem) }),
    r.alertaSemInteresse && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--sem-interesse", title: "O cliente disse que n\xE3o tem interesse. A busca continua ativa at\xE9 uma pessoa encerrar.", children: "Sem interesse \xB7 decidir encerramento" }),
    !r.alertaSemInteresse && r.sugerirEncerramento && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--sugestao", title: "\xDAltimo contato sugere encerrar o acompanhamento.", children: "Encerramento sugerido" }),
    r.retornoVencido && /* @__PURE__ */ jsx("span", { className: "recup__selo recup__selo--retorno", title: "A data combinada para o pr\xF3ximo contato j\xE1 passou.", children: "Retorno vencido" }),
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
function ResumoUltimoContato({ demanda }) {
  const c = demanda.contatos[0];
  if (!c) return /* @__PURE__ */ jsx("p", { className: "recup__contato recup__contato--vazio", children: "Nenhum contato registrado ainda." });
  return /* @__PURE__ */ jsxs("p", { className: "recup__contato", "data-ultimo-contato": true, children: [
    /* @__PURE__ */ jsx("strong", { children: "\xDAltimo contato:" }),
    " ",
    formatarDataHora(c.dataHora),
    " \xB7 ",
    c.usuarioNome || "\u2014",
    " \xB7 ",
    textoContato(c)
  ] });
}
function ItemContato({ c, nomeVendedor }) {
  return /* @__PURE__ */ jsxs("li", { className: "recup__historico-item", "data-contato-id": c.id, children: [
    /* @__PURE__ */ jsxs("span", { className: "recup__historico-topo", children: [
      /* @__PURE__ */ jsx("strong", { children: formatarDataHora(c.dataHora) }),
      " \xB7 ",
      c.usuarioNome || "\u2014",
      c.registradoPorTerceiro && /* @__PURE__ */ jsxs("span", { className: "recup__selo recup__selo--terceiro", title: `Contato registrado por quem n\xE3o \xE9 o vendedor respons\xE1vel (${nomeVendedor}).`, children: [
        "em busca de ",
        nomeVendedor
      ] })
    ] }),
    /* @__PURE__ */ jsx("span", { children: textoContato(c) }),
    c.veiculos.length > 0 && /* @__PURE__ */ jsxs("span", { className: "buscas__ajuda", children: [
      "Ve\xEDculos apresentados: ",
      c.veiculos.map((v) => v.descricao || v.veiculoId).join("; ")
    ] }),
    c.observacao && /* @__PURE__ */ jsxs("span", { className: "recup__historico-obs", children: [
      "\u201C",
      c.observacao,
      "\u201D"
    ] })
  ] });
}
function GrupoOpcoes({ grupo, rotulo, opcoes, valor, onEscolher, erro, desabilitado }) {
  return /* @__PURE__ */ jsxs("div", { className: "recup__campo", "data-grupo": grupo, children: [
    /* @__PURE__ */ jsx("span", { className: "recup__campo-rotulo", id: `recup-g-${grupo}`, children: rotulo }),
    /* @__PURE__ */ jsx("div", { className: "recup__opcoes", role: "radiogroup", "aria-labelledby": `recup-g-${grupo}`, children: opcoes.map((o) => /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": valor === o.valor,
        "data-valor": o.valor,
        disabled: desabilitado,
        className: `recup__opcao${valor === o.valor ? " recup__opcao--ativa" : ""}`,
        onClick: () => onEscolher(o.valor),
        children: o.rotulo
      },
      o.valor
    )) }),
    erro && /* @__PURE__ */ jsx("span", { className: "buscas__erro-campo", role: "alert", children: erro })
  ] });
}
function FormularioContato({ demanda, nomeCliente, nomeVendedor, hoje, onFechar, onSalvo }) {
  const { idToken, usuario, logout } = useAuth();
  const [form, setForm] = useState(() => formularioContatoVazio());
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const requisicao = useRef(null);
  if (!requisicao.current) requisicao.current = gerarRequisicaoId();
  const b = demanda.busca;
  const terceiro = String(b.responsavelId) !== String(usuario?.id);
  async function enviar() {
    if (enviando) return;
    const e = validarContato(form, hoje);
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await registrarContatoRecuperacao({ ...payloadContato(form, b), requisicaoId: requisicao.current }, idToken);
      onSalvo(form, resposta);
    } catch (x) {
      setErro(interpretarErro(x));
    } finally {
      setEnviando(false);
    }
  }
  const mostrarData = form.proximoPasso !== "" && !passoProibeData(form.proximoPasso);
  const sessaoExpirada = erro?.tipo === "sessao";
  return /* @__PURE__ */ jsx("div", { className: "side-panel__overlay recup__overlay-form", onClick: () => !enviando && onFechar(), children: /* @__PURE__ */ jsxs("aside", { className: "side-panel recup__form", onClick: (e) => e.stopPropagation(), "aria-label": `Registrar contato na busca ${b.codigo}`, role: "dialog", "aria-modal": "true", children: [
    /* @__PURE__ */ jsxs("div", { className: "side-panel__header", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { children: "Registrar contato" }),
        /* @__PURE__ */ jsxs("p", { className: "side-panel__cliente", children: [
          nomeCliente,
          " \xB7 ",
          b.codigo
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "side-panel__fechar", onClick: onFechar, "aria-label": "Fechar", disabled: enviando, children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "side-panel__body recup__form-corpo", children: [
      terceiro && /* @__PURE__ */ jsxs("p", { className: "buscas__ajuda recup__info", "data-info": "terceiro", children: [
        "Voc\xEA est\xE1 registrando em uma busca de ",
        /* @__PURE__ */ jsx("strong", { children: nomeVendedor }),
        ". O registro fica no seu nome e a busca continua com ",
        nomeVendedor,
        "."
      ] }),
      /* @__PURE__ */ jsx(GrupoOpcoes, { grupo: "canal", rotulo: "Canal", opcoes: CANAIS_CONTATO, valor: form.canal, onEscolher: (v) => setForm((f) => ({ ...f, canal: v })), erro: erros.canal, desabilitado: enviando }),
      /* @__PURE__ */ jsx(GrupoOpcoes, { grupo: "resultado", rotulo: "Resultado", opcoes: RESULTADOS_CONTATO, valor: form.resultado, onEscolher: (v) => setForm((f) => escolherResultado(f, v, hoje)), erro: erros.resultado, desabilitado: enviando }),
      form.resultado === "sem_interesse" && /* @__PURE__ */ jsx("p", { className: "buscas__ajuda recup__info", "data-info": "sem-interesse", children: AVISO_SEM_INTERESSE }),
      form.resultado === "cliente_interessado" && /* @__PURE__ */ jsx("p", { className: "buscas__ajuda recup__info", "data-info": "interessado", children: AVISO_CLIENTE_INTERESSADO }),
      /* @__PURE__ */ jsx(GrupoOpcoes, { grupo: "proximoPasso", rotulo: "Pr\xF3ximo passo", opcoes: PASSOS_CONTATO, valor: form.proximoPasso, onEscolher: (v) => setForm((f) => escolherPasso(f, v, hoje)), erro: erros.proximoPasso, desabilitado: enviando }),
      mostrarData && /* @__PURE__ */ jsxs("label", { className: "recup__campo", "data-campo": "data", children: [
        /* @__PURE__ */ jsxs("span", { className: "recup__campo-rotulo", children: [
          "Data do pr\xF3ximo contato",
          passoExigeData(form.proximoPasso) ? " (obrigat\xF3ria)" : " (opcional)"
        ] }),
        /* @__PURE__ */ jsx("input", { type: "date", value: form.data, min: hoje, max: somarDiasDia(hoje, MAX_DIAS_PROXIMO_CONTATO), disabled: enviando, onChange: (e) => setForm((f) => ({ ...f, data: e.target.value })) }),
        erros.data && /* @__PURE__ */ jsx("span", { className: "buscas__erro-campo", role: "alert", children: erros.data })
      ] }),
      /* @__PURE__ */ jsxs("fieldset", { className: "recup__campo recup__campo--veiculos", "data-campo": "veiculos", disabled: enviando, children: [
        /* @__PURE__ */ jsx("legend", { className: "recup__campo-rotulo", children: "Ve\xEDculos apresentados ao cliente (opcional)" }),
        /* @__PURE__ */ jsx("ul", { className: "recup__form-veiculos", children: demanda.veiculos.map((v) => {
          const marcado = form.veiculosIds.includes(v.veiculoId);
          const cheio = !marcado && form.veiculosIds.length >= MAX_VEICULOS_CONTATO;
          return /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("label", { className: `recup__check${marcado ? " recup__check--ativo" : ""}`, children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: marcado, disabled: cheio, "data-veiculo-id": v.veiculoId, onChange: () => setForm((f) => alternarVeiculo(f, v.veiculoId)) }),
            /* @__PURE__ */ jsxs("span", { children: [
              nomeVeiculo(v),
              " ",
              /* @__PURE__ */ jsxs("small", { children: [
                v.ano || "\u2014",
                " \xB7 ",
                v.preco === null ? "Sem pre\xE7o" : formatarMoeda(v.preco),
                v.situacaoVeiculo === "indisponivel" ? " \xB7 indispon\xEDvel" : ""
              ] })
            ] })
          ] }) }, v.id);
        }) }),
        erros.veiculos && /* @__PURE__ */ jsx("span", { className: "buscas__erro-campo", role: "alert", children: erros.veiculos })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "recup__campo", "data-campo": "observacao", children: [
        /* @__PURE__ */ jsx("span", { className: "recup__campo-rotulo", children: "Observa\xE7\xE3o (opcional)" }),
        /* @__PURE__ */ jsx("textarea", { rows: 3, value: form.observacao, maxLength: MAX_OBS_CONTATO, disabled: enviando, placeholder: "Ex.: prefere ver no s\xE1bado de manh\xE3", onChange: (e) => setForm((f) => ({ ...f, observacao: e.target.value })) }),
        /* @__PURE__ */ jsxs("small", { className: "buscas__ajuda", children: [
          form.observacao.length,
          "/",
          MAX_OBS_CONTATO
        ] }),
        erros.observacao && /* @__PURE__ */ jsx("span", { className: "buscas__erro-campo", role: "alert", children: erros.observacao })
      ] }),
      /* @__PURE__ */ jsx(MensagemErroBusca, { erro, recarregarEmRede: false, onRecarregar: onFechar, onEntrarNovamente: sessaoExpirada ? () => logout() : void 0 })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "recup__form-rodape", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: onFechar, disabled: enviando, children: "Cancelar" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", onClick: enviar, disabled: enviando, "data-acao": "salvar-contato", children: enviando ? "Registrando\u2026" : "Registrar contato" })
    ] })
  ] }) });
}
function EncerrarBusca({ demanda, onCancelar, onEncerrada }) {
  const { idToken, logout } = useAuth();
  const [motivo, setMotivo] = useState("cliente_sem_interesse");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const requisicao = useRef(null);
  if (!requisicao.current) requisicao.current = gerarRequisicaoId();
  async function confirmar() {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await encerrarBuscaVeiculo({ buscaId: demanda.busca.id, versaoEsperada: demanda.busca.versao, motivo, observacao: obs.trim(), requisicaoId: requisicao.current }, idToken);
      onEncerrada();
    } catch (x) {
      setErro(interpretarErro(x));
    } finally {
      setEnviando(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "recup__encerrar", "data-bloco": "encerrar-busca", children: [
    /* @__PURE__ */ jsxs("p", { children: [
      /* @__PURE__ */ jsxs("strong", { children: [
        "Encerrar a busca ",
        demanda.busca.codigo,
        "?"
      ] }),
      " Esta a\xE7\xE3o \xE9 sua: o sistema n\xE3o encerra sozinho."
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "recup__campo", children: [
      /* @__PURE__ */ jsx("span", { className: "recup__campo-rotulo", children: "Motivo" }),
      /* @__PURE__ */ jsx("select", { value: motivo, onChange: (e) => setMotivo(e.target.value), disabled: enviando, children: MOTIVOS_ENCERRAMENTO.map((m) => /* @__PURE__ */ jsx("option", { value: m.valor, children: m.rotulo }, m.valor)) })
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "recup__campo", children: [
      /* @__PURE__ */ jsx("span", { className: "recup__campo-rotulo", children: "Observa\xE7\xE3o (opcional)" }),
      /* @__PURE__ */ jsx("textarea", { rows: 2, value: obs, maxLength: MAX_OBS_ENCERRAMENTO, onChange: (e) => setObs(e.target.value), disabled: enviando })
    ] }),
    /* @__PURE__ */ jsx(MensagemErroBusca, { erro, onRecarregar: onEncerrada, onEntrarNovamente: erro?.tipo === "sessao" ? () => logout() : void 0 }),
    /* @__PURE__ */ jsxs("div", { className: "recup__acoes", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: onCancelar, disabled: enviando, children: "Manter busca ativa" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-perigo", onClick: confirmar, disabled: enviando, "data-acao": "confirmar-encerrar", children: enviando ? "Encerrando\u2026" : "Confirmar encerramento" })
    ] })
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
  const [contatoDemandaId, setContatoDemandaId] = useState(null);
  const [encerrandoId, setEncerrandoId] = useState(null);
  const [aviso, setAviso] = useState(null);
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
  useEffect(() => {
    if (!aviso) return void 0;
    const t = setTimeout(() => setAviso(null), 7e3);
    return () => clearTimeout(t);
  }, [aviso]);
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
  const contatoDemanda = dados.demandas.find((d) => d.busca.id === contatoDemandaId) ?? null;
  const filtrosAlterados = termo !== "" || responsavelId !== "" || modelo !== "" || status !== "" || periodo !== "";
  const limpar = () => {
    setTermo("");
    setResponsavelId("");
    setModelo("");
    setStatus("");
    setPeriodo("");
  };
  const hoje = diaSP(dados.geradoEm) || diaSP((/* @__PURE__ */ new Date()).toISOString());
  if (carregando) return /* @__PURE__ */ jsx("p", { className: "relatorios__estado", children: "Carregando a Central de Recupera\xE7\xE3o\u2026" });
  const sessaoExpirada = erro?.tipo === "sessao";
  const nomeCliente = (b) => clientesPorId.get(b.clienteId)?.nome ?? "Cliente n\xE3o identificado";
  const nomeVendedor = (b) => usuariosPorId.get(b.responsavelId)?.nome ?? "\u2014";
  const abrirContato = (id) => {
    setErro(null);
    setAviso(null);
    setContatoDemandaId(id);
  };
  const depoisDeSalvar = (form, resposta) => {
    setContatoDemandaId(null);
    const base = form.resultado === "sem_interesse" ? "Contato registrado. A busca continua ativa; o vendedor respons\xE1vel e a Ger\xEAncia foram sinalizados na Central." : "Contato registrado.";
    setAviso(resposta && resposta.timelineOk === false ? `${base} A anota\xE7\xE3o na Timeline da negocia\xE7\xE3o falhou e ficou registrada para corre\xE7\xE3o; n\xE3o \xE9 preciso registrar de novo.` : base);
    void carregar(false);
  };
  const depoisDeEncerrar = () => {
    setEncerrandoId(null);
    setAviso("Busca encerrada.");
    void carregar(false);
  };
  return /* @__PURE__ */ jsxs("div", { className: "relatorios buscas-pagina recup", children: [
    /* @__PURE__ */ jsxs("div", { className: "relatorios__cabecalho", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { children: "Central de Recupera\xE7\xE3o" }),
        /* @__PURE__ */ jsxs("p", { className: "relatorios__subtitulo", children: [
          visaoGlobal ? "Todas as demandas da opera\xE7\xE3o" : "Suas demandas",
          " \xB7 ve\xEDculos do estoque que combinam com o que o cliente procura \xB7 registre aqui cada contato"
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
    aviso && /* @__PURE__ */ jsx("p", { className: "buscas__sucesso recup__aviso-sucesso", role: "status", "data-aviso": "sucesso", children: aviso }),
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
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", "data-indicador": "retornos-vencidos", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Retornos vencidos" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.retornosVencidos })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relatorios__card", "data-indicador": "sem-interesse", children: [
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-label", children: "Sem interesse a decidir" }),
        /* @__PURE__ */ jsx("span", { className: "relatorios__card-valor", children: contagem.semInteresse })
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
      return /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs(
        "article",
        {
          className: "recup__demanda",
          "data-busca-id": b.id,
          "data-codigo": b.codigo,
          "data-sem-acompanhamento": d.resumo.semAcompanhamento ? "sim" : "nao",
          "data-novas": d.resumo.novas,
          "data-pendente": d.resumo.retornoVencido || d.resumo.alertaSemInteresse ? "sim" : "nao",
          children: [
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
            /* @__PURE__ */ jsx(ResumoUltimoContato, { demanda: d }),
            /* @__PURE__ */ jsxs("div", { className: "recup__rodape", children: [
              /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-secundario", onClick: () => setSelecionadaId(b.id), children: "Ver detalhes" }),
              d.permissoes.registrarContato && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", "data-acao": "registrar-contato", onClick: () => abrirContato(b.id), children: "Registrar contato" })
            ] })
          ]
        }
      ) }, b.id);
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
        /* @__PURE__ */ jsxs("section", { className: "recup__secao", "data-secao": "acompanhamento", children: [
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
          selecionada.resumo.retornoVencido && /* @__PURE__ */ jsxs("p", { className: "recup__aviso recup__aviso--retorno", "data-aviso": "retorno-vencido", children: [
            "O retorno combinado para ",
            formatarDia(selecionada.resumo.proximoContatoData),
            " j\xE1 passou."
          ] }),
          selecionada.resumo.sugerirEncerramento && /* @__PURE__ */ jsxs("div", { className: `recup__aviso recup__aviso--semint`, "data-aviso": "sem-interesse", children: [
            /* @__PURE__ */ jsxs("p", { children: [
              selecionada.resumo.alertaSemInteresse ? "Alerta: " : "Sugest\xE3o: ",
              "o \xFAltimo contato indica que o cliente n\xE3o tem mais interesse. ",
              /* @__PURE__ */ jsx("strong", { children: "A busca continua ativa" }),
              " at\xE9 uma pessoa autorizada decidir encerrar."
            ] }),
            selecionada.permissoes.encerrarBusca && encerrandoId !== selecionada.busca.id && /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-perigo", "data-acao": "abrir-encerrar", onClick: () => setEncerrandoId(selecionada.busca.id), children: "Encerrar busca\u2026" })
          ] }),
          encerrandoId === selecionada.busca.id && /* @__PURE__ */ jsx(EncerrarBusca, { demanda: selecionada, onCancelar: () => setEncerrandoId(null), onEncerrada: depoisDeEncerrar }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("strong", { children: "\xDAltimo registro de pessoa depois da correspond\xEAncia:" }),
            " ",
            selecionada.resumo.ultimaAtividadeHumanaEm ? formatarDataHora(selecionada.resumo.ultimaAtividadeHumanaEm) : "nenhum"
          ] }),
          selecionada.permissoes.registrarContato ? /* @__PURE__ */ jsx("button", { type: "button", className: "side-panel__botao-primario", "data-acao": "registrar-contato-painel", onClick: () => abrirContato(selecionada.busca.id), children: "Registrar contato" }) : /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: selecionada.busca.situacao === "encerrada" || selecionada.busca.situacao === "recuperada" ? "Busca encerrada: n\xE3o recebe novos contatos." : "Voc\xEA n\xE3o pode registrar contato nesta busca." })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "recup__secao", "data-secao": "contatos", children: [
          /* @__PURE__ */ jsxs("h3", { children: [
            "Contatos registrados (",
            selecionada.resumo.contatosTotal,
            ")"
          ] }),
          selecionada.contatos.length === 0 ? /* @__PURE__ */ jsx("p", { className: "buscas__ajuda", children: "Nenhum contato registrado." }) : /* @__PURE__ */ jsx("ul", { className: "recup__historico", children: selecionada.contatos.map((c) => /* @__PURE__ */ jsx(ItemContato, { c, nomeVendedor: nomeVendedor(selecionada.busca) }, c.id)) }),
          selecionada.resumo.contatosTotal > selecionada.contatos.length && /* @__PURE__ */ jsxs("p", { className: "buscas__ajuda", children: [
            "Mostrando os ",
            selecionada.contatos.length,
            " mais recentes."
          ] })
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
    ] }) }),
    contatoDemanda && /* @__PURE__ */ jsx(
      FormularioContato,
      {
        demanda: contatoDemanda,
        nomeCliente: nomeCliente(contatoDemanda.busca),
        nomeVendedor: nomeVendedor(contatoDemanda.busca),
        hoje,
        onFechar: () => setContatoDemandaId(null),
        onSalvo: depoisDeSalvar
      },
      contatoDemanda.busca.id
    )
  ] });
}
export {
  Recuperacao
};
