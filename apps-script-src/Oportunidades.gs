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
// Hotfix "Visibilidade por Usuário" (2026-08-10): a causa raiz da
// exposição corrigida aqui era simples -- esta função sempre devolveu a
// aba inteira para qualquer usuário autenticado, porque nada no Roteador
// sabia (ou perguntava) qual era o papel de quem estava pedindo. Agora
// exige o usuário autenticado (resolvido pelo Roteador a partir só da
// sessão, nunca de um parâmetro da requisição -- ver obterUsuarioAutenticado_
// em Auth.gs) e aplica a regra de negócio pedida pelo CEO: Gerente/
// Administrador continuam vendo tudo; SDR/Closer veem só onde são
// responsavel_id. `usuarioAutenticado` é obrigatório por segurança -- não
// existe caminho de leitura de Oportunidades sem uma sessão válida desde a
// Sprint 4, então um chamador que não o fornece é, por definição, um erro
// de programação (falha fechada em vez de arriscar devolver tudo).
function listOportunidades_(usuarioAutenticado) {
  if (!usuarioAutenticado) {
    throw new Error('listOportunidades_ requer usuarioAutenticado (contexto de sessao) por seguranca.');
  }
  var linhas = lerAbaComoObjetos_(ABAS.OPORTUNIDADES).filter(function (o) { return !o.excluido_em; });
  // Hotfix "Horario da Proxima Acao" (2026-08-17): Sheets converte proxima_acao_data
  // para Date nativo (fuso da propria planilha), e JSON.stringify (respostaOk_) sempre
  // serializa Date em UTC, descartando o fuso -- por isso a mesma normalizacao vale
  // tanto para a oportunidade dentro do SidePanel quanto para as listas do Dashboard,
  // que leem os dois dessa mesma linhas aqui. Ver normalizarProximaAcaoData_ (Utils.gs).
  linhas.forEach(function (o) {
    o.proxima_acao_data = normalizarProximaAcaoData_(o.proxima_acao_data);
    // Melhoria isolada "Visita Agendada com data e hora" (2026-08-24) --
    // mesmo tratamento acima, reaproveitando normalizarProximaAcaoData_
    // (função genérica, não amarrada a próxima ação -- só normaliza
    // qualquer valor "YYYY-MM-DDTHH:mm" que o Sheets tenha convertido
    // silenciosamente em Date).
    o.visita_agendada_em = normalizarProximaAcaoData_(o.visita_agendada_em);
  });
  if (usuarioTemVisaoCompleta_(usuarioAutenticado)) {
    return linhas;
  }
  return linhas.filter(function (o) { return String(o.responsavel_id) === String(usuarioAutenticado.id); });
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

// Ciclo 22 "Funil Comercial — Bloco 3" (2026-08-12) — migração de schema:
// adiciona a coluna nova exigida pelo snapshot de responsável no momento da
// perda (ver moverEtapaOportunidade_ abaixo e a nota em types/index.ts).
// Idempotente -- mesmo padrão de configurarColunasSprint7_ acima: só
// adiciona a coluna se ela ainda não existir no cabeçalho, então rodar de
// novo por engano não duplica nada e nenhuma linha de dado é lida ou
// alterada. Não é chamada por nenhuma action do Roteador -- executada uma
// única vez via URL de teste do Apps Script antes da publicação deste
// Ciclo, mantida no código depois por documentação/idempotência (mesma
// convenção do Ciclo 19).
function configurarColunaResponsavelPerda_() {
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var nomeColuna = 'responsavel_no_momento_perda_id';
  if (cabecalho.indexOf(nomeColuna) === -1) {
    var novaCol = aba.getLastColumn() + 1;
    aba.getRange(1, novaCol).setValue(nomeColuna);
    cabecalho.push(nomeColuna);
    return { acao: 'adicionada', coluna1based: novaCol, cabecalho: cabecalho };
  }
  return { acao: 'nenhuma', motivo: nomeColuna + ' ja existe no cabecalho -- nada a fazer.', cabecalho: cabecalho };
}
// Item 5 "Reabrir oportunidade perdida" (Ciclo 22, 2026-08-18) -- migracao
// de schema: adiciona as colunas de snapshot da REABERTURA mais recente
// (ver reabrirOportunidade_ abaixo). Mesmo padrao idempotente de
// configurarColunaResponsavelPerda_ acima -- so adiciona a coluna que
// ainda nao existir no cabecalho, entao chamar de novo nao duplica nada
// e nenhuma linha de dado e lida ou alterada. Nao e chamada por nenhuma
// action do Roteador -- e chamada internamente pela propria
// reabrirOportunidade_ (autocontida, dentro do mesmo lock) no inicio de
// cada reabertura, entao a migracao acontece sozinha, de forma lazy e
// idempotente, na primeira vez que a funcionalidade for usada em
// producao -- sem precisar de execucao manual avulsa nem de expor
// nenhuma action sem sessao.
function configurarColunasReabertura_() {
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var nomesColunas = ['reaberto_em', 'reaberto_por'];
  var adicionadas = [];
  nomesColunas.forEach(function (nomeColuna) {
    if (cabecalho.indexOf(nomeColuna) === -1) {
      var novaCol = aba.getLastColumn() + 1;
      aba.getRange(1, novaCol).setValue(nomeColuna);
      cabecalho.push(nomeColuna);
      adicionadas.push({ coluna: nomeColuna, coluna1based: novaCol });
    }
  });
  if (adicionadas.length === 0) {
    return { acao: 'nenhuma', motivo: 'reaberto_em e reaberto_por ja existem no cabecalho -- nada a fazer.', cabecalho: cabecalho };
  }
  return { acao: 'adicionada', adicionadas: adicionadas, cabecalho: cabecalho };
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

// Hotfix "Visibilidade por Usuário" (2026-08-10): este endpoint recebe o
// id da oportunidade diretamente na query string -- exatamente o tipo de
// chamada que o CEO pediu para testar ("manipulando a requisição"). Antes,
// qualquer usuário autenticado (qualquer papel) conseguia ler a anotação
// de QUALQUER oportunidade só sabendo o id, mesmo sem ela aparecer na
// listagem dele. Agora, para SDR/Closer, confere que a oportunidade
// encontrada é mesmo da carteira dele antes de devolver o texto -- mesma
// regra de listOportunidades_, aplicada aqui porque esta função busca por
// id direto, não por listagem.
function obterAnotacao_(oportunidadeId, usuarioAutenticado) {
  if (!oportunidadeId) {
    throw new Error('oportunidadeId obrigatorio.');
  }
  if (!usuarioAutenticado) {
    throw new Error('obterAnotacao_ requer usuarioAutenticado (contexto de sessao) por seguranca.');
  }
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var encontrada = encontrarLinhaOportunidade_(aba, oportunidadeId);
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
function moverEtapaOportunidade_(oportunidadeId, novaEtapaId, motivoPerdaId, motivoPerdaOutroTexto, usuarioId, visitaAgendadaEm) {
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

    // Melhoria isolada "Visita Agendada com data e hora" (2026-08-24) --
    // segunda camada de validação (a primeira é o frontend, ver
    // moverEtapa em Pipeline.tsx/confirmarMovimento em SidePanel.tsx):
    // data/hora só são exigidas quando o DESTINO é Visita Agendada, nunca
    // em nenhuma outra etapa -- mesma filosofia da validação de motivo de
    // perda acima.
    if (etapaNova.nome === 'Visita Agendada' && !visitaAgendadaEm) {
      throw new Error('Data e horario da visita sao obrigatorios ao mover para Visita Agendada.');
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
      // Ciclo 22 "Funil Comercial — Bloco 3" (2026-08-12): snapshot de quem
      // era o responsável pela oportunidade neste EXATO instante -- lido da
      // própria linha antes de qualquer escrita desta chamada, então não
      // pode ter sido afetado por uma transferência concorrente (mesmo lock
      // que protege o resto desta função). Diferente de `perdido_por`
      // (usuarioId, quem executou a ação) e do `responsavel_id` atual (que
      // pode mudar depois se a oportunidade for transferida após a perda --
      // transferirOportunidade_ não bloqueia isso). Coluna opcional: se a
      // migração configurarColunaResponsavelPerda_ ainda não rodou,
      // gravarCamposLinha_ simplesmente ignora o campo (mesmo padrão
      // defensivo já usado em excluido_em/veiculo_estoque_*).
      var colResponsavelAtual = cabecalho.indexOf('responsavel_id');
      campos.responsavel_no_momento_perda_id = colResponsavelAtual !== -1 ? encontrada.linhaValores[colResponsavelAtual] : '';
    }

    // Melhoria isolada "Data da venda" (2026-08-24) -- grava vendido_em/
    // vendido_por na PRIMEIRA entrada em qualquer etapa tipo 'ganho' (hoje so
    // existe uma: Venda/Documentacao). Defensivo: nunca sobrescreve um
    // vendido_em ja gravado -- hoje isso e estruturalmente impossivel de
    // acontecer por este caminho (o guard de "etapa final" no topo desta
    // funcao ja bloqueia sair de uma etapa tipo 'ganho'/'perdido', entao nao
    // ha como "voltar" e re-entrar em Venda/Documentacao por aqui), mas o
    // check deixa o codigo seguro mesmo se essa regra mudar no futuro. Nao
    // depende de atualizado_em nem de nenhuma outra edicao -- so este bloco
    // escreve o campo, e so uma vez.
    if (etapaNova.tipo === 'ganho') {
      var colVendidoEmAtual = cabecalho.indexOf('vendido_em');
        var vendidoEmAtual = colVendidoEmAtual !== -1 ? encontrada.linhaValores[colVendidoEmAtual] : '';
          if (!vendidoEmAtual) {
              campos.vendido_em = agora;
                  campos.vendido_por = usuarioId || '';
                    }
                    }

    // Melhoria isolada "Visita Agendada com data e hora" (2026-08-24) --
    // grava a data/hora estruturada só ao ENTRAR na etapa (mesmo lock desta
    // função). Reagendamentos posteriores, com a oportunidade já em Visita
    // Agendada, usam reagendarVisita_ abaixo -- função separada, com seu
    // próprio evento de Timeline, para não sobrecarregar o evento
    // 'mudanca_etapa' com múltiplos reagendamentos.
    if (etapaNova.nome === 'Visita Agendada') {
      campos.visita_agendada_em = visitaAgendadaEm;
      campos.visita_agendada_por = usuarioId || '';
    }
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, campos);

    var descricaoEvento = 'Movida de "' + (etapaAtual ? etapaAtual.nome : '?') + '" para "' + etapaNova.nome + '"';
    if (motivo) {
      descricaoEvento += ' -- motivo: ' + motivo.nome + (motivo.nome === 'Outro' ? (' (' + motivoPerdaOutroTexto + ')') : '');
    }
    if (etapaNova.nome === 'Visita Agendada') {
      // Ata a informação da visita ao MESMO evento de mudança de etapa, em
      // vez de criar um segundo evento -- pedido explícito: não simular uma
      // movimentação extra (mesma decisão já tomada na melhoria "Etapa
      // inicial na Nova Negociação", 2026-08-22, para o caso de criação).
      descricaoEvento += ' -- visita agendada para ' + formatarDataHoraVisita_(visitaAgendadaEm);
    }
    if (etapaNova.tipo === 'ganho' && campos.vendido_em) {
      descricaoEvento += ' -- venda registrada em ' + formatarDataHoraVenda_(campos.vendido_em);
      }
    registrarEventoTimeline_(oportunidadeId, 'mudanca_etapa', descricaoEvento, usuarioId);

    return { oportunidadeId: oportunidadeId, etapaId: novaEtapaId };
  } finally {
    lock.releaseLock();
  }
}

// Melhoria isolada "Visita Agendada com data e hora" (2026-08-24) --
// reagendamento: só é permitido enquanto a oportunidade ESTÁ em Visita
// Agendada (a entrada inicial na etapa é coberta por
// moverEtapaOportunidade_ acima, que já exige data/hora ao entrar). Sem
// tabela paralela de histórico -- o valor atual fica só em
// visita_agendada_em/visita_agendada_por (sempre sobrescritos a cada
// reagendamento) e cada reagendamento vira um evento PRÓPRIO na Timeline
// (tipo 'visita_reagendada', distinto de 'mudanca_etapa'), preservando o
// rastro completo sem duplicar estrutura de dados -- mesma filosofia de
// registrarEventoTimeline_ usada em toda a base.
function reagendarVisita_(oportunidadeId, visitaAgendadaEm, usuarioId) {
  if (!oportunidadeId || !visitaAgendadaEm) {
    throw new Error('oportunidadeId e visitaAgendadaEm sao obrigatorios.');
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
    var etapaAtual = obterEtapaPorId_(encontrada.linhaValores[colEtapa]);
    if (!etapaAtual || etapaAtual.nome !== 'Visita Agendada') {
      throw new Error('So e possivel reagendar a visita enquanto a oportunidade esta em Visita Agendada.');
    }

    var colVisitaEm = cabecalho.indexOf('visita_agendada_em');
    var valorAntigo = colVisitaEm !== -1 ? encontrada.linhaValores[colVisitaEm] : '';
    var agora = new Date().toISOString();

    var oportunidadeFinal = gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, {
      visita_agendada_em: visitaAgendadaEm,
      visita_agendada_por: usuarioId || '',
      atualizado_em: agora
    });

    var usuarios = listUsuarios_();
    var atorNome = nomeUsuarioPorId_(usuarios, usuarioId);
    var descricaoEvento = valorAntigo
      ? '"' + atorNome + '" reagendou a visita de ' + formatarDataHoraVisita_(valorAntigo) + ' para ' + formatarDataHoraVisita_(visitaAgendadaEm) + '.'
      : '"' + atorNome + '" definiu a visita para ' + formatarDataHoraVisita_(visitaAgendadaEm) + '.';
    registrarEventoTimeline_(oportunidadeId, 'visita_reagendada', descricaoEvento, usuarioId);

    return { oportunidade: oportunidadeFinal };
  } finally {
    lock.releaseLock();
  }
}

// Melhoria isolada "Visita Agendada com data e hora" (2026-08-24) --
// migração de schema: adiciona as duas colunas novas exigidas pela data/
// hora estruturada da visita (ver moverEtapaOportunidade_ e
// reagendarVisita_ acima). Idempotente -- mesmo padrão de
// configurarColunaResponsavelPerda_ acima: só adiciona cada coluna se ela
// ainda não existir no cabeçalho, então rodar de novo por engano não
// duplica nada. Não é chamada por nenhuma action do Roteador -- executada
// uma única vez via URL de teste do Apps Script antes da publicação,
// mantida no código depois por documentação/idempotência (mesma
// convenção dos Ciclos 19 e 22).
function configurarColunasVisitaAgendada_() {
  var aba = getAba_(ABAS.OPORTUNIDADES);
  var colunas = ['visita_agendada_em', 'visita_agendada_por'];
  var adicionadas = [];
  colunas.forEach(function (nomeColuna) {
    var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    if (cabecalho.indexOf(nomeColuna) === -1) {
      var novaCol = aba.getLastColumn() + 1;
      aba.getRange(1, novaCol).setValue(nomeColuna);
      adicionadas.push(nomeColuna);
    }
  });
  return { acao: adicionadas.length ? 'adicionada' : 'nenhuma', colunas: adicionadas };
}


// Item 5 "Reabrir oportunidade perdida" (Ciclo 22, 2026-08-18) -- permite
// devolver ao Pipeline ativo uma oportunidade que esta em Perdido, sem
// apagar nem sobrescrever o historico da perda. Acao deliberada e
// SEPARADA de moverEtapaOportunidade_ (que continua recusando qualquer
// movimentacao para fora de ganho/perdido nas duas camadas de sempre --
// frontend e aqui) -- so e possivel reabrir por esta funcao. Grava
// apenas etapa_id/atualizado_em/reaberto_em/reaberto_por; NUNCA toca em
// perdido_em/perdido_por/motivo_perda_id/motivo_perda_descricao_outro/
// etapa_origem_perda_id/responsavel_no_momento_perda_id -- esses campos
// continuam representando a perda mais recente (historico completo de
// TODOS os ciclos perda/reabertura vive na Timeline via
// registrarEventoTimeline_, nunca sobrescrita). reaberto_em/reaberto_por
// tambem sao so um snapshot da reabertura mais recente, pelo mesmo
// motivo -- consulte a Timeline (tipoEvento 'reabertura') para o
// historico completo de reaberturas.
function reabrirOportunidade_(oportunidadeId, novaEtapaId, usuarioId) {
  if (!oportunidadeId || !novaEtapaId) {
    throw new Error('oportunidadeId e novaEtapaId sao obrigatorios.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Garante que as colunas reaberto_em/reaberto_por existam antes da
    // primeira gravacao -- idempotente (configurarColunasReabertura_ so
    // adiciona o que ainda nao existir), autocontido, e dentro do mesmo
    // lock desta funcao, entao nao ha corrida com outra chamada
    // concorrente. Evita depender de uma execucao manual avulsa da
    // migracao antes do primeiro uso em producao.
    configurarColunasReabertura_();
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

    if (!etapaAtual || etapaAtual.tipo !== 'perdido') {
      throw new Error('So e possivel reabrir oportunidades que estao em Perdido.');
    }
    if (!etapaNova) {
      throw new Error('Etapa de destino invalida: ' + novaEtapaId);
    }
    if (etapaNova.tipo === 'ganho' || etapaNova.tipo === 'perdido') {
      throw new Error('Etapa de destino da reabertura precisa ser uma etapa ativa do funil.');
    }

    var agora = new Date().toISOString();
    var campos = { etapa_id: novaEtapaId, atualizado_em: agora, reaberto_em: agora, reaberto_por: usuarioId || '' };
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, campos);

    var descricaoEvento = 'Reaberta de "' + etapaAtual.nome + '" para "' + etapaNova.nome + '"';
    registrarEventoTimeline_(oportunidadeId, 'reabertura', descricaoEvento, usuarioId);

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
    // Melhoria 2 (2026-10-07): usuario inativo nao recebe oportunidade transferida.
    exigirUsuarioAtivoParaAtribuicao_(usuarios, novoResponsavelId);

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
 * Melhoria 8 (2026-10-07) -- estrutura do snapshot do veiculo do estoque na
 * oportunidade. Contexto: o cabecalho das 8 colunas veiculo_estoque_* da
 * aba Oportunidades estava colado em UMA unica celula (nomes separados por
 * TAB) e as colunas seguintes sem titulo; como gravarCamposLinha_ e
 * adicionarLinhaPorCabecalho_ ignoram em silencio nomes que nao existem no
 * cabecalho, o snapshot nunca foi gravado. A partir daqui, associar veiculo
 * (e criar oportunidade ja com veiculo) EXIGE a estrutura correta: se algum
 * cabecalho obrigatorio faltar (ou o formato texto de id/ano/associado_em
 * nao estiver aplicado) a operacao falha com erro explicito, sem gravar
 * nada, e o erro tambem vai para o log de execucoes (console.error).
 * O snapshot e o registro comercial do que o cliente quis naquele momento;
 * o frontend continua mostrando o dado ao vivo do feed por cima, quando o
 * id ainda esta no estoque. Nao ha preenchimento retroativo do historico.
 */
var CAMPOS_SNAPSHOT_VEICULO_ESTOQUE = [
  'veiculo_estoque_id',
  'veiculo_estoque_marca',
  'veiculo_estoque_modelo_versao',
  'veiculo_estoque_ano',
  'veiculo_estoque_km',
  'veiculo_estoque_preco',
  'veiculo_estoque_imagem',
  'veiculo_estoque_associado_em'
];

// Campos que precisam ficar como TEXTO na planilha (a coluna e formatada
// como "texto simples"): id (nao pode perder zeros nem virar numero), ano
// no formato "AAAA/AAAA" (nao pode virar data/numero) e o timestamp ISO.
var CAMPOS_SNAPSHOT_VEICULO_TEXTO = [
  'veiculo_estoque_id',
  'veiculo_estoque_ano',
  'veiculo_estoque_associado_em'
];

function falharSnapshotVeiculo_(codigo, detalhe) {
  var mensagem = codigo + ': ' + detalhe;
  console.error(mensagem);
  throw new Error(mensagem);
}

// Valida a estrutura da aba Oportunidades para gravar o snapshot. Nao grava
// nada. 'cabecalho' e a primeira linha ja lida pelo chamador.
function exigirEstruturaSnapshotVeiculoEstoque_(aba, cabecalho) {
  var ausentes = CAMPOS_SNAPSHOT_VEICULO_ESTOQUE.filter(function (nome) {
    return cabecalho.indexOf(nome) === -1;
  });
  if (ausentes.length > 0) {
    falharSnapshotVeiculo_(
      'SNAPSHOT_VEICULO_CABECALHO_AUSENTE',
      'a aba Oportunidades nao tem o(s) cabecalho(s) obrigatorio(s) [' + ausentes.join(', ') + ']. ' +
      'Nada foi gravado. Corrija a estrutura da planilha (migrarVeiculoEstoqueCabecalhos_) antes de associar veiculos.'
    );
  }
  var duplicados = CAMPOS_SNAPSHOT_VEICULO_ESTOQUE.filter(function (nome) {
    return cabecalho.indexOf(nome) !== cabecalho.lastIndexOf(nome);
  });
  if (duplicados.length > 0) {
    falharSnapshotVeiculo_(
      'SNAPSHOT_VEICULO_CABECALHO_DUPLICADO',
      'cabecalho(s) repetido(s) na aba Oportunidades: [' + duplicados.join(', ') + ']. Nada foi gravado.'
    );
  }
  if (aba.getLastRow() >= 2) {
    var semFormatoTexto = CAMPOS_SNAPSHOT_VEICULO_TEXTO.filter(function (nome) {
      return aba.getRange(2, cabecalho.indexOf(nome) + 1).getNumberFormat() !== '@';
    });
    if (semFormatoTexto.length > 0) {
      falharSnapshotVeiculo_(
        'SNAPSHOT_VEICULO_FORMATO_INVALIDO',
        'a(s) coluna(s) [' + semFormatoTexto.join(', ') + '] da aba Oportunidades nao esta(o) formatada(s) como texto simples ' +
        '(o id/ano poderiam ser convertidos em numero ou data). Nada foi gravado.'
      );
    }
  }
}

// Snapshot do veiculo NO MOMENTO da associacao (mesmos nomes/valores que o
// desenho original da Sprint 3 ja previa; id e ano sempre como texto).
function montarSnapshotVeiculoEstoque_(veiculo, agoraIso) {
  return {
    veiculo_estoque_id: String(veiculo.id),
    veiculo_estoque_marca: veiculo.marca || '',
    veiculo_estoque_modelo_versao: veiculo.modeloVersao || '',
    veiculo_estoque_ano: veiculo.ano ? String(veiculo.ano) : '',
    veiculo_estoque_km: (veiculo.km !== null && veiculo.km !== undefined) ? veiculo.km : '',
    veiculo_estoque_preco: (veiculo.preco !== null && veiculo.preco !== undefined) ? veiculo.preco : '',
    veiculo_estoque_imagem: veiculo.imagemPrincipal || '',
    veiculo_estoque_associado_em: agoraIso
  };
}

// Releitura da linha logo apos gravar: devolve a lista de campos do
// snapshot cujo valor gravado difere do esperado ([] = tudo certo).
function conferirSnapshotGravado_(aba, linha, cabecalho, snapshot) {
  var gravado = aba.getRange(linha, 1, 1, cabecalho.length).getValues()[0];
  return CAMPOS_SNAPSHOT_VEICULO_ESTOQUE.filter(function (nome) {
    var esperado = snapshot[nome];
    var lido = gravado[cabecalho.indexOf(nome)];
    if (nome === 'veiculo_estoque_associado_em') {
      return lido === '' || lido === null || lido === undefined;
    }
    if (typeof esperado === 'number') {
      return lido === '' || Number(lido) !== esperado;
    }
    return String(lido) !== String(esperado);
  });
}

function textoEventoAssociacaoVeiculo_(nomeUsuario, descricaoVeiculo, veiculoId) {
  return '"' + nomeUsuario + '" associou o veiculo "' + descricaoVeiculo + '" (Simples #' + veiculoId + ') a oportunidade.';
}

// Migracao (rodar UMA vez, manualmente, depois de backup): conserta os
// cabecalhos SEM mover nenhuma coluna existente. Renomeia no lugar as
// colunas 20-26 (T-Z) e acrescenta veiculo_estoque_associado_em como NOVA
// ULTIMA coluna (excluido_em e todas as colunas seguintes ficam onde estao).
// Idempotente e conservadora: so age se a estrutura for exatamente a
// encontrada no diagnostico (celula 20 com os 8 nomes colados por TAB,
// 21-26 sem titulo, 27 = excluido_em, colunas 20-26 sem nenhum dado);
// qualquer coisa diferente aborta sem alterar nada. Nao toca em nenhuma
// linha de dados. simular=true so devolve o plano.
function migrarVeiculoEstoqueCabecalhos_(simular) {
  var NOMES = CAMPOS_SNAPSHOT_VEICULO_ESTOQUE;
  var COL_INICIAL = 20;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = getAba_(ABAS.OPORTUNIDADES);
    var ultimaCol = aba.getLastColumn();
    var cab = aba.getRange(1, 1, 1, ultimaCol).getValues()[0];
    var presentes = NOMES.filter(function (n) { return cab.indexOf(n) !== -1; });

    if (presentes.length === NOMES.length) {
      return { status: 'ja_migrado', cabecalho: cab };
    }

    var problemas = [];
    if (cab[COL_INICIAL - 1] !== NOMES.join('\t')) problemas.push('coluna 20 nao contem os 8 nomes colados por TAB');
    for (var c = COL_INICIAL; c < COL_INICIAL + 6; c++) {
      if (cab[c] !== '') problemas.push('coluna ' + (c + 1) + ' ja tem cabecalho');
    }
    if (cab[COL_INICIAL + 6] !== 'excluido_em') problemas.push('coluna 27 nao e excluido_em');
    if (cab[ultimaCol - 1] === '') problemas.push('ultima coluna sem cabecalho');
    if (presentes.length > 0) problemas.push('ja existem cabecalhos veiculo_estoque_* soltos: ' + presentes.join(','));
    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha >= 2) {
      var dadosNasColunas = aba.getRange(2, COL_INICIAL, ultimaLinha - 1, 7).getValues();
      var temDado = dadosNasColunas.some(function (linha) {
        return linha.some(function (v) { return v !== '' && v !== null; });
      });
      if (temDado) problemas.push('ha dados nas colunas 20-26');
    }
    if (problemas.length > 0) {
      throw new Error('MIGRACAO_VEICULO_ESTOQUE_ESTRUTURA_INESPERADA: ' + problemas.join('; ') + ' -- nada foi alterado.');
    }

    var novaCol = ultimaCol + 1;
    if (simular) {
      return { status: 'simulacao_ok', renomear_colunas_20_a_26: NOMES.slice(0, 7), nova_coluna: novaCol, nome_nova_coluna: NOMES[7] };
    }

    aba.getRange(1, COL_INICIAL, 1, 7).setValues([NOMES.slice(0, 7)]);
    if (aba.getMaxColumns() < novaCol) {
      aba.insertColumnsAfter(aba.getMaxColumns(), novaCol - aba.getMaxColumns());
    }
    aba.getRange(1, novaCol).setValue(NOMES[7]);
    aba.getRange(1, COL_INICIAL - 1).copyTo(aba.getRange(1, COL_INICIAL, 1, 7), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    aba.getRange(1, ultimaCol).copyTo(aba.getRange(1, novaCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    var colunasTexto = CAMPOS_SNAPSHOT_VEICULO_TEXTO.map(function (n) { return NOMES.indexOf(n) < 7 ? COL_INICIAL + NOMES.indexOf(n) : novaCol; });
    colunasTexto.forEach(function (col) {
      aba.getRange(2, col, Math.max(aba.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
    SpreadsheetApp.flush();
    return { status: 'migrado', nova_coluna: novaCol, cabecalho: aba.getRange(1, 1, 1, novaCol).getValues()[0] };
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
    exigirEstruturaSnapshotVeiculoEstoque_(aba, cabecalho);
    var snapshotVeiculo = montarSnapshotVeiculoEstoque_(veiculo, agora);
    var camposAssociacao = { veiculo_interesse: descricaoVeiculo, atualizado_em: agora };
    CAMPOS_SNAPSHOT_VEICULO_ESTOQUE.forEach(function (nome) {
      camposAssociacao[nome] = snapshotVeiculo[nome];
    });
    gravarCamposLinha_(aba, encontrada.linha, cabecalho, encontrada.linhaValores, camposAssociacao);
    var divergentes = conferirSnapshotGravado_(aba, encontrada.linha, cabecalho, snapshotVeiculo);
    if (divergentes.length > 0) {
      // Restaura a linha como estava e nao devolve sucesso (nem gera evento de Timeline).
      aba.getRange(encontrada.linha, 1, 1, cabecalho.length).setValues([encontrada.linhaValores]);
      falharSnapshotVeiculo_(
        'SNAPSHOT_VEICULO_NAO_PERSISTIDO',
        'campo(s) [' + divergentes.join(', ') + '] nao foram gravados como esperado na oportunidade ' + oportunidadeId +
        '; a linha foi restaurada ao estado anterior e nenhuma associacao foi registrada.'
      );
    }

    // Sprint 8: usa a lista cacheada (listUsuarios_) e o helper
    // compartilhado nomeUsuarioPorId_ (Utils.gs, mesmo fallback 'Alguem'
    // que já era usado aqui) em vez de reler Usuarios direto.
    var usuarios = listUsuarios_();

    registrarEventoTimeline_(
      oportunidadeId,
      'veiculo_associado',
      textoEventoAssociacaoVeiculo_(nomeUsuarioPorId_(usuarios, usuarioId), descricaoVeiculo, veiculo.id),
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
  // Melhoria 2 (2026-10-07): usuario inativo nao recebe nova oportunidade.
  exigirUsuarioAtivoParaAtribuicao_(usuarios, responsavelId);

  var etapas = listEtapas_();
  var etapaNovoLead = null;
  for (var i = 0; i < etapas.length; i++) {
    if (etapas[i].nome === 'Novo Lead') { etapaNovoLead = etapas[i]; break; }
  }
  if (!etapaNovoLead) {
    throw new Error('Etapa "Novo Lead" nao encontrada na aba Etapas.');
  }

  // Melhoria isolada "Etapa inicial na Nova Negociacao" (2026-08-22):
  // etapaInicialId e opcional -- ausente/undefined preserva exatamente o
  // comportamento anterior (sempre Novo Lead). Quando informado, so aceita
  // etapas ATIVAS do funil (nunca Perdido nem Venda/Documentacao) -- reusa
  // obterEtapaPorId_ (mesmo helper que moverEtapaOportunidade_ ja usa),
  // nenhuma etapa nova e criada.
  var etapaInicial = etapaNovoLead;
  if (dados.etapaInicialId) {
    var etapaEscolhida = obterEtapaPorId_(dados.etapaInicialId);
    if (!etapaEscolhida) {
      throw new Error('Etapa inicial invalida: ' + dados.etapaInicialId);
    }
    if (etapaEscolhida.tipo !== 'ativa') {
      throw new Error('Etapa inicial deve ser uma etapa ativa do funil (nao pode ser "' + etapaEscolhida.nome + '").');
    }
    etapaInicial = etapaEscolhida;
  }

  // Melhoria 8: resolve o veiculo do estoque e valida a estrutura do snapshot
  // ANTES de qualquer escrita (cliente/oportunidade), para falhar sem efeito
  // colateral se a planilha estiver sem os cabecalhos obrigatorios.
  var veiculoEstoque = dados.veiculoEstoqueId ? obterVeiculoEstoquePorId_(dados.veiculoEstoqueId) : null;
  if (veiculoEstoque) {
    var abaOportunidadesPre = getAba_(ABAS.OPORTUNIDADES);
    exigirEstruturaSnapshotVeiculoEstoque_(
      abaOportunidadesPre,
      abaOportunidadesPre.getRange(1, 1, 1, abaOportunidadesPre.getLastColumn()).getValues()[0]
    );
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
    // Ciclo "Refinamentos Operacionais" (2026-08-18) -- item 4: vinculo
    // opcional com veiculo do estoque ja na criacao (antes so era possivel
    // associar depois, pelo SidePanel). Mesmo snapshot congelado (marca/
    // modelo/ano/km/preco/imagem) que associarVeiculoEstoque_ ja grava,
    // reaproveitado aqui -- se o id nao existir mais no estoque, ignora
    // silenciosamente (nao bloqueia a criacao da oportunidade por causa de
    // um veiculo que saiu do feed entre a busca e o salvar).
    // (veiculoEstoque ja resolvido antes do lock -- Melhoria 8)
    var descricaoVeiculoEstoque = veiculoEstoque
      ? [veiculoEstoque.marca, veiculoEstoque.modeloVersao, veiculoEstoque.ano].filter(function (v) { return !!v; }).join(' ')
      : '';

    var oportunidade = {
      id: oportunidadeId,
      cliente_id: cliente.id,
      etapa_id: etapaInicial.id,
      responsavel_id: responsavelId,
      proxima_acao: dados.proximaAcao || '',
      proxima_acao_data: dados.proximaAcaoData || '',
      veiculo_interesse: descricaoVeiculoEstoque || dados.veiculoInteresse || '',
      origem_id: origemId,
      anotacoes: dados.anotacoesIniciais || '',
      criado_em: agora,
      atualizado_em: agora
    };
    // Melhoria 8: snapshot estruturado do veiculo no momento da criacao (mesmos
    // nomes de campo da associacao posterior) + conferencia apos gravar.
    var snapshotVeiculo = null;
    if (veiculoEstoque) {
      snapshotVeiculo = montarSnapshotVeiculoEstoque_(veiculoEstoque, agora);
      CAMPOS_SNAPSHOT_VEICULO_ESTOQUE.forEach(function (nome) {
        oportunidade[nome] = snapshotVeiculo[nome];
      });
    }
    var abaOportunidades = getAba_(ABAS.OPORTUNIDADES);
    adicionarLinhaPorCabecalho_(abaOportunidades, oportunidade);
    if (snapshotVeiculo) {
      var linhaCriada = abaOportunidades.getLastRow();
      var cabecalhoCriada = abaOportunidades.getRange(1, 1, 1, abaOportunidades.getLastColumn()).getValues()[0];
      var linhaEhNossa = String(abaOportunidades.getRange(linhaCriada, cabecalhoCriada.indexOf('id') + 1).getValue()) === String(oportunidadeId);
      var divergentesCriacao = linhaEhNossa
        ? conferirSnapshotGravado_(abaOportunidades, linhaCriada, cabecalhoCriada, snapshotVeiculo)
        : ['linha_criada_nao_localizada'];
      if (divergentesCriacao.length > 0) {
        if (linhaEhNossa) {
          abaOportunidades.getRange(linhaCriada, 1, 1, cabecalhoCriada.length).clearContent();
        }
        falharSnapshotVeiculo_(
          'SNAPSHOT_VEICULO_NAO_PERSISTIDO',
          'campo(s) [' + divergentesCriacao.join(', ') + '] nao foram gravados como esperado ao criar a oportunidade; ' +
          'a linha recem-criada foi esvaziada e nenhuma oportunidade foi registrada.'
        );
      }
    }

    var usuarioAtorId = dados.usuarioId || responsavelId;
    var descricaoEvento = '"' + nomeUsuarioPorId_(usuarios, usuarioAtorId) + '" criou a oportunidade' +
      (String(usuarioAtorId) !== String(responsavelId)
        ? ' (responsavel: "' + nomeUsuarioPorId_(usuarios, responsavelId) + '")'
        : '') +
      // Melhoria isolada "Etapa inicial na Nova Negociacao" (2026-08-22):
      // so aparece quando a oportunidade nasceu fora de Novo Lead -- e so
      // registrado AQUI, dentro do mesmo evento "criacao", para nunca gerar
      // um evento "mudanca_etapa" fabricado (Novo Lead -> etapa escolhida)
      // que nunca aconteceu de verdade.
      (String(etapaInicial.id) !== String(etapaNovoLead.id)
        ? ' ja na etapa "' + etapaInicial.nome + '"'
        : '') + '.';
    registrarEventoTimeline_(oportunidadeId, 'criacao', descricaoEvento, usuarioAtorId);
    if (snapshotVeiculo) {
      // Melhoria 8: mesmo evento que a associacao posterior gera (so um por criacao).
      registrarEventoTimeline_(
        oportunidadeId,
        'veiculo_associado',
        textoEventoAssociacaoVeiculo_(nomeUsuarioPorId_(usuarios, usuarioAtorId), descricaoVeiculoEstoque, veiculoEstoque.id),
        usuarioAtorId
      );
    }

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
    // Melhoria 2 (2026-10-07): usuario inativo nao recebe nova Proxima Acao.
    exigirUsuarioAtivoParaAtribuicao_(usuarios, responsavelId);

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
