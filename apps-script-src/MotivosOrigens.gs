/**
 * Motivos de Perda e Origens — listas oficiais definidas pelo Guilherme na
 * Sprint 1 (2026-08-03), substituindo os placeholders anteriores (aba
 * MotivosPerda estava vazia; Origens tinha 6 valores fictícios). Seed real
 * das 14/17 linhas oficiais feito uma única vez via script utilitário
 * (não versionado — rodado direto no editor do Apps Script, ver diretriz
 * técnica). Estas funções são só leitura, mesmo padrão de listUsuarios_.
 */

// Sprint 8 "Performance e Estabilidade" (2026-08-10): ambas cacheadas
// (5min, ver lerAbaComoObjetosCacheada_ em Utils.gs) -- tabelas pequenas e
// raramente alteradas (só por edição manual pontual na planilha), lidas
// em quase toda requisição de leitura e por vários endpoints de escrita
// internamente (ex: criarOportunidade_, editarDadosOportunidade_).
function listMotivosPerda_() {
  return lerAbaComoObjetosCacheada_(ABAS.MOTIVOS_PERDA);
}

function listOrigens_() {
  return lerAbaComoObjetosCacheada_(ABAS.ORIGENS);
}

function obterMotivoPerdaPorId_(motivoPerdaId) {
  var motivos = listMotivosPerda_();
  for (var i = 0; i < motivos.length; i++) {
    if (String(motivos[i].id) === String(motivoPerdaId)) return motivos[i];
  }
  return null;
}
