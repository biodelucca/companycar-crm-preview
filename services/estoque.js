import { apiClient } from "./apiClient.js";
// Camada de Services para o Estoque do Simples Veículo. Sprint 3
// "Integração com Estoque do Simples" (2026-08-03).
//
// Arquitetura (aprovada pelo CEO): Feed do Simples -> Apps Script
// (Estoque.gs, faz o fetch/parse/cache) -> este service, isolado -> CRM. O
// frontend NUNCA consulta o feed diretamente nem conhece a URL dele (fica
// só em PropertiesService no backend) — só fala com o endpoint padronizado
// listEstoque. Isso é o que permite trocar a fonte de estoque no futuro
// sem tocar em nenhum componente do CRM: só este arquivo mudaria.
//
// Sem branch de mock: diferente de oportunidades.ts, o estoque não tem
// dados fictícios úteis para desenvolvimento (a analise de campos do XML
// real foi o próprio trabalho da Etapa 1 desta Sprint) — sempre usa o
// backend real.
//
// BUG corrigido em 2026-08-04 (achado ao investigar "estoque não
// acessível" reportado pelo Guilherme em produção): listEstoque e
// associarVeiculoEstoque não enviavam idToken — correto até a Sprint 4,
// quando as duas ações estavam em ACOES_SEM_SESSAO/ACOES_POST_SEM_SESSAO
// (Roteador.gs) e não exigiam sessão. A Sprint 4 ("exigirSessaoValida_ em
// todos os endpoints, leitura e escrita") trancou as duas junto com todo
// o resto, mas este arquivo nunca foi atualizado para acompanhar —
// listEstoque passou a falhar sempre com SESSAO_EXPIRADA (nenhum
// sessionToken chegava ao backend), silenciosamente absorvido pelo
// catch-all do painel lateral como "Não foi possível consultar o estoque
// agora." Corrigido replicando o mesmo padrão já usado em
// oportunidades.ts (idToken como parâmetro explícito, propagado pelo
// chamador via useAuth) — nenhuma mudança de comportamento além de voltar
// a funcionar.
function textoOuNulo(valor) {
    if (valor === null || valor === undefined || valor === "")
        return null;
    return String(valor);
}
function numeroOuNulo(valor) {
    if (valor === null || valor === undefined || valor === "")
        return null;
    const n = Number(valor);
    return Number.isNaN(n) ? null : n;
}
function mapVeiculoEstoque(raw) {
    return {
        id: String(raw.id),
        marca: textoOuNulo(raw.marca),
        modeloVersao: textoOuNulo(raw.modeloVersao),
        ano: textoOuNulo(raw.ano),
        km: numeroOuNulo(raw.km),
        // Decisão do CEO (2026-08-03): preço zerado/ausente vira null aqui —
        // o painel exibe "sem preço informado" em vez de "R$ 0,00".
        preco: (() => {
            const n = numeroOuNulo(raw.preco);
            return n !== null && n > 0 ? n : null;
        })(),
        status: "disponivel",
        imagemPrincipal: textoOuNulo(raw.imagemPrincipal),
        urlAnuncio: textoOuNulo(raw.urlAnuncio),
    };
}
// Lista os veículos disponíveis no estoque (cache de 15-30min no Apps
// Script — ver ESTOQUE_CACHE_SEGUNDOS em Estoque.gs). Sem paginação: 54
// itens no feed real na análise da Etapa 1, volume pequeno o bastante para
// a busca acontecer no cliente (ver buscarVeiculosEstoque abaixo).
//
// idToken obrigatório desde a Sprint 4 (exigirSessaoValida_ em todos os
// endpoints) — ver nota de correção no topo deste arquivo.
export async function listEstoque(idToken) {
    const raw = await apiClient.request({ action: "listEstoque", idToken });
    return raw.map(mapVeiculoEstoque);
}
// Busca por texto em marca/modeloVersao/ano — aprovada pelo CEO para o MVP
// (2026-08-03). Client-side porque a lista inteira já está carregada
// (listEstoque) e o volume é pequeno; sem acentuação/normalização
// especial, só lowercase simples.
export function buscarVeiculosEstoque(veiculos, termo) {
    const alvo = termo.trim().toLowerCase();
    if (!alvo)
        return veiculos;
    return veiculos.filter((v) => {
        const campos = [v.marca, v.modeloVersao, v.ano].filter(Boolean).join(" ").toLowerCase();
        return campos.includes(alvo);
    });
}
// Associa um veículo do estoque a uma oportunidade (associarVeiculoEstoque_
// em Oportunidades.gs) — grava o snapshot na própria linha da oportunidade
// e preenche veiculo_interesse. idToken obrigatório desde a Sprint 4 (ver
// nota de correção no topo deste arquivo) — mesmo padrão já usado por
// moverEtapaOportunidade/transferirOportunidade em oportunidades.ts
// (idToken como parâmetro separado do corpo de domínio).
export async function associarVeiculoEstoque(dados, idToken) {
    const raw = await apiClient.request({
        action: "associarVeiculoEstoque",
        body: {
            oportunidadeId: dados.oportunidadeId,
            veiculoEstoqueId: dados.veiculoEstoqueId,
            usuarioId: dados.usuarioId,
        },
        idToken: idToken ?? undefined,
    });
    return {
        veiculoInteresse: raw.veiculoInteresse,
        veiculoEstoque: mapVeiculoEstoque(raw.veiculoEstoque),
    };
}
