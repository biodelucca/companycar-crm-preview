import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { primeiroNome } from "../utils/nomes.js";
// Layout compartilhado: topo com logo + navegação. Responsivo — em telas
// estreitas a navegação vira um menu suspenso (hamburger).
// Decisão do CEO (2026-08-04): após os testes, Conversas (módulo WhatsApp)
// não entra em operação para a equipe neste momento — a integração com a
// Evolution API funcionou como prova de conceito, mas apresentou
// inconsistência no recebimento de mensagens e ainda depende de infra
// local (computador ligado). Código e documentação do WhatsApp ficam
// intactos (nada é desfeito) — só a navegação principal deixa de expor a
// aba para reduzir risco de perda de lead por essa via ainda instável.
// Acesso mantido apenas para o Gerente (Owner), para testes contínuos
// enquanto uma frente própria de robustez/hospedagem não é retomada.
const PAPEL_COM_ACESSO_CONVERSAS = "Gerente (Owner)";
export function AppLayout({ vista, onMudarVista, children }) {
    const { usuario, logout } = useAuth();
    const [menuAberto, setMenuAberto] = useState(false);
    const podeVerConversas = usuario?.papel === PAPEL_COM_ACESSO_CONVERSAS;
    function irPara(v) {
        onMudarVista(v);
        setMenuAberto(false);
    }
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "app-header__brand", children: [_jsx("span", { className: "app-header__logo", children: "Companycar" }), _jsx("span", { className: "app-header__badge", children: "CRM" })] }), _jsxs("nav", { className: `app-nav ${menuAberto ? "app-nav--aberto" : ""}`, children: [_jsx("button", { className: vista === "dashboard" ? "ativo" : "", onClick: () => irPara("dashboard"), children: "Dashboard" }), _jsx("button", { className: vista === "pipeline" ? "ativo" : "", onClick: () => irPara("pipeline"), children: "Pipeline" }), podeVerConversas && (_jsx("button", { className: vista === "conversas" ? "ativo" : "", onClick: () => irPara("conversas"), children: "Conversas" }))] }), _jsxs("div", { className: "app-header__usuario", children: [usuario && (_jsx("span", { className: "app-header__avatar", title: primeiroNome(usuario.nome), children: usuario.nome.charAt(0) })), usuario && (_jsx("button", { className: "app-header__logout", onClick: () => logout(), title: "Encerrar sess\u00e3o", children: "Sair" })), _jsx("button", { className: "app-header__menu-btn", onClick: () => setMenuAberto((v) => !v), "aria-label": "Abrir menu", children: "\u2630" })] })] }), _jsx("main", { className: "app-content", children: children })] }));
}
