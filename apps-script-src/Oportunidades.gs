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

// Sprint 7 "Próximas Ações" (2026-08-07) — helper de setup, criado para
// adicionar as 3 colunas novas exigidas por atualizarProximaAcao_ sem
// precisar editar a planilha célula a célula pela UI do Sheets (diferente
// da técnica manual usada no Ciclo 18/Sprint 6). Idempotente — só
// adiciona a coluna se ela ainda não existir, então rodar de novo por
// engano não duplica nada. Chamado uma única vez manualmente pelo editor
// do Apps Script (menu "Executar") durante a publicação desta Sprint;
// fica no código depois por documentação/idempotência, não é chamado por
// nenhuma action do Roteador.
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

function listEtapas_() {
  var etapas = lerAbaComoObjetos_(ABAS.ETAPAS);
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
function encontrarLinhaOportunidade_(aba, oportunidadeId) {
  var valores = aba.getDataRange().getValues();
  var cabecalho = valores[0];
  var colId = cabecalho.indexOf('id');
  if (colId === -1) {
    throw new Error('Coluna "id" nao encontrada na aba Oportunidades.');
  }
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][colId]) === String(oportunidadeId)) {
      return { linha: i + 1, cabecalho: cabecalho };
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

function obterEtapaPorId_(etapaId) {
  var etapas = lerAbaComoObjetos_(ABAS.ETAPAS);
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
    var etapaAtualId = aba.getRange(encontrada.linha, colEtapa + 1).getValue();
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
    function setarCampo(nomeCampo, valor) {
      var col = cabecalho.indexOf(nomeCampo);
      if (col !== -1) aba.getRange(encontrada.linha, col + 1).setValue(valor);
    }

    setarCampo('etapa_id', novaEtapaId);
    setarCampo('atualizado_em', agora);

    if (etapaNova.tipo === 'perdido') {
      setarCampo('etapa_origem_perda_id', etapaAtualId);
      setarCampo('motivo_perda_id', motivoPerdaId);
      setarCampo('perdido_em', agora);
      setarCampo('perdido_por', usuarioId || '');
      setarCampo('motivo_perda_descricao_outro', motivo.nome === 'Outro' ? String(motivoPerdaOutroTexto).trim() : '');
    }

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
    var responsavelAntigoId = aba.getRange(encontrada.linha, colResp + 1).getValue();

    var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
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
    aba.getRange(encontrada.linha, colResp + 1).setValue(novoResponsavelId);
    var colAtualizado = cabecalho.indexOf('atualizado_em');
    if (colAtualizado !== -1) aba.getRange(encontrada.linha, colAtualizado + 1).setValue(agora);

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
    function setarCampo(nomeCampo, valor) {
      var col = cabecalho.indexOf(nomeCampo);
      if (col !== -1) aba.getRange(encontrada.linha, col + 1).setValue(valor);
    }

    var descricaoVeiculo = [veiculo.marca, veiculo.modeloVersao, veiculo.ano]
      .filter(function (v) { return !!v; })
      .join(' ');
    var agora = new Date().toISOString();

    setarCampo('veiculo_estoque_id', veiculo.id);
    setarCampo('veiculo_estoque_marca', veiculo.marca || '');
    setarCampo('veiculo_estoque_modelo_versao', veiculo.modeloVersao || '');
    setarCampo('veiculo_estoque_ano', veiculo.ano || '');
    setarCampo('veiculo_estoque_km', veiculo.km != null ? veiculo.km : '');
    setarCampo('veiculo_estoque_preco', veiculo.preco != null ? veiculo.preco : '');
    setarCampo('veiculo_estoque_imagem', veiculo.imagemPrincipal || '');
    setarCampo('veiculo_estoque_associado_em', agora);
    setarCampo('veiculo_interesse', descricaoVeiculo);
    setarCampo('atualizado_em', agora);

    var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
    function nomeUsuario(id) {
      for (var i = 0; i < usuarios.length; i++) {
        if (String(usuarios[i].id) === String(id)) return usuarios[i].nome;
      }
      return 'Alguem';
    }

    registrarEventoTimeline_(
      oportunidadeId,
      'veiculo_associado',
      '"' + nomeUsuario(usuarioId) + '" associou o veiculo "' + descricaoVeiculo + '" (Simples #' + veiculo.id + ') a oportunidade.',
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

  var origens = lerAbaComoObjetos_(ABAS.ORIGENS);
  var origemValida = origens.some(function (o) { return String(o.id) === String(origemId); });
  if (!origemValida) {
    throw new Error('Origem invalida: ' + origemId);
  }

  var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
  var responsavelValido = usuarios.some(function (u) { return String(u.id) === String(responsavelId); });
  if (!responsavelValido) {
    throw new Error('Responsavel invalido: ' + responsavelId);
  }

  var etapas = lerAbaComoObjetos_(ABAS.ETAPAS);
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

    var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    var agora = new Date().toISOString();

    // Grava o evento antes de marcar como excluída -- se a escrita do
    // Timeline falhar por algum motivo, preferimos abortar sem ter
    // excluído nada a excluir sem deixar rastro.
    registrarEventoTimeline_(oportunidadeId, 'exclusao', '"' + atorNome + '" excluiu esta negociacao.', usuarioId);

    aba.getRange(encontrada.linha, colExcluidoEm + 1).setValue(agora);
    var colExcluidoPor = cabecalho.indexOf('excluido_por');
    if (colExcluidoPor !== -1) {
      aba.getRange(encontrada.linha, colExcluidoPor + 1).setValue(usuarioId || '');
    }

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

    function valorAtualOp_(nomeCampo) {
      var col = cabecalhoOp.indexOf(nomeCampo);
      if (col === -1) return '';
      var v = abaOportunidades.getRange(linhaOp, col + 1).getValue();
      return v === null || v === undefined ? '' : String(v);
    }
    function setarCampoOp_(nomeCampo, valor) {
      var col = cabecalhoOp.indexOf(nomeCampo);
      if (col !== -1) abaOportunidades.getRange(linhaOp, col + 1).setValue(valor);
    }

    var colClienteId = cabecalhoOp.indexOf('cliente_id');
    var clienteId = colClienteId !== -1 ? abaOportunidades.getRange(linhaOp, colClienteId + 1).getValue() : null;

    var mudancas = [];
    var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
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
      var origens = lerAbaComoObjetos_(ABAS.ORIGENS);
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
      // editar nenhum campo) -- não grava evento vazio no Timeline.
      oportunidadeFinal = lerAbaComoObjetos_(ABAS.OPORTUNIDADES).filter(function (o) {
        return String(o.id) === String(oportunidadeId);
      })[0];
      return { oportunidade: oportunidadeFinal, cliente: clienteAtualizado };
    }

    var agora = new Date().toISOString();
    setarCampoOp_('atualizado_em', agora);

    registrarEventoTimeline_(
      oportunidadeId,
      'dados_editados',
      '"' + atorNome + '" editou dados cadastrais: ' + mudancas.join('; ') + '.',
      usuarioId
    );

    oportunidadeFinal = lerAbaComoObjetos_(ABAS.OPORTUNIDADES).filter(function (o) {
      return String(o.id) === String(oportunidadeId);
    })[0];
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
    function setarCampo(nomeCampo, valor) {
      var col = cabecalho.indexOf(nomeCampo);
      if (col !== -1) aba.getRange(encontrada.linha, col + 1).setValue(valor);
    }
    if (cabecalho.indexOf('proxima_acao_tipo') === -1) {
      throw new Error(
        'Coluna "proxima_acao_tipo" nao existe na aba Oportunidades -- adicione as colunas da Sprint 7 antes de usar próxima ação.'
      );
    }

    var colResp = cabecalho.indexOf('responsavel_id');
    var responsavelPadraoId = colResp !== -1 ? aba.getRange(encontrada.linha, colResp + 1).getValue() : '';
    var responsavelId = dados.proximaAcaoResponsavelId || responsavelPadraoId;

    var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
    var respValido = usuarios.some(function (u) { return String(u.id) === String(responsavelId); });
    if (!respValido) {
      throw new Error('Responsável pela próxima ação inválido: ' + responsavelId);
    }

    var descricaoTipo = tipo === 'Outro' ? outroTexto : tipo;

    setarCampo('proxima_acao_tipo', tipo);
    setarCampo('proxima_acao_outro_texto', tipo === 'Outro' ? outroTexto : '');
    setarCampo('proxima_acao_data', data);
    setarCampo('proxima_acao_responsavel_id', responsavelId);
    setarCampo('proxima_acao', descricaoTipo);
    var agora = new Date().toISOString();
    setarCampo('atualizado_em', agora);

    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    var respNome = nomeUsuarioPorId_(usuarios, responsavelId);
    registrarEventoTimeline_(
      oportunidadeId,
      'proxima_acao_criada',
      '"' + atorNome + '" criou: ' + descricaoTipo + ' -- ' + formatarDataHoraCurta_(data) + ' (responsável: ' + respNome + ').',
      usuarioId
    );

    var oportunidadeFinal = lerAbaComoObjetos_(ABAS.OPORTUNIDADES).filter(function (o) {
      return String(o.id) === String(oportunidadeId);
    })[0];
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
    function valorAtual(nomeCampo) {
      var col = cabecalho.indexOf(nomeCampo);
      if (col === -1) return '';
      var v = aba.getRange(encontrada.linha, col + 1).getValue();
      return v === null || v === undefined ? '' : String(v);
    }
    function setarCampo(nomeCampo, valor) {
      var col = cabecalho.indexOf(nomeCampo);
      if (col !== -1) aba.getRange(encontrada.linha, col + 1).setValue(valor);
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

    var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    registrarEventoTimeline_(
      oportunidadeId,
      'proxima_acao_concluida',
      '"' + atorNome + '" concluiu: ' + descricaoTipo + '.',
      usuarioId
    );

    setarCampo('proxima_acao_tipo', '');
    setarCampo('proxima_acao_outro_texto', '');
    setarCampo('proxima_acao_data', '');
    setarCampo('proxima_acao_responsavel_id', '');
    setarCampo('proxima_acao', '');
    var agora = new Date().toISOString();
    setarCampo('atualizado_em', agora);

    var oportunidadeFinal = lerAbaComoObjetos_(ABAS.OPORTUNIDADES).filter(function (o) {
      return String(o.id) === String(oportunidadeId);
    })[0];
    return { oportunidade: oportunidadeFinal };
  } finally {
    lock.releaseLock();
  }
}
