/**
 * Helpers genericos: leitura de aba como lista de objetos (pelo cabecalho
 * da primeira linha) e envelope padrao de resposta {success, data, error}.
 */

function lerAbaComoObjetos_(nomeAba) {
  var aba = getAba_(nomeAba);
  var valores = aba.getDataRange().getValues();
  if (valores.length === 0) return [];

  var cabecalho = valores[0];
  var linhas = valores.slice(1);

  return linhas
    .filter(function (linha) {
      return linha.some(function (v) { return v !== '' && v !== null; });
    })
    .map(function (linha) {
      var obj = {};
      cabecalho.forEach(function (chave, i) {
        obj[chave] = linha[i];
      });
      return obj;
    });
}

// Sprint 8 "Performance e Estabilidade" (2026-08-10) — Etapas/Origens/
// MotivosPerda/Usuarios são tabelas de referência pequenas e raramente
// alteradas (Etapas nunca muda pelo app; Origens/MotivosPerda só crescem
// por edição direta e pontual na planilha, ex: "Indicação" no Ciclo 18;
// Usuarios só muda quando alguém entra/sai do time), mas eram lidas do
// zero em quase toda requisição -- inclusive várias vezes dentro da MESMA
// requisição, já que várias funções de escrita consultam Usuarios/Etapas/
// Origens internamente (ex: criarOportunidade_ lê Origens, Usuarios e
// Etapas). CacheService (5min) resolve isso sem exigir nenhuma
// invalidação manual: nenhuma ação do app escreve nessas 4 abas, então um
// TTL curto já garante que uma edição manual pontual apareça em minutos,
// sem risco de servir dado desatualizado por muito tempo.
var TTL_CACHE_REFERENCIA_SEGUNDOS = 300;

function lerAbaComoObjetosCacheada_(nomeAba) {
  var cache = CacheService.getScriptCache();
  var chave = 'aba_' + nomeAba;
  var cacheado = cache.get(chave);
  if (cacheado) {
    try {
      return JSON.parse(cacheado);
    } catch (erroParse) {
      // Cache corrompido/formato inesperado -- ignora e recalcula abaixo,
      // nunca deixa isso quebrar a leitura.
    }
  }
  var dados = lerAbaComoObjetos_(nomeAba);
  try {
    cache.put(chave, JSON.stringify(dados), TTL_CACHE_REFERENCIA_SEGUNDOS);
  } catch (erroCache) {
    // CacheService tem limite de 100KB por chave -- se a aba um dia
    // crescer além disso, segue sem cache em vez de quebrar a leitura.
  }
  return dados;
}

// Sprint 8 "Performance e Estabilidade" (2026-08-10) — grava vários campos
// de UMA linha de uma vez (uma única chamada setValues) e devolve o
// objeto já atualizado, sem reler a aba inteira depois de escrever.
// `linhaValores` é o array de valores atuais da linha (mesmo formato de
// aba.getRange(linha,1,1,cabecalho.length).getValues()[0] -- já disponível
// via encontrarLinhaOportunidade_, que lê a linha como parte da própria
// busca); `campos` é um objeto {nomeCampo: novoValor} só com os campos que
// de fato mudam. Substitui o padrão anterior de N chamadas setValue (uma
// API call cada) seguidas, em alguns endpoints, de uma releitura completa
// da aba só para montar o objeto de retorno -- mesmo dado gravado e
// devolvido, muito menos chamadas de API por escrita.
function gravarCamposLinha_(aba, linha, cabecalho, linhaValores, campos) {
  var linhaAtualizada = linhaValores.slice();
  Object.keys(campos).forEach(function (nomeCampo) {
    var col = cabecalho.indexOf(nomeCampo);
    if (col !== -1) linhaAtualizada[col] = campos[nomeCampo];
  });
  aba.getRange(linha, 1, 1, cabecalho.length).setValues([linhaAtualizada]);
  var objeto = {};
  cabecalho.forEach(function (chave, i) {
    objeto[chave] = linhaAtualizada[i];
  });
  return objeto;
}

function respostaOk_(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data, error: null }))
    .setMimeType(ContentService.MimeType.JSON);
}

function respostaErro_(mensagem) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, data: null, error: String(mensagem) }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Sprint 3.5 "Nova Negociação" (2026-08-03) — helper genérico para criar uma
// linha nova em qualquer aba sem depender de conhecer a ordem das colunas
// (mesma filosofia de resiliência já usada em encontrarLinhaOportunidade_/
// setarCampo: sempre resolver posição por nome de cabeçalho, nunca por
// índice fixo). `dados` é um objeto { nome_da_coluna: valor }; colunas da
// aba que não aparecem em `dados` viram string vazia na linha nova.
function adicionarLinhaPorCabecalho_(aba, dados) {
  var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var linha = cabecalho.map(function (chave) {
    return Object.prototype.hasOwnProperty.call(dados, chave) ? dados[chave] : '';
  });
  aba.appendRow(linha);
}

// Sprint 3.5 — extraído do padrão já duplicado em
// transferirOportunidade_/associarVeiculoEstoque_ (cada um tinha sua própria
// função local "nomeUsuario"). Novo código usa este helper compartilhado;
// os dois já existentes não foram tocados (fora do escopo desta Sprint).
function nomeUsuarioPorId_(usuarios, id) {
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].id) === String(id)) return usuarios[i].nome;
  }
  return 'Alguem';
}

// Sprint 7 "Próximas Ações" (2026-08-07) — formata uma data/hora vinda do
// <input type="datetime-local"> do frontend ("YYYY-MM-DDTHH:mm") como
// "DD/MM HH:mm" para textos legíveis na Timeline (ver
// atualizarProximaAcao_ em Oportunidades.gs). Se o valor não bater com o
// formato esperado (ex: só data, sem hora, de um registro antigo),
// devolve o valor original sem tentar adivinhar — nunca lança erro aqui,
// é só formatação de texto de log.
function formatarDataHoraCurta_(valor) {
  var s = String(valor || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return s;
  return m[3] + '/' + m[2] + ' ' + m[4] + ':' + m[5];
}
