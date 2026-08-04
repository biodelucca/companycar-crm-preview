import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext.js";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Pipeline } from "./pages/Pipeline.js";
import { Conversas } from "./pages/Conversas.js";
import { AppLayout } from "./layouts/AppLayout.js";
function Root() {
    const { usuario } = useAuth();
    const [vista, setVista] = useState("dashboard");
    if (!usuario)
        return _jsx(Login, {});
    return (_jsxs(AppLayout, { vista: vista, onMudarVista: setVista, children: [vista === "dashboard" && _jsx(Dashboard, { onIrPipeline: () => setVista("pipeline") }), vista === "pipeline" && _jsx(Pipeline, {}), vista === "conversas" && _jsx(Conversas, {})] }));
}
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(Root, {}) }));
}
