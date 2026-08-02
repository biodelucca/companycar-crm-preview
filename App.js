import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext.js";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Pipeline } from "./pages/Pipeline.js";
import { AppLayout } from "./layouts/AppLayout.js";
function Root() {
      const { usuario } = useAuth();
      const [vista, setVista] = useState("dashboard");
      if (!usuario)
                return _jsx(Login, {});
      return (_jsx(AppLayout, { vista: vista, onMudarVista: setVista, children: vista === "dashboard" ? (_jsx(Dashboard, { onIrPipeline: () => setVista("pipeline") })) : (_jsx(Pipeline, {})) }));
}
export default function App() {
      return (_jsx(AuthProvider, { children: _jsx(Root, {}) }));
}
