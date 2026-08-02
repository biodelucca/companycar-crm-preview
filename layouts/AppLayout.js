import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
// Layout compartilhado: topo com logo + navegação. Responsivo — em telas
// estreitas a navegação vira um menu suspenso (hamburger).
export function AppLayout({ vista, onMudarVista, children }) {
      const { usuario } = useAuth();
      const [menuAberto, setMenuAberto] = useState(false);
      function irPara(v) {
                onMudarVista(v);
                setMenuAberto(false);
      }
      return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "app-header__brand", children: [_jsx("span", { className: "app-header__logo", children: "Companycar" }), _jsx("span", { className: "app-header__badge", children: "CRM" })] }), _jsxs("nav", { className: `app-nav ${menuAberto ? "app-nav--aberto" : ""}`, children: [_jsx("button", { className: vista === "dashboard" ? "ativo" : "", onClick: () => irPara("dashboard"), children: "Dashboard" }), _jsx("button", { className: vista === "pipeline" ? "ativo" : "", onClick: () => irPara("pipeline"), children: "Pipeline" })] }), _jsxs("div", { className: "app-header__usuario", children: [usuario && (_jsx("span", { className: "app-header__avatar", title: usuario.nome, children: usuario.nome.charAt(0) })), _jsx("button", { className: "app-header__menu-btn", onClick: () => setMenuAberto((v) => !v), "aria-label": "Abrir menu", children: "☰" })] })] }), _jsx("main", { className: "app-content", children: children })] }));
}
