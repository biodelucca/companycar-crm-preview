import { apiClient } from "./apiClient.js";
import { mockClientes, mockEtapas, mockOportunidades, mockUsuarios } from "../mocks/data.js";
// Camada de Services para a entidade Oportunidade/Pipeline.
// Passo 3 do roadmap (2026-08-02): dados reais via Apps Script/Sheets.
//
// Sprint 1 "Operação Comercial" (2026-08-03): USE_MOCK de dados passa a
// ser ligado como "false" no build publicado (ver BUILD_USE_MOCK_DATA em
// scripts/build-cdn.cjs) — o Pipeline passa a usar dados reais da
// planilha (Oportunidades, Etapas, Clientes, Usuarios), pré-condição para
// a persistência de mover etapa/transferência fazer sentido de ponta a
// ponta na UI (ver decisão de sessão registrada em Roteador.gs). Também
// entram as duas primeiras escritas reais desta entidade:
// moverEtapaOportunidade e transferirOportunidade, e as listas oficiais
// de MotivosPerda/Origens (antes placeholders) e a leitura da Timeline
// persistida.
//
// MOCK: enquanto VITE_USE_MOCK_DATA=true, os dados vêm de src/mocks/data.ts
// em vez do Apps Script. Flag separada da de autenticação (VITE_USE_MOCK_AUTH,
// ver contexts/AuthContext.tsx) desde o Passo 3 — dados reais podem ligar
// antes da autenticação real existir (Passo 4, ainda pausado). O resto da
// aplicação (componentes, tipos) não muda quando isso for trocado: só a
// implementação aqui dentro.
const USE_MOCK = "false" === "true";
function comAtraso(valor, ms = 250) {
    return new Promise((resolve) => setTimeout(() => resolve(valor), ms));
}
// --- Adaptação Sheets -> domínio -------------------------------------
//
// A planilha (fonte de verdade do schema, ver "Modelo de dados" na diretriz
// técnica) usa cabeçalhos em snake_case (cliente_id, proxima_acao, ...) e
// células de ID puramente numéricas viram Number no Apps Script. Os tipos
// do frontend (src/types) usam camelCase e id como string — convenção já
// usada nos mocks e nos componentes. Esta é a camada de tradução entre o
// contrato real da API e o domínio da aplicação (arquitetura: "frontend
// nunca acessa a planilha diretamente, tudo passa pela camada de
// Services") — trocar Sheets por outro banco no futuro não deve exigir
// mudar nada fora deste arquivo.
//
// Decisão do CPO (2026-08-02): a coluna "veiculo_troca" na planilha real
// fica como texto livre (ex: "Gol 2015, 80000km, ABC1234") — sem parsing
// para o objeto estruturado {modelo, ano, km, placa}. O texto é exposto
// como Oportunidade.veiculoTrocaDescricao; campos estruturados entram só
// quando ficar definido o que a pré-qualificação/cotação exigem.
function textoOuIndefinido(valor) {
    if (valor === null || valor === undefined || valor === "")
        return undefined;
    return String(valor);
}
function numeroOuIndefinido(valor) {
    if (valor === null || valor === undefined || valor === "")
        return undefined;
    const n = Number(valor);
    return Number.isNaN(n) ? undefined : n;
}
function mapEtapa(raw) {
    return {
        id: String(raw.id),
        nome: raw.nome,
        ordem: Number(raw.ordem),
        tipo: raw.tipo,
    };
}
function mapCliente(raw) {
    return {
        id: String(raw.id),
        nome: raw.nome,
        telefone: String(raw.telefone ?? ""),
        email: raw.email,
        cidade: raw.cidade,
        criadoEm: raw.criado_em,
        atualizadoEm: raw.atualizado_em,
    };
}
function mapUsuario(raw) {
    return {
        id: String(raw.id),
        nome: raw.nome,
        email: raw.email,
        papel: raw.papel,
        ativo: Boolean(raw.ativo),
        criadoEm: raw.criado_em,
        // Sprint 5 "Refinamento de UX — Conversas" (2026-08-04): ver nota em
        // types/index.ts — o backend já devolvia essa coluna, só faltava mapear.
        nomeExibicaoWhatsapp: textoOuIndefinido(raw.nome_exibicao_whatsapp),
    };
}
// Sprint 1 — listas oficiais (id numérico da planilha vira string, mesma
// convenção usada em todo o resto desta camada).
function mapMotivoPerda(raw) {
    return {
        id: String(raw.id),
        nome: raw.nome,
        ativo: Boolean(raw.ativo),
    };
}
function mapOrigem(raw) {
    return {
        id: String(raw.id),
        nome: raw.nome,
        tipo: raw.tipo,
        ativo: Boolean(raw.ativo),
    };
}
function mapTimelineEvento(raw) {
    return {
        id: String(raw.id),
        oportunidadeId: String(raw.oportunidade_id),
        tipoEvento: raw.tipo_evento,
        descricao: raw.descricao,
        usuarioId: raw.usuario_id !== undefined && raw.usuario_id !== null ? String(raw.usuario_id) : "",
        dataHora: raw.data_hora,
    };
}
function mapOportunidade(raw) {
    return {
        id: String(raw.id),
        clienteId: String(raw.cliente_id),
        etapaId: String(raw.etapa_id),
        responsavelId: String(raw.responsavel_id),
        proximaAcao: raw.proxima_acao,
        proximaAcaoData: textoOuIndefinido(raw.proxima_acao_data) ?? null,
        veiculoInteresse: raw.veiculo_interesse,
        // ver nota acima — veiculo_troca real é texto livre, exposto em
        // veiculoTrocaDescricao (decisão do CPO, 2026-08-02).
        veiculoTroca: undefined,
        veiculoTrocaDescricao: textoOuIndefinido(raw.veiculo_troca),
        origemId: String(raw.origem_id),
        condicaoComercial: textoOuIndefinido(raw.condicao_comercial),
        valorProposto: numeroOuIndefinido(raw.valor_proposto),
        criadoEm: raw.criado_em,
        atualizadoEm: raw.atualizado_em,
        etapaOrigemPerdaId: textoOuIndefinido(raw.etapa_origem_perda_id),
        motivoPerdaId: textoOuIndefinido(raw.motivo_perda_id),
        perdidoEm: textoOuIndefinido(raw.perdido_em),
        perdidoPor: textoOuIndefinido(raw.perdido_por),
        motivoPerdaDescricaoOutro: textoOuIndefinido(raw.motivo_perda_descricao_outro),
        // Sprint 3 "Integração com Estoque do Simples" (2026-08-03) — snapshot
        // gravado por associarVeiculoEstoque_ (ver services/estoque.ts para o
        // porquê de existir um snapshot em vez de só o id).
        veiculoEstoqueId: textoOuIndefinido(raw.veiculo_estoque_id),
        veiculoEstoqueMarca: textoOuIndefinido(raw.veiculo_estoque_marca),
        veiculoEstoqueModeloVersao: textoOuIndefinido(raw.veiculo_estoque_modelo_versao),
        veiculoEstoqueAno: textoOuIndefinido(raw.veiculo_estoque_ano),
        veiculoEstoqueKm: numeroOuIndefinido(raw.veiculo_estoque_km),
        veiculoEstoquePreco: numeroOuIndefinido(raw.veiculo_estoque_preco),
        veiculoEstoqueImagem: textoOuIndefinido(raw.veiculo_estoque_imagem),
        veiculoEstoqueAssociadoEm: textoOuIndefinido(raw.veiculo_estoque_associado_em),
    };
}
// --- Services ----------------------------------------------------------
export async function listOportunidades(idToken) {
    if (USE_MOCK)
        return comAtraso(mockOportunidades);
    const raw = await apiClient.request({ action: "listOportunidades", idToken });
    return raw.map(mapOportunidade);
}
export async function listEtapas(idToken) {
    if (USE_MOCK)
        return comAtraso(mockEtapas);
    const raw = await apiClient.request({ action: "listEtapas", idToken });
    return raw.map(mapEtapa);
}
export async function listClientes(idToken) {
    if (USE_MOCK)
        return comAtraso(mockClientes);
    const raw = await apiClient.request({ action: "listClientes", idToken });
    return raw.map(mapCliente);
}
export async function listUsuarios(idToken) {
    if (USE_MOCK)
        return comAtraso(mockUsuarios);
    const raw = await apiClient.request({ action: "listUsuarios", idToken });
    return raw.map(mapUsuario);
}
// Sprint 1 — listas oficiais de Motivos de Perda (14 itens) e Origens (17
// itens), substituindo os placeholders anteriores. Sem branch de mock
// "cheio" (o antigo mockMotivosPerda era só um dict id->nome com 2 itens
// fictícios) — como USE_MOCK está false no build publicado, o caminho
// real é o que importa; em ambiente de dev com mock ligado, ambas
// retornam lista vazia em vez de dados inventados.
export async function listMotivosPerda(idToken) {
    if (USE_MOCK)
        return comAtraso([]);
    const raw = await apiClient.request({ action: "listMotivosPerda", idToken });
    return raw.map(mapMotivoPerda);
}
export async function listOrigens(idToken) {
    if (USE_MOCK)
        return comAtraso([]);
    const raw = await apiClient.request({ action: "listOrigens", idToken });
    return raw.map(mapOrigem);
}
// Timeline persistida (Timeline.gs) — por ora só eventos de mudança de
// etapa e transferência são gravados de verdade (ver Oportunidades.gs);
// próxima ação e checklist continuam só em memória (fora do escopo desta
// Sprint).
export async function listTimeline(idToken) {
    if (USE_MOCK)
        return comAtraso([]);
    const raw = await apiClient.request({ action: "listTimeline", idToken });
    return raw.map(mapTimelineEvento);
}
export async function moverEtapaOportunidade(dados, idToken) {
    await apiClient.request({
        action: "moverEtapaOportunidade",
        body: {
            oportunidadeId: dados.oportunidadeId,
            novaEtapaId: dados.novaEtapaId,
            motivoPerdaId: dados.motivoPerdaId,
            motivoPerdaOutroTexto: dados.motivoPerdaOutroTexto,
            usuarioId: dados.usuarioId,
        },
        idToken: idToken ?? undefined,
    });
}
export async function transferirOportunidade(dados, idToken) {
    await apiClient.request({
        action: "transferirOportunidade",
        body: {
            oportunidadeId: dados.oportunidadeId,
            novoResponsavelId: dados.novoResponsavelId,
            usuarioId: dados.usuarioId,
        },
        idToken: idToken ?? undefined,
    });
}
export async function criarOportunidade(dados, idToken) {
    const raw = await apiClient.request({
        action: "criarOportunidade",
        body: {
            nome: dados.nome,
            telefone: dados.telefone,
            origemId: dados.origemId,
            responsavelId: dados.responsavelId,
            cidade: dados.cidade,
            veiculoInteresse: dados.veiculoInteresse,
            anotacoesIniciais: dados.anotacoesIniciais,
            proximaAcao: dados.proximaAcao,
            proximaAcaoData: dados.proximaAcaoData,
            usuarioId: dados.usuarioId,
        },
        idToken: idToken ?? undefined,
    });
    return {
        oportunidade: mapOportunidade(raw.oportunidade),
        cliente: mapCliente(raw.cliente),
    };
}
