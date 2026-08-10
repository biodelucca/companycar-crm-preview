/**
 * Configuracoes e constantes do backend. Nada de segredo fica hardcoded
 * aqui — o ID da planilha vive no PropertiesService (Configuracoes do
 * projeto no editor do Apps Script), nao no codigo versionado.
 */

function getPlanilhaId_() {
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) {
    throw new Error('PLANILHA_ID nao configurado em PropertiesService.');
  }
  return id;
}

var ABAS = {
  USUARIOS: 'Usuarios',
  ORIGENS: 'Origens',
  ETAPAS: 'Etapas',
  MOTIVOS_PERDA: 'MotivosPerda',
  CLIENTES: 'Clientes',
  OPORTUNIDADES: 'Oportunidades',
  TAREFAS: 'Tarefas',
  TIMELINE: 'Timeline',
  CONFIGURACOES: 'Configuracoes',
  // Sprint 5 (2026-08-04) -- modulo WhatsApp, ver WhatsApp.gs.
  MENSAGENS: 'Mensagens'
};

// Sprint 8 "Performance e Estabilidade" (2026-08-10) — antes, toda chamada
// a getAba_ reabria a planilha inteira via SpreadsheetApp.openById (uma
// chamada de API cara). Um único doGet/doPost costuma chamar getAba_ várias
// vezes (ex: criarOportunidade_ abre 4 abas diferentes numa só requisição)
// -- cada uma reabrindo a mesma planilha do zero. Cacheado num var de
// módulo: a primeira chamada de uma execução abre normalmente, as
// seguintes reaproveitam a mesma referência. Comportamento idêntico, só
// menos chamadas de API por requisição -- nada muda no que é lido/escrito.
var _planilhaCache_ = null;
function getPlanilha_() {
  if (!_planilhaCache_) {
    _planilhaCache_ = SpreadsheetApp.openById(getPlanilhaId_());
  }
  return _planilhaCache_;
}

function getAba_(nomeAba) {
  var aba = getPlanilha_().getSheetByName(nomeAba);
  if (!aba) {
    throw new Error('Aba nao encontrada: ' + nomeAba);
  }
  return aba;
}
