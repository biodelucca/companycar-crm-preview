import { apiClient } from "./apiClient.js";
// Anotações da oportunidade — campo único de texto livre, sem
// versionamento, sem histórico, sem comentários separados. Adicionado a
// pedido do CEO em 2026-08-02/03, ANTES da persistência das funções dos
// Passos 5-8 (mover etapa, próxima ação, checklist — ver Pipeline.tsx),
// que por ora continuam só em memória.
//
// Diferença importante em relação ao resto do app: este service SEMPRE
// fala com o backend real (Apps Script/Sheets), mesmo com
// VITE_USE_MOCK_DATA=true — foi pedido explicitamente que o conteúdo
// "seja salvo no Google Sheets e recuperado ao abrir o card", não que
// fique em memória como o restante. Por isso não existe um branch mock
// aqui como em services/oportunidades.ts. Isso exige que
// VITE_APPS_SCRIPT_URL esteja configurada no build mesmo enquanto o
// resto dos dados estiver mockado.
//
// Decisão de segurança (aprovada explicitamente pelo Guilherme em
// 2026-08-02/03, não decisão unilateral do CTO): como a autenticação
// Google está pausada, o backend NÃO exige sessão válida para estas duas
// ações (ver ACOES_SEM_SESSAO/ACOES_POST_SEM_SESSAO em Roteador.gs, e o
// comentário completo em Oportunidades.gs). Isso significa que qualquer
// requisição para a URL pública do Web App consegue ler ou sobrescrever
// a anotação de qualquer oportunidade enquanto o login ficar pausado —
// risco aceito conscientemente pelo CEO, reavaliar quando a autenticação
// for retomada.
export async function obterAnotacao(oportunidadeId) {
    const resposta = await apiClient.request({
        action: "obterAnotacao",
        params: { oportunidadeId },
    });
    return resposta.anotacoes ?? "";
}
export async function salvarAnotacao(oportunidadeId, anotacoes) {
    const resposta = await apiClient.request({
        action: "salvarAnotacao",
        body: { oportunidadeId, anotacoes },
    });
    return resposta.anotacoes ?? "";
}
