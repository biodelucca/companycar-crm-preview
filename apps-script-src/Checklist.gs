/**
 * Checklist.gs — Ciclo 22 "Funil Comercial -- Bloco 1" (2026-08-12).
 *
 * Substitui o Passo 8 (Sprint 1, Ciclo 4): até aqui o checklist era só em
 * memória do navegador (React), com itens PLACEHOLDER genéricos por tipo
 * de etapa ("ativa"/"ganho") -- nunca persistido, nunca por etapa
 * específica (ver nota histórica em Pipeline.tsx). A partir deste Ciclo,
 * cada uma das 5 etapas ativas abaixo tem sua lista oficial de itens
 * (definida pelo Guilherme em 12/08/2026), o estado marcado/não marcado é
 * real (grava na planilha) e sobrevive a F5/logout.
 *
 * Regra de negócio explícita do CEO para esta V1 (não ampliar sem pedido
 * novo): o checklist SÓ confirma que algo aconteceu -- marcado/não marcado
 * (+ quando, para histórico). Nunca guarda dado (isso mora nos campos da
 * própria Oportunidade) nem "o que fazer depois" (isso é Próxima Ação).
 * Por isso cada item é uma chave estável + um booleano -- nada de campos
 * extras (data de simulação, texto livre, valores) dentro de um item.
 * Nunca bloqueia movimentação de etapa (moverEtapaOportunidade_ nem lê esta
 * aba) e não exige completude nenhuma para a oportunidade avançar.
 *
 * "Venda/Documentação" fica de propósito com lista vazia -- arquitetura
 * pronta para receber os itens dessa etapa quando o Guilherme definir
 * (pedido explícito: "não definir agora").
 */

// Lista oficial dos itens de checklist por etapa (nome da etapa -> itens).
// Cada item tem uma `chave` estável, própria daquela etapa (o mesmo texto
// pode se repetir em etapas diferentes -- ex: "Veículo definido" existe em
// Cotação E em Negociação Final -- por isso a chave já vem prefixada pela
// etapa e as duas nunca colidem). NUNCA renomear/reordenar uma `chave` já
// publicada: isso "perderia" o vínculo com respostas já gravadas na aba
// ChecklistRespostas. Para corrigir só o texto exibido, mude `texto`
// mantendo a `chave` como está.
var CHECKLIST_ITENS_POR_ETAPA_ = {
  'Tentativa de Contato': [
    { chave: 'tentativa_de_contato:primeiro_contato_realizado', texto: 'Primeiro contato realizado' },
    { chave: 'tentativa_de_contato:d1', texto: 'D+1' },
    { chave: 'tentativa_de_contato:d2', texto: 'D+2' },
    { chave: 'tentativa_de_contato:d3', texto: 'D+3' },
    { chave: 'tentativa_de_contato:d7', texto: 'D+7' },
    { chave: 'tentativa_de_contato:d30', texto: 'D+30' },
    { chave: 'tentativa_de_contato:contato_estabelecido', texto: 'Contato estabelecido' }
  ],
  'Pré-qualificação': [
    { chave: 'pre_qualificacao:interesse_identificado', texto: 'Interesse identificado' },
    { chave: 'pre_qualificacao:necessidade_compreendida', texto: 'Necessidade compreendida' },
    { chave: 'pre_qualificacao:momento_compra_identificado', texto: 'Momento de compra identificado' },
    { chave: 'pre_qualificacao:forma_pagamento_identificada', texto: 'Forma de pagamento identificada' },
    { chave: 'pre_qualificacao:troca_identificada', texto: 'Troca identificada' },
    { chave: 'pre_qualificacao:proximo_passo_definido', texto: 'Próximo passo definido' }
  ],
  'Cotação': [
    { chave: 'cotacao:veiculo_definido', texto: 'Veículo definido' },
    { chave: 'cotacao:forma_pagamento_confirmada', texto: 'Forma de pagamento confirmada' },
    { chave: 'cotacao:simulacao_realizada', texto: 'Simulação realizada, quando aplicável' },
    { chave: 'cotacao:troca_identificada', texto: 'Troca identificada' },
    { chave: 'cotacao:condicao_apresentada', texto: 'Condição apresentada ao cliente' },
    { chave: 'cotacao:retorno_cotacao_realizado', texto: 'Retorno da cotação realizado' },
    { chave: 'cotacao:proximo_passo_definido', texto: 'Próximo passo definido' }
  ],
  'Visita Agendada': [
    { chave: 'visita_agendada:visita_agendada', texto: 'Visita agendada' },
    { chave: 'visita_agendada:data_horario_definidos', texto: 'Data e horário definidos' },
    { chave: 'visita_agendada:cliente_confirmado', texto: 'Cliente confirmado' },
    { chave: 'visita_agendada:closer_responsavel_definido', texto: 'Closer responsável definido' },
    { chave: 'visita_agendada:visita_realizada', texto: 'Visita realizada' },
    { chave: 'visita_agendada:test_drive_realizado', texto: 'Test-drive realizado, quando aplicável' },
    { chave: 'visita_agendada:no_show', texto: 'No-show, quando ocorrer' },
    { chave: 'visita_agendada:proximo_passo_definido', texto: 'Próximo passo definido' }
  ],
  'Negociação Final': [
    { chave: 'negociacao_final:veiculo_definido', texto: 'Veículo definido' },
    { chave: 'negociacao_final:condicao_comercial_apresentada', texto: 'Condição comercial apresentada' },
    { chave: 'negociacao_final:troca_avaliada', texto: 'Troca avaliada, quando aplicável' },
    { chave: 'negociacao_final:financiamento_definido', texto: 'Financiamento definido, quando aplicável' },
    { chave: 'negociacao_final:objecao_principal_identificada', texto: 'Objeção principal identificada' },
    { chave: 'negociacao_final:proposta_condicao_final_apresentada', texto: 'Proposta/condição final apresentada' },
    { chave: 'negociacao_final:retorno_realizado', texto: 'Retorno realizado' },
    { chave: 'negociacao_final:decisao_cliente_obtida', texto: 'Decisão do cliente obtida' },
    { chave: 'negociacao_final:proximo_passo_definido', texto: 'Próximo passo definido' }
  ],
  // Deliberadamente vazio -- ver nota no topo do arquivo.
  'Venda/Documentação': []
};

function listChecklistItensPorEtapaNome_(nomeEtapa) {
  return CHECKLIST_ITENS_POR_ETAPA_[nomeEtapa] || [];
}

// Migração de schema (Ciclo 22) -- cria a aba ChecklistRespostas se ela
// ainda não existir, com o cabeçalho já correto. Idempotente: se a aba já
// existe (por qualquer motivo, inclusive uma execução anterior desta mesma
// função), não faz nada -- nunca apaga nem recria uma aba existente, então
// rodar de novo por engano não tem efeito colateral. Segue a mesma regra do
// Ciclo 19: nenhuma aba/coluna é criada manualmente pela UI do Sheets, só
// por função de migração versionada como esta. Não é chamada por nenhuma
// action do Roteador -- executada uma única vez via URL de teste do Apps
// Script antes da publicação deste Ciclo.
function configurarAbaChecklistRespostas_() {
  var planilha = getPlanilha_();
  var aba = planilha.getSheetByName(ABAS.CHECKLIST_RESPOSTAS);
  var cabecalhoEsperado = ['id', 'oportunidade_id', 'item_chave', 'marcado', 'marcado_em', 'marcado_por', 'atualizado_em'];
  if (aba) {
    return { acao: 'nenhuma', motivo: 'aba ' + ABAS.CHECKLIST_RESPOSTAS + ' ja existe -- nada a fazer.' };
  }
  aba = planilha.insertSheet(ABAS.CHECKLIST_RESPOSTAS);
  aba.getRange(1, 1, 1, cabecalhoEsperado.length).setValues([cabecalhoEsperado]);
  return { acao: 'criada', cabecalho: cabecalhoEsperado };
}

// Monta a lista de itens da etapa ATUAL da oportunidade já combinada com o
// estado gravado (marcado/marcadoEm) -- usada tanto pela leitura
// (obterChecklist_, com checagem de visibilidade) quanto pela escrita
// (marcarItemChecklist_, que já validou o acesso implicitamente ao achar a
// própria linha da oportunidade -- mesmo padrão de todo endpoint de
// escrita hoje, nenhum deles restringe por papel, ver hotfix "Visibilidade
// por Usuário", Ciclo 21, escopo deliberado).
function montarChecklistDaOportunidade_(oportunidadeEncontrada) {
  var colEtapa = oportunidadeEncontrada.cabecalho.indexOf('etapa_id');
  var colId = oportunidadeEncontrada.cabecalho.indexOf('id');
  var etapaId = oportunidadeEncontrada.linhaValores[colEtapa];
  var oportunidadeId = oportunidadeEncontrada.linhaValores[colId];
  var etapa = obterEtapaPorId_(etapaId);
  var itens = etapa ? listChecklistItensPorEtapaNome_(etapa.nome) : [];

  var respostas = lerAbaComoObjetos_(ABAS.CHECKLIST_RESPOSTAS)
    .filter(function (r) { return String(r.oportunidade_id) === String(oportunidadeId); });
  var respostaPorChave = {};
  respostas.forEach(function (r) { respostaPorChave[r.item_chave] = r; });

  return itens.map(function (item) {
    var r = respostaPorChave[item.chave];
    var marcado = !!r && (r.marcado === true || r.marcado === 'TRUE' || r.marcado === 'true');
    return {
      chave: item.chave,
      texto: item.texto,
      marcado: marcado,
      marcadoEm: marcado && r.marcado_em ? r.marcado_em : null
    };
  });
}

// Leitura -- mesma regra de visibilidade de obterAnotacao_ (Oportunidades.gs):
// Gerente/Administrador leem o checklist de qualquer oportunidade; SDR/
// Closer só da própria carteira. "Oportunidade nao encontrada" tanto para
// id inexistente quanto para id de terceiro -- não dá pra descobrir ids
// alheios por tentativa e erro (mesma decisão do Ciclo 21).
function obterChecklist_(oportunidadeId, usuarioAutenticado) {
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  if (!usuarioAutenticado) {
    throw new Error('obterChecklist_ requer usuarioAutenticado (contexto de sessao) por seguranca.');
  }
  var abaOp = getAba_(ABAS.OPORTUNIDADES);
  var encontrada = encontrarLinhaOportunidade_(abaOp, oportunidadeId);
  if (!encontrada) {
    throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
  }
  if (!usuarioTemVisaoCompleta_(usuarioAutenticado)) {
    var colResponsavel = encontrada.cabecalho.indexOf('responsavel_id');
    var responsavelDaOportunidade = colResponsavel !== -1 ? encontrada.linhaValores[colResponsavel] : null;
    if (String(responsavelDaOportunidade) !== String(usuarioAutenticado.id)) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
  }
  return montarChecklistDaOportunidade_(encontrada);
}

// Marca/desmarca um item -- upsert na aba ChecklistRespostas (uma linha por
// oportunidade+item). Valida que a chave pertence à lista oficial da etapa
// ATUAL da oportunidade antes de gravar (evita lixo vindo de um bug de
// frontend ou de uma chave de outra etapa). Desmarcar NÃO loga evento na
// Timeline -- mesmo racional já registrado desde a Sprint 1 para o
// checklist ("evita ruído"); marcar loga. `marcado_em`/`marcado_por` são
// limpos ao desmarcar (histórico é "quando foi marcado da última vez", não
// um log de idas e vindas -- consistente com a V1 simples pedida).
function marcarItemChecklist_(oportunidadeId, itemChave, marcado, usuarioId) {
  if (!oportunidadeId || !itemChave) {
    throw new Error('oportunidadeId e itemChave sao obrigatorios.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var abaOp = getAba_(ABAS.OPORTUNIDADES);
    var encontradaOp = encontrarLinhaOportunidade_(abaOp, oportunidadeId);
    if (!encontradaOp) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var colEtapa = encontradaOp.cabecalho.indexOf('etapa_id');
    var etapa = obterEtapaPorId_(encontradaOp.linhaValores[colEtapa]);
    var itensValidos = etapa ? listChecklistItensPorEtapaNome_(etapa.nome) : [];
    var itemAlvo = null;
    itensValidos.forEach(function (i) { if (i.chave === itemChave) itemAlvo = i; });
    if (!itemAlvo) {
      throw new Error('Item de checklist invalido para a etapa atual (' + (etapa ? etapa.nome : '?') + '): ' + itemChave);
    }

    var aba = getAba_(ABAS.CHECKLIST_RESPOSTAS);
    var valores = aba.getDataRange().getValues();
    var cabecalho = valores[0];
    var colOportunidade = cabecalho.indexOf('oportunidade_id');
    var colItemChave = cabecalho.indexOf('item_chave');
    var linhaExistente = -1;
    for (var i = 1; i < valores.length; i++) {
      if (String(valores[i][colOportunidade]) === String(oportunidadeId) && valores[i][colItemChave] === itemChave) {
        linhaExistente = i + 1;
        break;
      }
    }

    var agora = new Date().toISOString();
    var marcadoBool = !!marcado;
    var camposNovos = {
      oportunidade_id: oportunidadeId,
      item_chave: itemChave,
      marcado: marcadoBool,
      marcado_em: marcadoBool ? agora : '',
      marcado_por: marcadoBool ? (usuarioId || '') : '',
      atualizado_em: agora
    };

    if (linhaExistente === -1) {
      var linhaCompleta = { id: Utilities.getUuid() };
      Object.keys(camposNovos).forEach(function (k) { linhaCompleta[k] = camposNovos[k]; });
      adicionarLinhaPorCabecalho_(aba, linhaCompleta);
    } else {
      gravarCamposLinha_(aba, linhaExistente, cabecalho, valores[linhaExistente - 1], camposNovos);
    }

    if (marcadoBool) {
      registrarEventoTimeline_(oportunidadeId, 'checklist', 'Item do checklist concluido: "' + itemAlvo.texto + '"', usuarioId);
    }

    return montarChecklistDaOportunidade_(encontradaOp);
  } finally {
    lock.releaseLock();
  }
}
