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
// Sem idToken: "listEstoque" está em ACOES_SEM_SESSAO (Roteador.gs) — mesma
// decisão de segurança já usada em Anotações (ver services/anotacoes.ts,
// que segue o mesmo padrão de não enviar idToken para ações sem sessão).
export async function listEstoque() {
    const raw = await apiClient.request({ action: "listEstoque" });
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
// e preenche veiculo_interesse. Mesma decisão de segurança "sem sessão" já
// usada nos demais endpoints de escrita desde o Ciclo 5 (ver comentário no
// topo de Roteador.gs) — sem idToken, mesmo padrão de Anotações.
export async function associarVeiculoEstoque(dados) {
    const raw = await apiClient.request({
        action: "associarVeiculoEstoque",
        body: {
            oportunidadeId: dados.oportunidadeId,
            veiculoEstoqueId: dados.veiculoEstoqueId,
            usuarioId: dados.usuarioId,
        },
    });
    return {
        veiculoInteresse: raw.veiculoInteresse,
        veiculoEstoque: mapVeiculoEstoque(raw.veiculoEstoque),
    };
}
