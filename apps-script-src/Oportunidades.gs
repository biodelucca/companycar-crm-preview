/**
 * Regras da entidade Oportunidade. Sprint 1: apenas leitura.
 */

// Sprint 6 "Operação do dia a dia" (2026-08-07) — item 1 "Excluir
// negociação": exclusão é sempre lógica (soft delete), nunca apaga a linha
// da planilha — mesma filosofia já usada em todo o resto do projeto
// (ex: veiculo_estoque_* nunca é apagado quando o veículo some do feed).
// Preserva o registro para auditoria/histórico e permite reverter
// manualmente na planilha se for excluído por engano; quem lê a lista
// (listOportunidades_) é que filtra o que já foi excluído. Se as colunas
// excluido_em/excluido_por ainda não existirem na planilha (versão antiga
// do schema), o filtro simplesmente não encontra nada marcado e todas as
// linhas continuam aparecendo — mesmo padrão defensivo de coluna opcional
// já usado em setarCampo/veiculo_estoque_*.
function listOportunidades_() {
  var linhas = lerAbaComoObjetos_(ABAS.OPORTUNIDADES);
  return linhas.filter(function (o) { return !o.excluido_em; });
}

// Sprint 7 "Próximas Ações" (2026-08-07) — migração de schema: adiciona as
// colunas novas exigidas por atualizarProximaAcao_ na aba Oportunidades.
// Idempotente — só adiciona uma coluna se ela ainda não existir, então
// rodar de novo por engano não duplica nada. Executada uma única vez,
// temporariamente exposta como action sem sessão no Roteador.gs e chamada
// via URL de teste do Apps Script (menu "Executar" do editor ficou
// destravado nesta sessão e não pôde ser usado). Fica no código depois
// por documentação/idempotência, não é chamada por nenhuma action do
// Roteador (ver Ciclo 19 na diretriz técnica para o histórico completo).
function configurarColunasSprint7_() {
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var novasColunas = ['proxima_acao_tipo', 'proxima_acao_outro_texto', 'proxima_acao_responsavel_id'];
  novasColunas.forEach(function (nome) {
    if (cabecalho.indexOf(nome) === -1) {
      var novaCol = aba.getLastColumn() + 1;
      aba.getRange(1, novaCol).setValue(nome);
      cabecalho.push(nome);
    }
  });
  return cabecalho;
}

// Sprint 7 "Próximas Ações" (2026-08-07) — migração corretiva: uma edição
// manual pela UI do Google Sheets (tentando adicionar as 3 colunas acima
// célula a célula, antes de configurarColunasSprint7_ existir) sobrescreveu
// o cabeçalho "data_inicio_negociacao" (coluna da Sprint 6) com
// "proxima_acao_responsavel_id", deslocando a numeração das colunas novas.
// Esta função corrige isso -- ver Ciclo 19 na diretriz técnica para o
// histórico completo do incidente e a decisão que resultou dele: a partir
// da Sprint 7, nenhuma alteração estrutural da planilha é feita
// manualmente pela UI do Sheets; toda migração de schema é uma função
// idempotente como esta, versionada junto com o código.
//
// Idempotente e defensiva: só altera algo se encontrar exatamente o padrão
// exato do incidente (as 3 colunas da Sprint 7 ocupando 3 posições
// consecutivas a partir de onde "data_inicio_negociacao" deveria estar, e
// "data_inicio_negociacao" ausente do cabeçalho); qualquer outro estado
// não é tocado. Só escreve na linha 1 (cabeçalho) -- nunca lê nem altera
// linhas de dado, então nenhuma oportunidade é afetada. Executada uma
// única vez (2026-08-07) via URL de teste do Apps Script; resultado
// confirmado e registrado no Ciclo 19. Mantida no código por
// documentação/idempotência, não é chamada por nenhuma action do
// Roteador.
function migrarSprint7CorrigirCabecalhoDataInicio_() {
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var totalColunas = aba.getLastColumn();
  var cabecalho = aba.getRange(1, 1, 1, totalColunas).getValues()[0];
  var jaTemDataInicio = cabecalho.indexOf('data_inicio_negociacao') !== -1;
  var posAC = cabecalho.indexOf('proxima_acao_responsavel_id'); // 0-based
  var posAD = cabecalho.indexOf('proxima_acao_tipo');
  var posAE = cabecalho.indexOf('proxima_acao_outro_texto');
  if (jaTemDataInicio) {
    return { acao: 'nenhuma', motivo: 'data_inicio_negociacao ja existe no cabecalho -- nada a corrigir.', cabecalhoAntes: cabecalho };
  }
  if (posAC === -1 || posAD !== posAC + 1 || posAE !== posAC + 2) {
    return { acao: 'nenhuma', motivo: 'Padrao esperado (proxima_acao_responsavel_id, tipo, outro_texto em 3 colunas seguidas) nao encontrado -- nada alterado por seguranca.', cabecalhoAntes: cabecalho };
  }
  aba.getRange(1, posAC + 1).setValue('data_inicio_negociacao');
  aba.getRange(1, totalColunas + 1).setValue('proxima_acao_responsavel_id');
  var cabecalhoDepois = aba.getRange(1, 1, 1, totalColunas + 1).getValues()[0];
  return { acao: 'corrigido', colunaDataInicio1based: posAC + 1, colunaResponsavelId1based: totalColunas + 1, cabecalhoDepois: cabecalhoDepois };
}

// Sprint 8 "Performance e Estabilidade" (2026-08-10): cacheada (5min, ver
// lerAbaComoObjetosCacheada_ em Utils.gs) -- as 8 etapas do pipeline nunca
// mudam pelo app, mas eram relidas da planilha em todo doGet de leitura E
// internamente em obterEtapaPorId_/criarOportunidade_, várias vezes por
// requisição em alguns fluxos (ex: mover etapa lê a etapa atual e a nova).
function listEtapas_() {
  var etapas = lerAbaComoObjetosCacheada_(ABAS.ETAPAS);
  return etapas.sort(function (a, b) { return a.ordem - b.ordem; });
}


/**
 * Anotações (campo único de texto por oportunidade) — adicionado a
 * pedido do CEO em 2026-08-02/03, antes da persistência das funções dos
 * Passos 5-8 (mover etapa, próxima ação, checklist), que por ora
 * continuam só em memória (ver Pipeline.tsx). Diferente delas, Anotações
 * grava e lê sempre da planilha real — decisão explícita do CEO, para
 * confirmar que o campo "salva e recupera de verdade" antes de ir mais
 * longe. Um único campo de texto por oportunidade, sem versionamento,
 * sem histórico, sem comentários separados — grava direto na coluna
 * "anotacoes" da aba Oportunidades. Não aparece no Kanban, só no painel
 * lateral.
 *
 * Decisão de segurança (aprovada explicitamente pelo Guilherme em
 * 2026-08-02/03, não decisão unilateral do CTO): como a autenticação
 * Google está pausada, não existe sessão de usuário válida disponível —
 * então estas duas ações NÃO exigem sessão (ver ACOES_SEM_SESSAO e
 * ACOES_POST_SEM_SESSAO em Roteador.gs). Isso significa que qualquer
 * requisição para a URL pública do Web App consegue ler ou sobrescrever
 * a anotação de qualquer oportunidade enquanto o login ficar pausado.
 * Risco aceito conscientemente pelo CEO — reavaliar (ex: exigir sessão
 * de novo) quando a autenticação for retomada.
 */

// Localiza a linha (1-indexada, pronta pra getRange) de uma oportunidade
// pelo id, junto com o cabeçalho da aba — evita ler a aba inteira duas
// vezes em obterAnotacao_/salvarAnotacao_.
// Sprint 8 "Performance e Estabilidade" (2026-08-10): passou a devolver
// também `linhaValores` (os valores atuais da linha encontrada) -- já
// estavam sendo lidos como parte do getDataRange().getValues() acima, só
// não eram aproveitados. Isso evita que cada função chamadora precise
// fazer uma nova chamada getRange(...).getValue() por campo que precisa
// ler (valorAtual/setarCampo liam célula a célula depois de já ter a
// linha inteira em mãos). Aditivo -- nenhum chamador existente que só usa
// `linha`/`cabecalho` precisa mudar.
function encontrarLinhaOportunidade_(aba, oportunidadeId) {
  var valores = aba.getDataRange().getValues();
  var cabecalho = valores[0];
  var colId = cabecalho.indexOf('id');
  if (colId === -1) {
    throw new Error('Coluna "id" nao encontrada na aba Oportunidades.');
  }
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][colId]) === String(oportunidadeId)) {
      return { linha: i + 1, cabecalho: cabecalho, linhaValores: valores[i] };
    }
  }
  return null;
}

function obterAnotacao_(oportunidadeId) {
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
  if (!encontrada) {
    throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
  }
  var colAnotacoes = encontrada.cabecalho.indexOf('anotacoes');
  if (colAnotacoes === -1) {
    return { anotacoes: '' };
  }
  var valor = aba.getRange(encontrada.linha, colAnotacoes + 1).getValue();
  return { anotacoes: valor ? String(valor) : '' };
}

// LockService evita corromper a célula se duas abas do navegador
// salvarem a mesma oportunidade quase ao mesmo tempo — mesma regra de
// "LockService nas escritas" já registrada na diretriz técnica, não tem
// relação com a decisão de sessão acima (que é sobre autenticação, não
// sobre concorrência).
function salvarAnotacao_(oportunidadeId, anotacoes) {
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var colAnotacoes = encontrada.cabecalho.indexOf('anotacoes');
    if (colAnotacoes === -1) {
      throw new Error('Coluna "anotacoes" nao existe na aba Oportunidades.');
    }
    aba.getRange(encontrada.linha, colAnotacoes + 1).setValue(anotacoes || '');
    var colAtualizado = encontrada.cabecalho.indexOf('atualizado_em');
    if (colAtualizado !== -1) {
      aba.getRange(encontrada.linha, colAtualizado + 1).setValue(new Date().toISOString());
    }
    return { anotacoes: anotacoes || '' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sprint 1 (2026-08-03) — "Operação Comercial": as duas primeiras escritas
 * reais de mover etapa (Passo 5, até então só em memória — ver Pipeline.tsx
 * e o pendente registrado no Ciclo 5) e a nova função de transferência de
 * responsável. Mesma decisão de segurança "sem proteção nenhuma enquanto o
 * login estiver pausado" já usada em Anotações (Ciclo 5) — aprovada de novo
 * explicitamente pelo Guilherme para estes endpoints nesta Sprint (ver
 * Roteador.gs e a diretriz técnica). Ambas chamam registrarEventoTimeline_
 * (Timeline.gs) para gravar o histórico de verdade na planilha — a
 * primeira vez que a aba Timeline deixa de ficar vazia.
 */

// Sprint 8 "Performance e Estabilidade" (2026-08-10): passou a usar
// listEtapas_() (cacheada) em vez de ler a aba direto -- moverEtapaOportunidade_
// chama esta função duas vezes por requisição (etapa atual + etapa nova);
// antes disso eram duas leituras completas da aba Etapas, agora a segunda
// chamada custa só um lookup em memória no cache já quente.
function obterEtapaPorId_(etapaId) {
  var etapas = listEtapas_();
  for (var i = 0; i < etapas.length; i++) {
    if (String(etapas[i].id) === String(etapaId)) return etapas[i];
  }
  return null;
}

// Mover etapa — usado tanto pelo seletor por botão (SidePanel, mobile e
// fallback desktop) quanto pelo novo drag-and-drop (Pipeline, desktop).
// Duas camadas de validação de etapa final, mesma filosofia já usada no
// frontend desde o Ciclo 4: aqui é a camada de verdade (o frontend também
// valida antes de chamar, mas quem manda é o backend).
function moverEtapaOportunidade_(oportunidadeId, novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto, usuarioId) {
  if (!oportunidadeId || !novaEtapaId) {
    throw new Error('oportunidadeId e novaEtapaId sao obrigatorios.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalho = encontrada.cabecalho;
    var colEtapa = cabecalho.indexOf('etapa_id');
    var etapaAtualId = encontrada.linhaValores[colEtapa];
    var etapaAtual = obterEtapaPorId_(etapaAtualId);
    var etapaNova = obterEtapaPorId_(novaEtapaId);

    if (!etapaNova) {
      throw new Error('Etapa de destino invalida: ' + novaEtapaId);
    }
    if (etapaAtual && (etapaAtual.tipo === 'ganho' || etapaAtual.tipo === 'perdido')) {
      throw new Error('Etapa atual (' + etapaAtual.nome + ') e final -- nao pode ser alterada.');
    }

    var motivo = null;
    if (etapaNova.tipo === 'perdido') {
      if (!motivoPerdaId) {
        throw new Error('Motivo da perda e obrigatorio ao mover para uma etapa de perda.');
      }
      motivo = obterMotivoPerdaPorId_(motivoPerdaId);
      if (!motivo) {
        throw new Error('Motivo de perda invalido: ' + motivoPerdaId);
      }
      if (motivo.nome === 'Outro' && (!motivoPerdaOutroTexto || !String(motivoPerdaOutroTexto).trim())) {
        throw new Error('Descricao obrigatoria quando o motivo de perda for "Outro".');
      }
    }

    var agora = new Date().toISOString();
    // Sprint 8 "Performance e Estabilidade" (2026-08-10): campos
    // acumulados num objeto e gravados numa única chamada setValues (ver
    // gravarCamposLinha_ em Utils.gs), em vez de até 5 chamadas setValue
    // separadas -- mesmos campos, mesmos valores, uma API call em vez de
    // várias.
    var campos = { etapa_id: novaEtapaId, atualizado_em: agora };

    if (etapaNova.tipo === 'perdido') {
      campos.etapa_origem_perda_id = etapaAtualId;
      campos.motivo_perda_id = motivoPerdaId;
      campos.perdido_em = agora;
      campos.perdido_por = usuarioId || '';
      campos.motivo_perda_descricao_outro = motivo.nome === 'Outro' ? String(motivoPerdaOutroTexto).trim() : '';
    }
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, campos);

    var descricaoEvento = 'Movida de "' + (etapaAtual ? etapaAtual.nome : '?') + '" para "' + etapaNova.nome + '"';
    if (motivo) {
      descricaoEvento += ' -- motivo: ' + motivo.nome + (motivo.nome === 'Outro' ? (' (' + motivoPerdaOutroTexto + ')') : '');
    }
    registrarEventoTimeline_(oportunidadeId, 'mudanca_etapa', descricaoEvento, usuarioId);

    return { oportunidadeId: oportunidadeId, etapaId: novaEtapaId };
  } finally {
    lock.releaseLock();
  }
}

// Transferência de responsável. "quem realizou a transferência" é sempre
// o usuarioId recebido (ator logado no frontend no momento da ação) --
// pode ser diferente tanto do responsável antigo quanto do novo (ex: um
// gerente reatribuindo a carteira de outra pessoa).
function transferirOportunidade_(oportunidadeId, novoResponsavelId, usuarioId) {
  if (!oportunidadeId || !novoResponsavelId) {
    throw new Error('oportunidadeId e novoResponsavelId sao obrigatorios.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalho = encontrada.cabecalho;
    var colResp = cabecalho.indexOf('responsavel_id');
    var responsavelAntigoId = encontrada.linhaValores[colResp];

    // Sprint 8 "Performance e Estabilidade" (2026-08-10): usa a lista
    // cacheada (listUsuarios_) em vez de reler Usuarios direto -- mesma
    // função local "nomeUsuario" mantida (não trocada por
    // nomeUsuarioPorId_) para preservar exatamente o texto de fallback
    // original ("Usuario " + id) e não mudar o comportamento em nenhum
    // caso, nem o de borda de um responsável antigo já removido da aba.
    var usuarios = listUsuarios_();
    function nomeUsuario(id) {
      for (var i = 0; i < usuarios.length; i++) {
        if (String(usuarios[i].id) === String(id)) return usuarios[i].nome;
      }
      return 'Usuario ' + id;
    }
    var novoValido = usuarios.some(function (u) { return String(u.id) === String(novoResponsavelId); });
    if (!novoValido) {
      throw new Error('Usuario de destino invalido: ' + novoResponsavelId);
    }

    var agora = new Date().toISOString();
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, {
      responsavel_id: novoResponsavelId,
      atualizado_em: agora
    });

    var descricaoEvento = 'Transferida de "' + nomeUsuario(responsavelAntigoId) + '" para "' + nomeUsuario(novoResponsavelId) + '" por "' + nomeUsuario(usuarioId) + '"';
    registrarEventoTimeline_(oportunidadeId, 'transferencia', descricaoEvento, usuarioId);

    return { oportunidadeId: oportunidadeId, responsavelId: novoResponsavelId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sprint 3 "Integracao com Estoque do Simples" (2026-08-03) -- associa um
 * veiculo real do estoque (Estoque.gs) a uma oportunidade. Grava um
 * snapshot dos dados do veiculo na propria linha da oportunidade (nao so
 * o id) porque, se o veiculo sumir do feed depois (vendido ou retirado
 * do estoque), precisamos continuar mostrando o que era esse veiculo --
 * decisao explicita do CEO ("preservar os dados existentes... nao apagar
 * a associacao, nao substituir automaticamente por outro veiculo"). O
 * frontend, ao exibir, busca o id na consulta ao vivo do estoque
 * (listEstoque) para mostrar preco/km/disponibilidade atualizados;
 * quando nao encontra mais o id, cai para este snapshot congelado e
 * mostra "Indisponivel no estoque".
 *
 * Tambem preenche veiculo_interesse (campo de texto livre ja existente,
 * usado no titulo do card e do painel) com a descricao combinada, para o
 * resto da UI continuar funcionando sem mudanca.
 *
 * Mesma decisao de seguranca "sem protecao nenhuma" ja usada nos demais
 * endpoints de escrita desde o Ciclo 5 -- nao e uma nova decisao, e o
 * mesmo debito tecnico ja registrado na diretriz tecnica, com resolucao
 * prevista para a Sprint 4.
 */
function associarVeiculoEstoque_(oportunidadeId, veiculoEstoqueId, usuarioId) {
  if (!oportunidadeId || !veiculoEstoqueId) {
    throw new Error('oportunidadeId e veiculoEstoqueId sao obrigatorios.');
  }
  var veiculo = obterVeiculoEstoquePorId_(veiculoEstoqueId);
  if (!veiculo) {
    throw new Error('Veiculo nao encontrado no estoque atual: ' + veiculoEstoqueId);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalho = encontrada.cabecalho;

    var descricaoVeiculo = [veiculo.marca, veiculo.modeloVersao, veiculo.ano]
      .filter(function (v) { return !!v; })
      .join(' ');
    var agora = new Date().toISOString();

    // Sprint 8 "Performance e Estabilidade" (2026-08-10): 9 campos
    // acumulados e gravados numa única chamada setValues (ver
    // gravarCamposLinha_ em Utils.gs), em vez de 9 chamadas setValue
    // separadas -- mesmos campos, mesmos valores.
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, {
      veiculo_estoque_id: veiculo.id,
      veiculo_estoque_marca: veiculo.marca || '',
      veiculo_estoque_modelo_versao: veiculo.modeloVersao || '',
      veiculo_estoque_ano: veiculo.ano || '',
      veiculo_estoque_km: veiculo.km != null ? veiculo.km : '',
      veiculo_estoque_preco: veiculo.preco != null ? veiculo.preco : '',
      veiculo_estoque_imagem: veiculo.imagemPrincipal || '',
      veiculo_estoque_associado_em: agora,
      veiculo_interesse: descricaoVeiculo,
      atualizado_em: agora
    });

    // Sprint 8: usa a lista cacheada (listUsuarios_) e o helper
    // compartilhado nomeUsuarioPorId_ (Utils.gs, mesmo fallback 'Alguem'
    // que já era usado aqui) em vez de reler Usuarios direto.
    var usuarios = listUsuarios_();

    registrarEventoTimeline_(
      oportunidadeId,
      'veiculo_associado',
      '"' + nomeUsuarioPorId_(usuarios, usuarioId) + '" associou o veiculo "' + descricaoVeiculo + '" (Simples #' + veiculo.id + ') a oportunidade.',
      usuarioId
    );

    return {
      oportunidadeId: oportunidadeId,
      veiculoInteresse: descricaoVeiculo,
      veiculoEstoque: veiculo
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sprint 3.5 "Nova Negociação" (2026-08-03) -- permite qualquer colaborador
 * iniciar uma negociacao direto pelo CRM, sem precisar de outro sistema
 * para cadastrar o lead. Recebe um unico objeto `dados` (em vez de
 * parametros posicionais como as demais funcoes deste arquivo) porque tem
 * quatro campos obrigatorios e cinco opcionais -- assinatura posicional de
 * 9 argumentos seria mais dificil de ler/chamar do que o resto do arquivo,
 * entao esta funcao especificamente foge do padrao por legibilidade.
 *
 * Regras exigidas pelo CEO, nesta ordem: (1) verificar cliente existente
 * por telefone, reaproveitar ou criar (ver Clientes.gs); (2) criar a
 * oportunidade sempre na etapa "Novo Lead" (buscada pelo nome, nao por id
 * fixo -- mais resiliente a uma reordenacao futura das etapas); (3)
 * registrar a criacao na Timeline. "usuarioId" e o ator logado no momento
 * (pode ser diferente do responsavelId escolhido no formulario -- ex: um
 * SDR cadastra o lead e ja atribui a um Closer).
 *
 * Mesma decisao de seguranca "sem protecao nenhuma" ja em vigor desde o
 * Ciclo 5 para todos os endpoints de escrita -- nao e uma nova decisao,
 * mesmo debito tecnico ja registrado, resolucao prevista para a Sprint 4.
 */
function criarOportunidade_(dados) {
  dados = dados || {};
  var nome = dados.nome ? String(dados.nome).trim() : '';
  var telefone = dados.telefone ? String(dados.telefone).trim() : '';
  var origemId = dados.origemId;
  var responsavelId = dados.responsavelId;

  if (!nome || !telefone || !origemId || !responsavelId) {
    throw new Error('Nome, telefone, origem e responsavel sao obrigatorios.');
  }

  // Sprint 8 "Performance e Estabilidade" (2026-08-10): Origens/Usuarios/
  // Etapas agora vêm das listas cacheadas (listOrigens_/listUsuarios_/
  // listEtapas_, ver Utils.gs) em vez de reler cada aba do zero -- mesmos
  // dados, sem custo extra de API quando o cache já está quente.
  var origens = listOrigens_();
  var origemValida = origens.some(function (o) { return String(o.id) === String(origemId); });
  if (!origemValida) {
    throw new Error('Origem invalida: ' + origemId);
  }

  var usuarios = listUsuarios_();
  var responsavelValido = usuarios.some(function (u) { return String(u.id) === String(responsavelId); });
  if (!responsavelValido) {
    throw new Error('Responsavel invalido: ' + responsavelId);
  }

  var etapas = listEtapas_();
  var etapaNovoLead = null;
  for (var i = 0; i < etapas.length; i++) {
    if (etapas[i].nome === 'Novo Lead') { etapaNovoLead = etapas[i]; break; }
  }
  if (!etapaNovoLead) {
    throw new Error('Etapa "Novo Lead" nao encontrada na aba Etapas.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cliente = encontrarClientePorTelefone_(telefone);
    if (!cliente) {
      cliente = criarCliente_({ nome: nome, telefone: telefone, cidade: dados.cidade });
    }

    var agora = new Date().toISOString();
    var oportunidadeId = Utilities.getUuid();
    var oportunidade = {
      id: oportunidadeId,
      cliente_id: cliente.id,
      etapa_id: etapaNovoLead.id,
      responsavel_id: responsavelId,
      proxima_acao: dados.proximaAcao || '',
      proxima_acao_data: dados.proximaAcaoData || '',
      veiculo_interesse: dados.veiculoInteresse || '',
      origem_id: origemId,
      anotacoes: dados.anotacoesIniciais || '',
      criado_em: agora,
      atualizado_em: agora
    };
    adicionarLinhaPorCabecalho_(getAba_(ABAS.OPORTUNIDADES), oportunidade);

    var usuarioAtorId = dados.usuarioId || responsavelId;
    var descricaoEvento = '"' + nomeUsuarioPorId_(usuarios, usuarioAtorId) + '" criou a oportunidade' +
      (String(usuarioAtorId) !== String(responsavelId)
        ? ' (responsavel: "' + nomeUsuarioPorId_(usuarios, responsavelId) + '")'
        : '') + '.';
    registrarEventoTimeline_(oportunidadeId, 'criacao', descricaoEvento, usuarioAtorId);

    return { oportunidade: oportunidade, cliente: cliente };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sprint 6 "Operação do dia a dia" (2026-08-07) — item 1 "Excluir
 * negociação". Exclusão é sempre LÓGICA (soft delete) — nunca apaga a
 * linha da planilha, mesma filosofia já usada em todo o resto do projeto
 * (ex: veiculo_estoque_* nunca é apagado quando o veículo some do feed do
 * estoque — ver comentário acima de associarVeiculoEstoque_). Preserva o
 * registro para auditoria e permite reverter manualmente na planilha se
 * excluído por engano; listOportunidades_ é quem filtra o que já foi
 * excluído (ver topo do arquivo). Confirmação é responsabilidade do
 * frontend (modal antes de chamar esta ação) — o backend não confirma de
 * novo, só executa. Registra o evento no Timeline (histórico da
 * oportunidade) ANTES de marcar como excluída, com o nome de quem excluiu
 * — fica preservado na aba Timeline mesmo que a oportunidade em si suma da
 * UI a partir daqui.
 *
 * Lança erro explícito (em vez de silenciosamente não fazer nada) se as
 * colunas excluido_em/excluido_por ainda não existirem na planilha —
 * diferente dos campos opcionais de veiculo_estoque_* (enriquecimento,
 * tolera coluna ausente), aqui a coluna é indispensável para a
 * funcionalidade funcionar; falhar calado esconderia que a exclusão não
 * teve efeito nenhum.
 */
function excluirOportunidade_(oportunidadeId, usuarioId) {
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalho = encontrada.cabecalho;
    var colExcluidoEm = cabecalho.indexOf('excluido_em');
    if (colExcluidoEm === -1) {
      throw new Error(
        'Coluna "excluido_em" nao existe na aba Oportunidades -- adicione a coluna antes de excluir negociacoes.'
      );
    }

    var usuarios = listUsuarios_();
    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    var agora = new Date().toISOString();

    // Grava o evento antes de marcar como excluída -- se a escrita do
    // Timeline falhar por algum motivo, preferimos abortar sem ter
    // excluído nada a excluir sem deixar rastro.
    registrarEventoTimeline_(oportunidadeId, 'exclusao', '"' + atorNome + '" excluiu esta negociacao.', usuarioId);

    // Sprint 8 "Performance e Estabilidade" (2026-08-10): as duas colunas
    // (excluido_em/excluido_por) são gravadas numa única chamada setValues
    // em vez de duas chamadas setValue separadas.
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, {
      excluido_em: agora,
      excluido_por: usuarioId || ''
    });

    return { oportunidadeId: oportunidadeId, excluidoEm: agora };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sprint 6 "Operação do dia a dia" (2026-08-07) — itens 4 e 5: edição dos
 * dados cadastrais do cliente (nome/telefone/cidade) e da origem/"Data de
 * início real" da negociação, num único endpoint porque o formulário do
 * CEO junta os dois numa só tela de edição no painel lateral (ver
 * SidePanel.tsx). Cliente e Oportunidade são linhas em abas diferentes; a
 * função grava as duas sob o mesmo lock e registra UM único evento no
 * Timeline com o resumo do que mudou, em vez de um evento por campo (mesma
 * filosofia de "uma ação, um evento" já usada em criarOportunidade_).
 *
 * "Data de início real da negociação" (item 5) é um campo novo e opcional
 * (data_inicio_negociacao), independente de criado_em -- que esta função
 * NUNCA sobrescreve (requisito explícito do CEO: "a data original de
 * criação do registro deve continuar preservada internamente"). Quando
 * data_inicio_negociacao está vazia, o frontend mostra criado_em como
 * "Data de início" (ver mapOportunidade em services/oportunidades.ts).
 *
 * `dados` só precisa trazer os campos que o usuário efetivamente editou —
 * qualquer campo ausente (undefined) é ignorado; campos presentes mas
 * iguais ao valor já gravado não geram entrada no Timeline (evita "editou"
 * fantasma quando o usuário abre o formulário e salva sem mudar nada).
 */
function editarDadosOportunidade_(oportunidadeId, dados, usuarioId) {
  dados = dados || {};
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var abaOportunidades = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(abaOportunidades, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalhoOp = encontrada.cabecalho;
    var linhaOp = encontrada.linha;
    var linhaValoresOp = encontrada.linhaValores;

    // Sprint 8 "Performance e Estabilidade" (2026-08-10): valorAtualOp_
    // passou a ler da linha já em memória (linhaValoresOp, vinda de
    // encontrarLinhaOportunidade_) em vez de uma chamada getRange().
    // getValue() por campo; setarCampoOp_ passou a acumular os campos que
    // de fato mudam num objeto em vez de escrever célula a célula -- a
    // gravação real vira uma única chamada setValues mais abaixo (ver
    // gravarCamposLinha_ em Utils.gs), só quando algo realmente mudou
    // (mesma condição de antes: dentro dos blocos que já chamavam
    // mudancas.push).
    var camposParaGravar = {};
    function valorAtualOp_(nomeCampo) {
      var col = cabecalhoOp.indexOf(nomeCampo);
      if (col === -1) return '';
      var v = linhaValoresOp[col];
      return v === null || v === undefined ? '' : String(v);
    }
    function setarCampoOp_(nomeCampo, valor) {
      var col = cabecalhoOp.indexOf(nomeCampo);
      if (col !== -1) camposParaGravar[nomeCampo] = valor;
    }

    var colClienteId = cabecalhoOp.indexOf('cliente_id');
    var clienteId = colClienteId !== -1 ? linhaValoresOp[colClienteId] : null;

    var mudancas = [];
    var usuarios = listUsuarios_();
    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);

    // --- Campos do Cliente (nome / telefone / cidade) ---
    var camposCliente = {};
    if (dados.nome !== undefined) camposCliente.nome = String(dados.nome).trim();
    if (dados.telefone !== undefined) camposCliente.telefone = String(dados.telefone).trim();
    if (dados.cidade !== undefined) camposCliente.cidade = String(dados.cidade).trim();

    var clienteAtualizado = null;
    if (clienteId && Object.keys(camposCliente).length > 0) {
      if (camposCliente.nome !== undefined && camposCliente.nome === '') {
        throw new Error('Nome do cliente nao pode ficar vazio.');
      }
      if (camposCliente.telefone !== undefined && camposCliente.telefone === '') {
        throw new Error('Telefone do cliente nao pode ficar vazio.');
      }
      clienteAtualizado = atualizarCliente_(clienteId, camposCliente, mudancas);
    }

    // --- Origem da oportunidade ---
    if (dados.origemId !== undefined && String(dados.origemId) !== '') {
      var origens = listOrigens_();
      var origemAtualId = valorAtualOp_('origem_id');
      if (String(origemAtualId) !== String(dados.origemId)) {
        var origemNova = null;
        origens.some(function (o) {
          if (String(o.id) === String(dados.origemId)) { origemNova = o; return true; }
          return false;
        });
        if (!origemNova) throw new Error('Origem invalida: ' + dados.origemId);
        var origemAtualObj = null;
        origens.some(function (o) {
          if (String(o.id) === String(origemAtualId)) { origemAtualObj = o; return true; }
          return false;
        });
        setarCampoOp_('origem_id', dados.origemId);
        mudancas.push('origem de "' + (origemAtualObj ? origemAtualObj.nome : '?') + '" para "' + origemNova.nome + '"');
      }
    }

    // --- Data de início real da negociação (independente de criado_em) ---
    if (dados.dataInicioNegociacao !== undefined) {
      var colDataInicio = cabecalhoOp.indexOf('data_inicio_negociacao');
      if (colDataInicio === -1) {
        throw new Error(
          'Coluna "data_inicio_negociacao" nao existe na aba Oportunidades -- adicione a coluna antes de editar esta data.'
        );
      }
      var dataAtual = valorAtualOp_('data_inicio_negociacao');
      var dataNova = String(dados.dataInicioNegociacao || '').trim();
      if (dataAtual !== dataNova) {
        setarCampoOp_('data_inicio_negociacao', dataNova);
        mudancas.push('data de inicio da negociacao para "' + (dataNova || '(voltou a usar a data de criacao)') + '"');
      }
    }

    var oportunidadeFinal;
    if (mudancas.length === 0) {
      // Nada mudou de fato (usuário abriu o formulário e salvou sem
      // editar nenhum campo) -- não grava evento vazio no Timeline. Sprint
      // 8: também não faz nenhuma escrita nem releitura da aba -- o
      // objeto de retorno é montado direto da linha já em memória.
      oportunidadeFinal = {};
      cabecalhoOp.forEach(function (chave, i) { oportunidadeFinal[chave] = linhaValoresOp[i]; });
      return { oportunidade: oportunidadeFinal, cliente: clienteAtualizado };
    }

    var agora = new Date().toISOString();
    camposParaGravar.atualizado_em = agora;

    // Sprint 8 "Performance e Estabilidade" (2026-08-10): todos os campos
    // que mudaram (origem_id/data_inicio_negociacao/atualizado_em) são
    // gravados numa única chamada setValues, que já devolve o objeto
    // atualizado -- sem precisar reler a aba inteira em seguida (a
    // releitura completa, feita duas vezes nesta função antes desta
    // Sprint, era o ponto mais caro dela).
    oportunidadeFinal = gravarCamposLinha_(abaOportunidades, linhaOp, cabecalhoOp, linhaValoresOp, camposParaGravar);

    registrarEventoTimeline_(
      oportunidadeId,
      'dados_editados',
      '"' + atorNome + '" editou dados cadastrais: ' + mudancas.join('; ') + '.',
      usuarioId
    );

    return { oportunidade: oportunidadeFinal, cliente: clienteAtualizado };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sprint 7 "Próximas Ações" (2026-08-07) — objetivo do CEO: "o sistema deve
 * responder apenas uma pergunta: qual é a próxima ação para fazer esse
 * cliente avançar". Substitui o texto livre da Sprint 1 (Passo 7, que nunca
 * chegou a persistir de verdade — ficava só em memória no Pipeline.tsx) por
 * um modelo estruturado: TIPO (lista fixa + "Outro" com texto livre), DATA/
 * HORA e RESPONSÁVEL pela ação (por padrão o responsável da oportunidade,
 * mas pode ser outra pessoa — ex: Ian cria a ação e atribui à Ester).
 *
 * Sugestão do CEO, adotada literalmente: em vez de um campo de descrição
 * novo, a ação é só {tipo, data, responsável} — detalhes vão em
 * Observações/Anotações (campo já existente, ver salvarAnotacao_ acima).
 *
 * Lista de tipos é fixa e vive tanto aqui (validação) quanto no frontend
 * (dropdown, ver src/utils/proximaAcao.ts) — mesma decisão consciente de
 * "sem abinha administrável" já usada para NomeEtapa (união fixa no
 * TypeScript) — o pedido do CEO foi explícito ("não criar novas etapas",
 * lista de ações também veio pronta, sem pedido de administração futura).
 * Se um novo tipo precisar ser adicionado, é uma mudança de código nos dois
 * lados, não uma linha nova em planilha.
 *
 * `proxima_acao` (texto livre, coluna legada da Sprint 1) continua sendo
 * escrita em paralelo com a descrição resolvida (tipo, ou o texto de
 * "Outro") — mantém compatibilidade com o card do Kanban
 * (OpportunityCard.tsx) e qualquer oportunidade antiga que só tenha o
 * campo legado, sem precisar tocar nesses lugares nesta Sprint.
 */
var TIPOS_PROXIMA_ACAO = [
  'Fazer simulação',
  'Solicitar documentos',
  'Solicitar fotos da troca',
  'Enviar vídeo do veículo',
  'Confirmar visita',
  'Retornar ligação',
  'Fazer follow-up',
  'Aguardando cliente',
  'Outro'
];

function atualizarProximaAcao_(oportunidadeId, dados, usuarioId) {
  dados = dados || {};
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  var tipo = dados.proximaAcaoTipo ? String(dados.proximaAcaoTipo).trim() : '';
  if (!tipo) {
    throw new Error('Tipo da próxima ação é obrigatório.');
  }
  if (TIPOS_PROXIMA_ACAO.indexOf(tipo) === -1) {
    throw new Error('Tipo de próxima ação inválido: ' + tipo);
  }
  var outroTexto = dados.proximaAcaoOutroTexto ? String(dados.proximaAcaoOutroTexto).trim() : '';
  if (tipo === 'Outro' && !outroTexto) {
    throw new Error('Descrição obrigatória quando o tipo da próxima ação for "Outro".');
  }
  var data = dados.proximaAcaoData ? String(dados.proximaAcaoData).trim() : '';
  if (!data) {
    throw new Error('Data e hora da próxima ação são obrigatórias.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalho = encontrada.cabecalho;
    if (cabecalho.indexOf('proxima_acao_tipo') === -1) {
      throw new Error(
        'Coluna "proxima_acao_tipo" nao existe na aba Oportunidades -- adicione as colunas da Sprint 7 antes de usar próxima ação.'
      );
    }

    var colResp = cabecalho.indexOf('responsavel_id');
    var responsavelPadraoId = colResp !== -1 ? encontrada.linhaValores[colResp] : '';
    var responsavelId = dados.proximaAcaoResponsavelId || responsavelPadraoId;

    // Sprint 8 "Performance e Estabilidade" (2026-08-10): Usuarios vem da
    // lista cacheada (listUsuarios_, ver Utils.gs) em vez de reler a aba.
    var usuarios = listUsuarios_();
    var respValido = usuarios.some(function (u) { return String(u.id) === String(responsavelId); });
    if (!respValido) {
      throw new Error('Responsável pela próxima ação inválido: ' + responsavelId);
    }

    var descricaoTipo = tipo === 'Outro' ? outroTexto : tipo;
    var agora = new Date().toISOString();

    // Sprint 8: os 6 campos são gravados numa única chamada setValues, que
    // já devolve o objeto atualizado -- sem releitura completa da aba
    // depois (ver gravarCamposLinha_ em Utils.gs).
    var oportunidadeFinal = gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, {
      proxima_acao_tipo: tipo,
      proxima_acao_outro_texto: tipo === 'Outro' ? outroTexto : '',
      proxima_acao_data: data,
      proxima_acao_responsavel_id: responsavelId,
      proxima_acao: descricaoTipo,
      atualizado_em: agora
    });

    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    var respNome = nomeUsuarioPorId_(usuarios, responsavelId);
    registrarEventoTimeline_(
      oportunidadeId,
      'proxima_acao_criada',
      '"' + atorNome + '" criou: ' + descricaoTipo + ' -- ' + formatarDataHoraCurta_(data) + ' (responsável: ' + respNome + ').',
      usuarioId
    );

    return { oportunidade: oportunidadeFinal };
  } finally {
    lock.releaseLock();
  }
}

// Concluir a próxima ação ativa: registra na Timeline, limpa os campos da
// oportunidade (item 5 do pedido do CEO: "limpa a Próxima Ação da
// oportunidade"). Quem pergunta "Deseja criar outra?" e, se sim, chama
// atualizarProximaAcao_ de novo é o frontend (SidePanel.tsx) -- este
// endpoint só conclui, não decide o que vem depois.
function concluirProximaAcao_(oportunidadeId, usuarioId) {
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
    if (!encontrada) {
      throw new Error('Oportunidade nao encontrada: ' + oportunidadeId);
    }
    var cabecalho = encontrada.cabecalho;
    // Sprint 8 "Performance e Estabilidade" (2026-08-10): valorAtual lê da
    // linha já em memória (linhaValores, vinda de
    // encontrarLinhaOportunidade_) em vez de uma chamada getRange().
    // getValue() por campo.
    function valorAtual(nomeCampo) {
      var col = cabecalho.indexOf(nomeCampo);
      if (col === -1) return '';
      var v = encontrada.linhaValores[col];
      return v === null || v === undefined ? '' : String(v);
    }

    // Aceita tanto oportunidades já no modelo estruturado desta Sprint
    // (proxima_acao_tipo) quanto oportunidades antigas que só têm o campo
    // legado de texto livre (proxima_acao, Sprint 1/3.5) -- ambas podem
    // ser concluídas.
    var tipoAtual = valorAtual('proxima_acao_tipo');
    var outroAtual = valorAtual('proxima_acao_outro_texto');
    var descricaoTipo = tipoAtual ? (tipoAtual === 'Outro' ? outroAtual : tipoAtual) : valorAtual('proxima_acao');
    if (!descricaoTipo) {
      throw new Error('Esta oportunidade não tem uma próxima ação ativa para concluir.');
    }

    var usuarios = listUsuarios_();
    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    registrarEventoTimeline_(
      oportunidadeId,
      'proxima_acao_concluida',
      '"' + atorNome + '" concluiu: ' + descricaoTipo + '.',
      usuarioId
    );

    var agora = new Date().toISOString();
    // Sprint 8: os 6 campos são gravados numa única chamada setValues, que
    // já devolve o objeto atualizado -- sem releitura completa da aba
    // depois (ver gravarCamposLinha_ em Utils.gs).
    var oportunidadeFinal = gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, {
      proxima_acao_tipo: '',
      proxima_acao_outro_texto: '',
      proxima_acao_data: '',
      proxima_acao_responsavel_id: '',
      proxima_acao: '',
      atualizado_em: agora
    });

    return { oportunidade: oportunidadeFinal };
  } finally {
    lock.releaseLock();
  }
}
