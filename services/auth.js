import { apiClient } from "./apiClient.js";
// Camada de Services para autenticação real com Google (Passo 4 do
// roadmap, autorizado pelo CPO em 2026-08-02). Único lugar que fala com
// as ações "login"/"logout" do Apps Script — componentes não chamam
// apiClient diretamente (mesma regra de arquitetura das outras entidades).
//
// Mensagem de erro usada pelo backend (Auth.gs) quando o token de sessão
// está ausente ou expirado — componentes que fazem chamadas autenticadas
// comparam contra esta constante para decidir entre "sessão expirada,
// force novo login" e um erro genérico (ver Dashboard.tsx/Pipeline.tsx).
export const ERRO_SESSAO_EXPIRADA = "SESSAO_EXPIRADA";
// Mensagens específicas que o backend pode devolver na ação "login" —
// mapeadas aqui para texto amigável, em vez de mostrar o código bruto na
// tela de login.
const MENSAGENS_ERRO_LOGIN = {
    TOKEN_AUSENTE: "Não foi possível confirmar o login com o Google. Tente novamente.",
        TOKEN_INVALIDO_OU_EXPIRADO: "Sessão do Google expirada. Tente entrar novamente.",
            TOKEN_AUDIENCE_INCORRETA: "Login recusado por configuração do app. Avise o suporte técnico.",
                EMAIL_NAO_VERIFICADO: "Sua conta Google precisa ter o e-mail verificado para entrar.",
                    USUARIO_NAO_CADASTRADO: "Este e-mail não está cadastrado no Companycar CRM. Fale com o gestor.",
                        USUARIO_INATIVO: "Seu acesso está inativo. Fale com o gestor.",
                        };
                        export function mensagemErroLogin(erro) {
                            const codigo = erro instanceof Error ? erro.message : String(erro);
                                return MENSAGENS_ERRO_LOGIN[codigo] ?? "Não foi possível entrar. Tente novamente.";
                                }
                                // Recebe o ID token bruto do Google (JWT do Google Identity Services) e
                                // troca por um usuário + token de sessão da nossa aplicação. O ID token
                                // não é reutilizado depois disso — ver nota de arquitetura em Auth.gs.
                                export async function autenticarComGoogle(googleIdToken) {
                                    const resposta = await apiClient.request({
                                            action: "login",
                                                    params: { idToken: googleIdToken },
                                                        });
                                                            return {
                                                                    usuario: {
                                                                                id: String(resposta.usuario.id),
                                                                                            nome: resposta.usuario.nome,
                                                                                                        email: resposta.usuario.email,
                                                                                                                    papel: resposta.usuario.papel,
                                                                                                                                ativo: Boolean(resposta.usuario.ativo),
                                                                                                                                            criadoEm: resposta.usuario.criado_em,
                                                                                                                                                    },
                                                                                                                                                            sessionToken: resposta.sessionToken,
                                                                                                                                                                };
                                                                                                                                                                }
                                                                                                                                                                export async function encerrarSessao(sessionToken) {
                                                                                                                                                                    try {
                                                                                                                                                                            await apiClient.request({ action: "logout", params: { sessionToken } });
                                                                                                                                                                                }
                                                                                                                                                                                    catch {
                                                                                                                                                                                            // Logout é best-effort: se a chamada falhar, a sessão ainda expira
                                                                                                                                                                                                    // sozinha pelo TTL do cache no backend (55min) — não bloquear o
                                                                                                                                                                                                            // usuário na tela por causa disso.
                                                                                                                                                                                                                }
                                                                                                                                                                                                                }
                                                                                                                                                                                                                
