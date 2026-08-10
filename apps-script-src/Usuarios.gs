/**
 * Regras da entidade Usuario. Sprint 3 (integracao com a planilha): apenas
 * leitura — usado para o painel lateral (responsavel pela oportunidade).
 */

// Sprint 8 "Performance e Estabilidade" (2026-08-10): cacheada (5min, ver
// lerAbaComoObjetosCacheada_ em Utils.gs) -- tabela pequena, lida em quase
// toda requisição (validação de responsável/ator em praticamente todo
// endpoint de escrita), sem nenhuma ação do app que a modifique.
function listUsuarios_() {
  return lerAbaComoObjetosCacheada_(ABAS.USUARIOS);
}
