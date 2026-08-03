import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from "react";
import { encerrarSessao } from "../services/auth.js";
// Contexto de autenticação. Guarda o usuário logado e o token usado em
// cada chamada de API.
//
// Passo 4 (autenticação Google, autorizado pelo CPO em 2026-08-02): fora
// do modo mock, o campo "idToken" deste contexto NÃO é o ID token bruto
// do Google — é o token de sessão opaco emitido pelo backend na ação
// "login" (ver services/auth.ts e Auth.gs). O ID token do Google só
// existe transitoriamente no callback do Google Identity Services, em
// Login.tsx, e nunca chega a este contexto. Manter o nome "idToken" aqui
// evita alterar a assinatura usada por todo o resto do app (Dashboard,
// Pipeline, apiClient) — só o significado do valor mudou.
//
// MOCK: com VITE_USE_MOCK_AUTH=true, o login acontece automaticamente com um
// usuário fictício, para permitir navegar no produto sem depender do login
// real com Google. Mantido apenas para ambiente de desenvolvimento
// (decisão do CPO, 2026-08-02) — a versão publicada usa o flag "false".
//
// Flag separada da de dados (VITE_USE_MOCK_DATA, ver services/oportunidades.ts)
// desde 2026-08-02, quando o Passo 3 (Google Sheets) ligou os dados reais
// antes da autenticação real existir — decisão dentro da autonomia técnica
// concedida pelo CEO (não muda regra de negócio, não aumenta complexidade,
// acelera a entrega). Aprovada pelo CPO na revisão do Passo 3.
const USE_MOCK = "true" === "true";
// Sprint 1 "Operação Comercial" (2026-08-03): a aba Usuarios da planilha
// real agora tem 6 usuários com id numérico (1-6, ver seed em
// claude/cto-diretriz-tecnica-crm-mvp-2026-08.md) — os antigos
// mockUsuarios (u1-u4, fictícios) não existem mais no backend. Como as
// escritas desta Sprint (moverEtapaOportunidade, transferirOportunidade)
// mandam o id do usuário logado para a planilha (quem fez a ação), o
// usuário do modo mock de autenticação passou a espelhar o registro real
// de id=1 (Guilherme) em vez de mockUsuarios[0] — senão toda ação
// registrada na Timeline referenciaria um usuarioId inexistente. Isto é
// só o "ator" simulado enquanto o login Google real fica pausado; não
// afeta a lista de usuários mostrada no app (essa já vem real, ver
// services/oportunidades.ts).
const usuarioMockPadrao = {
    id: "1",
    nome: "Guilherme dos Santos De Lucca",
    email: "biodelucca@gmail.com",
    papel: "Gerencia",
    ativo: true,
    criadoEm: "2026-08-02",
};
const AuthContext = createContext(undefined);
export function AuthProvider({ children }) {
    const [usuario, setUsuario] = useState(null);
    const [idToken, setIdToken] = useState(null);
    useEffect(() => {
        if (USE_MOCK) {
            setUsuario(usuarioMockPadrao);
            setIdToken("mock-id-token");
        }
    }, []);
    function login(token, user) {
        setIdToken(token);
        setUsuario(user);
    }
    function logout() {
        if (USE_MOCK)
            return; // no preview mockado não há logout real
        // Limpa o estado local imediatamente (não espera a chamada de rede) —
        // o usuário não deve ficar preso na tela por causa de uma falha de
        // logout no backend, que é best-effort (ver services/auth.ts).
        const sessionTokenAtual = idToken;
        setIdToken(null);
        setUsuario(null);
        if (sessionTokenAtual) {
            void encerrarSessao(sessionTokenAtual);
        }
        // Evita que o Google reloge automaticamente a mesma conta via One Tap
        // logo após um logout explícito.
        window.google?.accounts?.id?.disableAutoSelect?.();
    }
    return (_jsx(AuthContext.Provider, { value: { usuario, idToken, login, logout }, children: children }));
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth deve ser usado dentro de um AuthProvider.");
    return ctx;
}
