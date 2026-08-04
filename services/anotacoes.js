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
// Decisão de segurança original (aprovada explicitamente pelo Guilherme em
// 2026-08-02/03, não decisão unilateral do CTO): enquanto a autenticação
// Google esteve pausada, o backend NÃO exigia sessão válida para estas duas
// ações — risco aceito conscientemente pelo CEO, para ser reavaliado quando
// a autenticação fosse retomada.
//
// BUG corrigido em 2026-08-04 (mesma classe do bug de listEstoque/
// associarVeiculoEstoque — ver nota completa em services/estoque.ts,
// encontrado ao investigar "estoque não acessível" e reproduzido também
// aqui via console do navegador): a autenticação foi retomada e a Sprint 4
// ("exigirSessaoValida_ em todos os endpoints, leitura e escrita") revogou
// a isenção de sessão de obterAnotacao/salvarAnotacao junto com todo o
// resto (ACOES_SEM_SESSAO em Roteador.gs hoje só contém "login"), mas este
// arquivo nunca foi atualizado — as Anotações ficaram silenciosamente
// quebradas (SESSAO_EXPIRADA) desde então. Corrigido com o mesmo padrão já
// usado em oportunidades.ts/estoque.ts (idToken como parâmetro explícito).
export async function obterAnotacao(oportunidadeId, idToken) {
    const resposta = await apiClient.request({
        action: "obterAnotacao",
        params: { oportunidadeId },
        idToken,
    });
    return resposta.anotacoes ?? "";
}
export async function salvarAnotacao(oportunidadeId, anotacoes, idToken) {
    const resposta = await apiClient.request({
        action: "salvarAnotacao",
        body: { oportunidadeId, anotacoes },
        idToken: idToken ?? undefined,
    });
    return resposta.anotacoes ?? "";
}
