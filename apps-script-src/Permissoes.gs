/**
 * Permissoes.gs -- Melhoria 9, Fase 2A (2026-10-08).
 * Autorizacao central das operacoes HUMANAS de escrita.
 *
 * Principios:
 *  - O backend e a autoridade. O frontend nao e camada de seguranca.
 *  - O ator de uma acao humana e SEMPRE o usuario da sessao autenticada.
 *    O "usuarioId" enviado no corpo da requisicao e sobrescrito pelo id da
 *    sessao antes de chegar ao handler (corrige vendido_por, perdido_por,
 *    excluido_por, reaberto_por, visita_agendada_por e o usuario_id de
 *    todos os eventos da Timeline). Nao ha confianca no valor do navegador.
 *  - A decisao mora em UM unico lugar (decidirAutorizacaoEscrita_) e e
 *    aplicada por UM unico ponto de entrada (aplicarAutorizacaoEscrita_),
 *    chamado pelo doPost (Roteador.gs) somente para acoes HUMANAS. Os
 *    webhooks (ACOES_POST_SEM_SESSAO: WhatsApp e Mobiauto) autenticam por
 *    secret proprio, nao passam por aqui e continuam como estavam. As
 *    funcoes de baixo nivel (criarOportunidade_, registrarEventoTimeline_
 *    etc.) NAO contem regra de autorizacao, de proposito: assim as
 *    integracoes continuam funcionando.
 *  - Autorizacao nao substitui regra de negocio: transicoes de etapa,
 *    validacoes e erros funcionais continuam nos handlers.
 *
 * Modo de operacao (Script Property AUTORIZACAO_ESCRITA_MODO):
 *   'observar' (padrao quando ausente/invalida): calcula a decisao e
 *              registra na aba AutorizacaoLog o que seria negado, sem
 *              bloquear nada.
 *   'aplicar'  : nega de fato (erro claro, sem escrita parcial).
 * Troca: executar autorizacaoEscritaModoObservar() / autorizacaoEscritaModoAplicar()
 * no editor do Apps Script (nao ha rota web para isso).
 *
 * Politica aprovada (resumo -- matriz completa no doc da Fase 2A):
 *  - Gerente/Administrador: todas as operacoes humanas do fluxo normal, em
 *    qualquer oportunidade nao excluida.
 *  - Responsavel atual: operacoes normais da propria carteira; excluir
 *    somente enquanto a oportunidade estiver ativa (etapa tipo 'ativa').
 *  - Visao global (visualiza_todas_oportunidades) SEM papel gerencial, em
 *    carteira alheia: apenas acoes OPERACIONAIS (anotacao, proxima acao,
 *    checklist, visita, veiculo) e, como excecao, transferir quando o
 *    responsavel atual esta inativo (ou inexistente).
 *  - Usuario inativo: nenhuma escrita humana.
 *  - Oportunidade excluida: nenhuma escrita humana.
 */

var AUTORIZACAO_ESCRITA_PROP_MODO_ = 'AUTORIZACAO_ESCRITA_MODO';
var AUTORIZACAO_ESCRITA_ABA_LOG_ = 'AutorizacaoLog';
var AUTORIZACAO_ESCRITA_CABECALHO_LOG_ = [
  'data_hora', 'modo', 'acao', 'usuario_id', 'usuario_papel',
  'oportunidade_id', 'responsavel_id', 'decisao', 'motivo', 'detalhe'
];
var MENSAGEM_SEM_PERMISSAO_ESCRITA_ = 'Você não possui permissão para realizar esta ação nesta oportunidade.';
var MENSAGEM_USUARIO_INATIVO_ESCRITA_ = 'Seu usuário está inativo e não pode realizar esta ação.';

// Somente para testes (variavel de execucao, nao e alcancavel pela web).
var _modoAutorizacaoTeste_ = null;

/**
 * Classes de acao:
 *  criar         -- qualquer usuario ativo.
 *  operacional   -- Gerente/Admin, responsavel atual, ou visao global.
 *  responsavel   -- Gerente/Admin ou responsavel atual.
 *  transferencia -- Gerente/Admin, responsavel atual, ou visao global quando
 *                   o responsavel atual esta inativo/inexistente.
 *  exclusao      -- Gerente/Admin; responsavel atual somente se etapa 'ativa'.
 * Toda acao humana de escrita DEVE constar aqui; acao sem politica e negada
 * (em modo aplicar) e registrada (em ambos os modos).
 */
var POLITICA_ESCRITA_ = {
  criarOportunidade:            { classe: 'criar',         rotulo: 'criar' },
  salvarAnotacao:               { classe: 'operacional',   rotulo: 'anotacao' },
  atualizarProximaAcao:         { classe: 'operacional',   rotulo: 'proxima_acao' },
  concluirProximaAcao:          { classe: 'operacional',   rotulo: 'proxima_acao_concluir' },
  marcarItemChecklist:          { classe: 'operacional',   rotulo: 'checklist' },
  reagendarVisita:              { classe: 'operacional',   rotulo: 'visita' },
  associarVeiculoEstoque:       { classe: 'operacional',   rotulo: 'veiculo' },
  editarDadosOportunidade:      { classe: 'responsavel',   rotulo: 'editar_dados' },
  moverEtapaOportunidade:       { classe: 'responsavel',   rotulo: 'mover_etapa' },
  reabrirOportunidade:          { classe: 'responsavel',   rotulo: 'reabrir' },
  enviarMensagemWhatsapp:       { classe: 'responsavel',   rotulo: 'whatsapp_enviar' },
  vincularConversaOportunidade: { classe: 'responsavel',   rotulo: 'whatsapp_vincular' },
  transferirOportunidade:       { classe: 'transferencia', rotulo: 'transferir' },
  excluirOportunidade:          { classe: 'exclusao',      rotulo: 'excluir' }
};

function obterModoAutorizacaoEscrita_() {
  if (_modoAutorizacaoTeste_) { return _modoAutorizacaoTeste_; }
  var valor = String(PropertiesService.getScriptProperties().getProperty(AUTORIZACAO_ESCRITA_PROP_MODO_) || '').toLowerCase();
  return valor === 'aplicar' ? 'aplicar' : 'observar';
}

function autorizacaoEscritaModoAtual() {
  return obterModoAutorizacaoEscrita_();
}

function autorizacaoEscritaModoObservar() {
  PropertiesService.getScriptProperties().setProperty(AUTORIZACAO_ESCRITA_PROP_MODO_, 'observar');
  return obterModoAutorizacaoEscrita_();
}

function autorizacaoEscritaModoAplicar() {
  PropertiesService.getScriptProperties().setProperty(AUTORIZACAO_ESCRITA_PROP_MODO_, 'aplicar');
  return obterModoAutorizacaoEscrita_();
}

function autorizacaoUsuarioAtivo_(usuario) {
  if (!usuario) { return false; }
  return usuario.ativo === true || String(usuario.ativo).toUpperCase() === 'TRUE';
}

// Mesma fonte de verdade da visao completa (Auth.gs): papeis gerenciais.
function autorizacaoGerenteOuAdmin_(usuario) {
  return !!usuario && !!PAPEIS_VISAO_COMPLETA_[usuario.papel];
}

/**
 * Le somente o necessario da oportunidade. Nao escreve nada.
 * Responsavel "inativo" para a excecao de transferencia = usuario com
 * ativo != TRUE, nao encontrado, ou responsavel_id vazio (carteira orfa).
 */
function obterContextoOportunidadeAutorizacao_(oportunidadeId, precisaStatusResponsavel) {
  if (!oportunidadeId) { return { existe: false }; }
  var aba = getAba_(ABAS.OPORTUNIDADES);
  // Leituras direcionadas (cabecalho + coluna id + 1 linha) em vez do
  // getDataRange completo: o guard roda em TODA escrita humana.
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = aba.getLastColumn();
  if (ultimaLinha < 2) { return { existe: false }; }
  var cab = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
  var colId = cab.indexOf('id');
  if (colId === -1) {
    throw new Error('Coluna "id" nao encontrada na aba Oportunidades.');
  }
  var ids = aba.getRange(2, colId + 1, ultimaLinha - 1, 1).getValues();
  var alvo = -1;
  for (var k = 0; k < ids.length; k++) {
    if (String(ids[k][0]) === String(oportunidadeId)) { alvo = k + 2; break; }
  }
  if (alvo === -1) { return { existe: false }; }
  var v = aba.getRange(alvo, 1, 1, ultimaColuna).getValues()[0];
  var colExcluido = cab.indexOf('excluido_em');
  var etapaId = v[cab.indexOf('etapa_id')];
  var etapa = obterEtapaPorId_(etapaId);
  var responsavelId = v[cab.indexOf('responsavel_id')];
  responsavelId = (responsavelId === null || responsavelId === undefined) ? '' : String(responsavelId);
  var contexto = {
    existe: true,
    excluida: colExcluido !== -1 && !!v[colExcluido],
    responsavelId: responsavelId,
    etapaId: etapaId,
    etapaTipo: etapa ? String(etapa.tipo) : ''
  };
  if (precisaStatusResponsavel) {
    var inativo = true;
    if (responsavelId !== '') {
      var usuarios = listUsuarios_();
      for (var i = 0; i < usuarios.length; i++) {
        if (String(usuarios[i].id) === responsavelId) {
          inativo = !autorizacaoUsuarioAtivo_(usuarios[i]);
          break;
        }
      }
    }
    contexto.responsavelInativo = inativo;
  }
  return contexto;
}

/**
 * Funcao PURA (sem I/O): toda a politica esta aqui.
 * usuario  : { id, papel, ativo, visualiza_todas_oportunidades }
 * politica : item de POLITICA_ESCRITA_
 * contexto : retorno de obterContextoOportunidadeAutorizacao_ (ou null p/ 'criar')
 * retorna  : { permitido: boolean, motivo: string }
 */
function decidirAutorizacaoEscrita_(usuario, politica, contexto) {
  function sim(m) { return { permitido: true, motivo: m }; }
  function nao(m) { return { permitido: false, motivo: m }; }

  if (!usuario) { return nao('SEM_USUARIO'); }
  if (!autorizacaoUsuarioAtivo_(usuario)) { return nao('USUARIO_INATIVO'); }
  if (!politica) { return nao('ACAO_SEM_POLITICA'); }
  if (politica.classe === 'criar') { return sim('CRIAR_USUARIO_ATIVO'); }
  if (!contexto || !contexto.existe) {
    // Nada a proteger: o handler responde "Oportunidade nao encontrada".
    return sim('OPORTUNIDADE_NAO_ENCONTRADA');
  }
  if (contexto.excluida) { return nao('OPORTUNIDADE_EXCLUIDA'); }

  var gerente = autorizacaoGerenteOuAdmin_(usuario);
  var responsavel = contexto.responsavelId !== '' && String(contexto.responsavelId) === String(usuario.id);

  if (politica.classe === 'exclusao') {
    if (gerente) { return sim('GERENTE_ADMIN'); }
    if (responsavel) {
      return contexto.etapaTipo === 'ativa' ? sim('RESPONSAVEL_ATIVA') : nao('EXCLUSAO_FINALIZADA_SOMENTE_GERENTE_ADMIN');
    }
    return nao(usuarioTemVisaoCompleta_(usuario) ? 'VISAO_GLOBAL_NAO_PERMITE_ACAO' : 'NAO_E_RESPONSAVEL');
  }

  if (gerente) { return sim('GERENTE_ADMIN'); }
  if (responsavel) { return sim('RESPONSAVEL_ATUAL'); }

  var visaoGlobal = usuarioTemVisaoCompleta_(usuario);
  if (visaoGlobal && politica.classe === 'operacional') { return sim('VISAO_GLOBAL_OPERACIONAL'); }
  if (visaoGlobal && politica.classe === 'transferencia' && contexto.responsavelInativo === true) {
    return sim('VISAO_GLOBAL_CARTEIRA_INATIVA');
  }
  return nao(visaoGlobal ? 'VISAO_GLOBAL_NAO_PERMITE_ACAO' : 'NAO_E_RESPONSAVEL');
}

/**
 * Ponto unico de entrada (chamado pelo doPost para acoes humanas).
 * - Sobrescreve dados.usuarioId com o id da sessao (ator confiavel).
 * - Calcula a decisao; em 'observar' registra e segue; em 'aplicar' nega
 *   (lanca erro ANTES de qualquer escrita).
 * Retorna o proprio objeto "dados" (ja com o ator da sessao).
 */
function aplicarAutorizacaoEscrita_(acao, dados, usuarioAutenticado) {
  dados = dados || {};
  var modo = obterModoAutorizacaoEscrita_();
  var politica = POLITICA_ESCRITA_[acao] || null;
  var contexto = null;
  var decisao;
  var detalhe = [];
  var rotulo = politica ? politica.rotulo : String(acao);

  try {
    if (politica && politica.classe !== 'criar') {
      contexto = obterContextoOportunidadeAutorizacao_(dados.oportunidadeId, politica.classe === 'transferencia');
    }
    decisao = decidirAutorizacaoEscrita_(usuarioAutenticado, politica, contexto);
    if (acao === 'moverEtapaOportunidade' && dados.novaEtapaId) {
      var destino = obterEtapaPorId_(dados.novaEtapaId);
      if (destino && destino.tipo === 'perdido') { rotulo = 'perder'; }
      else if (destino && destino.tipo === 'ganho') { rotulo = 'vender'; }
    }
  } catch (erroAvaliacao) {
    decisao = { permitido: false, motivo: 'ERRO_AVALIACAO' };
    detalhe.push('erro=' + String(erroAvaliacao && erroAvaliacao.message ? erroAvaliacao.message : erroAvaliacao).slice(0, 100));
  }

  // Ator confiavel: sempre o usuario da sessao.
  var atorDivergente = false;
  if (usuarioAutenticado && usuarioAutenticado.id !== undefined && usuarioAutenticado.id !== null && usuarioAutenticado.id !== '') {
    var enviado = dados.usuarioId;
    if (enviado !== undefined && enviado !== null && enviado !== '' && String(enviado) !== String(usuarioAutenticado.id)) {
      atorDivergente = true;
      detalhe.push('ator_divergente_payload=' + String(enviado).slice(0, 40));
    }
    dados.usuarioId = usuarioAutenticado.id;
  }

  if (modo === 'observar' || !decisao.permitido || atorDivergente) {
    registrarDecisaoAutorizacaoEscrita_({
      modo: modo,
      acao: rotulo,
      usuarioId: usuarioAutenticado ? usuarioAutenticado.id : '',
      papel: usuarioAutenticado ? usuarioAutenticado.papel : '',
      oportunidadeId: dados.oportunidadeId || '',
      responsavelId: contexto && contexto.existe ? contexto.responsavelId : '',
      decisao: decisao.permitido ? 'permitido' : 'negado',
      motivo: decisao.motivo,
      detalhe: detalhe.join(';')
    });
  }

  if (!decisao.permitido && modo === 'aplicar') {
    throw new Error(decisao.motivo === 'USUARIO_INATIVO' ? MENSAGEM_USUARIO_INATIVO_ESCRITA_ : MENSAGEM_SEM_PERMISSAO_ESCRITA_);
  }
  return dados;
}

/**
 * Log simples e resiliente (aba AutorizacaoLog, criada sob demanda).
 * Sem nomes nem dados pessoais: apenas ids, papel e motivo. Qualquer falha
 * aqui e engolida -- o log NUNCA pode derrubar uma operacao legitima.
 */
function registrarDecisaoAutorizacaoEscrita_(r) {
  try {
    var planilha = getPlanilha_();
    var aba = planilha.getSheetByName(AUTORIZACAO_ESCRITA_ABA_LOG_);
    if (!aba) {
      try { aba = planilha.insertSheet(AUTORIZACAO_ESCRITA_ABA_LOG_); } catch (e1) { aba = planilha.getSheetByName(AUTORIZACAO_ESCRITA_ABA_LOG_); }
      if (aba && aba.getLastRow() === 0) {
        var n = AUTORIZACAO_ESCRITA_CABECALHO_LOG_.length;
        aba.getRange(1, 1, aba.getMaxRows(), n).setNumberFormat('@');
        aba.getRange(1, 1, 1, n).setValues([AUTORIZACAO_ESCRITA_CABECALHO_LOG_]);
      }
    }
    if (!aba) { return; }
    aba.appendRow([
      new Date().toISOString(), r.modo, r.acao, r.usuarioId, r.papel,
      r.oportunidadeId, r.responsavelId, r.decisao, r.motivo, r.detalhe || ''
    ]);
  } catch (erroLog) {
    // intencionalmente silencioso
  }
}
