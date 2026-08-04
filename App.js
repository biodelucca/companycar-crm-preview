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
    // Sprint 5 "Refinamento de UX — Conversas" (2026-08-04): ponte simples
    // para a ação rápida "Abrir oportunidade completa" em Conversas.tsx —
    // guarda qual oportunidade o Pipeline deve pré-selecionar na próxima
    // vez que for montado, e é limpa assim que o Pipeline a consome.
    const [oportunidadeParaAbrirNoPipeline, setOportunidadeParaAbrirNoPipeline] = useState(null);
    if (!usuario)
        return _jsx(Login, {});
    return (_jsxs(AppLayout, { vista: vista, onMudarVista: setVista, children: [vista === "dashboard" && _jsx(Dashboard, { onIrPipeline: () => setVista("pipeline") }), vista === "pipeline" && (_jsx(Pipeline, { oportunidadeInicialId: oportunidadeParaAbrirNoPipeline, aoConsumirOportunidadeInicial: () => setOportunidadeParaAbrirNoPipeline(null) })), vista === "conversas" && (_jsx(Conversas, { onAbrirNoPipeline: (oportunidadeId) => {
                    setOportunidadeParaAbrirNoPipeline(oportunidadeId);
                    setVista("pipeline");
                } }))] }));
}
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(Root, {}) }));
}
