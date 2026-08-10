import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from "react";
const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
// Sprint 8 "Performance e Estabilidade" (2026-08-10): envolvido em
// React.memo -- o Pipeline renderiza um card destes por oportunidade
// visível numa coluna, e antes disso qualquer mudança de estado local no
// Pipeline (uma tecla digitada num modal, um hover de drag, etc.)
// re-renderizava TODOS os cards de TODAS as colunas, mesmo sem nenhum
// dado do card ter mudado. Com memo, o card só re-renderiza quando suas
// próprias props mudam de valor -- e Pipeline.tsx (ver handleClickCard/
// handleDragStartCard/handleDragEndCard) agora passa handlers estáveis
// (useCallback, chaveados por id) em vez de funções novas a cada render,
// para o memo realmente evitar o re-render (function props "novos" a cada
// render invalidariam a comparação rasa do memo mesmo com os outros
// campos iguais).
function OpportunityCardComponent({ oportunidade, cliente, onClick, arrastavel = false, onDragStart, onDragEnd, destaque = false, }) {
    return (_jsxs("article", { className: "op-card" + (arrastavel ? " op-card--arrastavel" : "") + (destaque ? " op-card--destaque" : ""), onClick: () => onClick(oportunidade.id), role: "button", tabIndex: 0, draggable: arrastavel, onDragStart: arrastavel ? (e) => onDragStart?.(oportunidade.id, e) : undefined, onDragEnd: arrastavel ? (e) => onDragEnd?.(oportunidade.id, e) : undefined, children: [_jsx("strong", { className: "op-card__veiculo", children: oportunidade.veiculoInteresse || "Veículo não definido" }), _jsx("p", { className: "op-card__cliente", children: cliente?.nome ?? "Cliente não identificado" }), _jsx("p", { className: "op-card__proxima", children: oportunidade.proximaAcao || "Sem próxima ação definida" }), oportunidade.valorProposto && (_jsx("span", { className: "op-card__valor", children: formatoMoeda.format(oportunidade.valorProposto) }))] }));
}
export const OpportunityCard = memo(OpportunityCardComponent);
