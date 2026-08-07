// Sprint 6 "Operação do dia a dia" (2026-08-07) — item 7 "Nome do
// usuário": o cadastro oficial guarda o nome completo (ex: "Guilherme dos
// Santos De Lucca" — aba Usuarios da planilha), mas exibir isso toda vez
// que o CRM se dirige à própria pessoa logada (saudação do Dashboard,
// cabeçalho) é desnecessariamente formal e ocupa espaço. Este helper só
// afeta EXIBIÇÃO — não altera o cadastro em si (Usuarios.gs/planilha
// continuam com o nome completo).
//
// Importante: isto é só para quando o CRM se refere ao USUÁRIO LOGADO
// sobre si mesmo. Nomes de OUTRAS pessoas em textos de auditoria/histórico
// (ex: "Fulano moveu de X para Y" no Timeline, "Transferida para Fulano")
// devem continuar com o nome completo, como já gravado pelo backend —
// não usar este helper nesses casos (ver comentário em Pipeline.tsx).
export function primeiroNome(nomeCompleto) {
    if (!nomeCompleto)
        return "";
    const primeiro = nomeCompleto.trim().split(/\s+/)[0];
    return primeiro || nomeCompleto;
}
