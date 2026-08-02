import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
  import { nomeMotivoPerda } from "../services/oportunidades.js";
    const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
// Eventos/checklist são placeholders estáticos neste protótipo — servem
// para validar a navegação e o layout do painel, não a lógica real de
// timeline/checklist (isso entra num próximo sprint, com dados reais).
const timelinePlaceholder = [
{ data: "hoje", texto: "Oportunidade atualizada" },
{ data: "ontem", texto: "Contato registrado com o cliente" },
{ data: "há 3 dias", texto: "Oportunidade criada" },
  ];
const checklistPlaceholder = [
{ texto: "Documentos do cliente conferidos", feito: true },
  { texto: "Veículo de troca avaliado", feito: false },
  { texto: "Condição comercial aprovada", feito: false },
  ];
export function SidePanel({ oportunidade, cliente, responsavel, onFechar }) {
    const [aba, setAba] = useState("detalhes");
    const motivoPerda = nomeMotivoPerda(oportunidade.motivoPerdaId);
    return (_jsx("div", { className: "side-panel__overlay", onClick: onFechar, children: _jsxs("aside", { className: "side-panel", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "side-panel__header", children: [_jsxs("div", { children: [_jsx("h2", { children: oportunidade.veiculoInteresse }), _jsx("p", { className: "side-panel__cliente", children: cliente?.nome ?? "Cliente não identificado" })] }), _jsx("button", { className: "side-panel__fechar", onClick: onFechar, "aria-label": "Fechar", children: "✕" })] }), _jsxs("div", { className: "side-panel__tabs", children: [_jsx("button", { className: aba === "detalhes" ? "ativo" : "", onClick: () => setAba("detalhes"), children: "Detalhes" }), _jsx("button", { className: aba === "timeline" ? "ativo" : "", onClick: () => setAba("timeline"), children: "Timeline" }), _jsx("button", { className: aba === "checklist" ? "ativo" : "", onClick: () => setAba("checklist"), children: "Checklist" })] }), _jsxs("div", { className: "side-panel__body", children: [aba === "detalhes" && (_jsxs("dl", { className: "side-panel__lista", children: [_jsx("dt", { children: "Responsável" }), _jsx("dd", { children: responsavel?.nome ?? "—" }), _jsx("dt", { children: "Telefone" }), _jsx("dd", { children: cliente?.telefone ?? "—" }), _jsx("dt", { children: "Cidade" }), _jsx("dd", { children: cliente?.cidade ?? "—" }), _jsx("dt", { children: "Próxima ação" }), _jsx("dd", { children: oportunidade.proximaAcao }), oportunidade.condicaoComercial && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Condição comercial" }), _jsx("dd", { children: oportunidade.condicaoComercial })] })), oportunidade.valorProposto && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Valor proposto" }), _jsx("dd", { children: formatoMoeda.format(oportunidade.valorProposto) })] })), oportunidade.veiculoTroca && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Veículo na troca" }), _jsxs("dd", { children: [oportunidade.veiculoTroca.modelo, " · ", oportunidade.veiculoTroca.ano, " ·", " ", oportunidade.veiculoTroca.km.toLocaleString("pt-BR"), " km"] })] })), !oportunidade.veiculoTroca && oportunidade.veiculoTrocaDescricao && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Veículo na troca" }), _jsx("dd", { children: oportunidade.veiculoTrocaDescricao })] })), motivoPerda && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Motivo da perda" }), _jsx("dd", { children: motivoPerda })] }))] })), aba === "timeline" && (_jsx("ul", { className: "side-panel__timeline", children: timelinePlaceholder.map((evento, i) => (_jsxs("li", { children: [_jsx("span", { className: "side-panel__timeline-data", children: evento.data }), _jsx("span", { children: evento.texto })] }, i))) })), aba === "checklist" && (_jsx("ul", { className: "side-panel__checklist", children: checklistPlaceholder.map((item, i) => (_jsx("li", { children: _jsxs("label", { children: [_jsx("input", { type: "checkbox", defaultChecked: item.feito, readOnly: true }), item.texto] }) }, i))) }))] })] }) }));
}
