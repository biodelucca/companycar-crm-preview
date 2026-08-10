/**
 * Roteador do Web App. Todo GET/POST cai aqui e e despachado por
 * "action" para a funcao correspondente em cada arquivo de entidade.
 * Resposta sempre no formato {success, data, error} (ver Utils.gs).
 *
 * Sprint 4 (2026-08-04): login real com Google reativado e endpoints
 * protegidos por sessao valida. "login" continua sendo a unica acao que
 * nao exige sessao "por natureza" (e exatamente ela que cria a sessao) --
 * ver Auth.gs para o fluxo completo. TODAS as demais acoes (leitura E
 * escrita) agora exigem sessionToken valido via exigirSessaoValida_.
 *
 * Ate a Sprint 4, essas acoes ficaram deliberadamente sem protecao
 * (decisao explicita do CEO, registrada na diretriz tecnica) enquanto o
 * login real ficava pausado por um bug de autorizacao OAuth (Ciclo 3-4).
 * Historico completo dessa decisao preservado na diretriz tecnica do
 * projeto -- nao repetido aqui.
 */

var ACOES_SEM_SESSAO = {
  login: true
};

// Hotfix "Visibilidade por Usuário" (2026-08-10): as quatro leituras que
// expõem dado de oportunidade (diretamente ou por associação -- cliente e
// timeline pertencem a uma oportunidade) agora recebem o usuário
// autenticado (ver obterUsuarioAutenticado_ em Auth.gs) e aplicam a regra
// de visibilidade DENTRO da própria função de entidade (Oportunidades.gs/
// Clientes.gs/Timeline.gs) -- nunca aqui no Roteador, que só repassa o
// contexto. listEtapas/listUsuarios/listMotivosPerda/listOrigens/
// listEstoque continuam globais (tabelas de referência ou catálogo, sem
// dono/responsável -- nenhuma delas expõe dado de oportunidade de outra
// pessoa); listUsuarios em particular PRECISA continuar visível a todos os
// papéis, senão os fluxos existentes de transferência de responsável e
// atribuição de próxima ação quebram (fora do escopo deste hotfix mudar
// isso -- ver diretriz técnica).
var ACOES_GET = {
  login: function (e) { return autenticar_(e.parameter.idToken); },
  logout: function (e) { return encerrarSessao_(e.parameter.sessionToken); },
  listOportunidades: function (e, usuarioAutenticado) { return listOportunidades_(usuarioAutenticado); },
  listEtapas: listEtapas_,
  listClientes: function (e, usuarioAutenticado) { return listClientes_(usuarioAutenticado); },
  listUsuarios: listUsuarios_,
  listMotivosPerda: listMotivosPerda_,
  listOrigens: listOrigens_,
  listTimeline: function (e, usuarioAutenticado) { return listTimeline_(usuarioAutenticado); },
  obterAnotacao: function (e, usuarioAutenticado) { return obterAnotacao_(e.parameter.oportunidadeId, usuarioAutenticado); },
  listEstoque: listEstoque_,
  // Sprint 5 (2026-08-04) -- modulo WhatsApp (ver WhatsApp.gs), protegidas
  // por sessao valida como qualquer acao desde a Sprint 4. Acesso a
  // Conversas já é restrito ao Gerente (Owner) inteiramente por gate de
  // exibição no frontend desde o Ciclo 17 -- regra mais estrita que a
  // deste hotfix (SDR/Closer não chegam nem a montar a tela), então não
  // precisou de nenhuma mudança aqui.
  listConversas: listConversas_,
  listMensagensConversa: function (e) { return listMensagensConversa_(e.parameter.oportunidadeId, e.parameter.telefone); }
};

function doGet(e) {
  var action = e.parameter.action;
  var handler = ACOES_GET[action];

  if (!handler) {
    return respostaErro_('Acao desconhecida: ' + action);
  }

  try {
    // Hotfix "Visibilidade por Usuário" (2026-08-10): antes, apenas
    // confirmava que a sessão existia (exigirSessaoValida_) e descartava o
    // resultado -- nenhum handler sabia quem estava perguntando. Agora
    // resolve o usuário autenticado completo (id + papel) uma única vez
    // aqui, a partir só do sessionToken, e repassa para o handler decidir
    // o que mostrar. Nunca a partir de um parâmetro da requisição.
    var usuarioAutenticado = null;
    if (!ACOES_SEM_SESSAO[action]) {
      usuarioAutenticado = obterUsuarioAutenticado_(e.parameter.sessionToken);
    }
    return respostaOk_(handler(e, usuarioAutenticado));
  } catch (erro) {
    return respostaErro_(erro.message || erro);
  }
}

// Escrita real (POST). "action" chega na query string (o apiClient do
// frontend sempre manda assim, mesmo em POST), e o corpo (JSON) traz os
// dados. A partir da Sprint 4, TODA escrita exige sessao valida -- com a
// unica excecao abaixo (Sprint 5): "whatsappWebhook" e uma chamada
// maquina-a-maquina da Evolution API, nao de um usuario logado, entao nao
// tem sessionToken para validar. Em vez disso, receberWebhookWhatsapp_
// (WhatsApp.gs) exige seu proprio secret (dados.secret vs
// WHATSAPP_WEBHOOK_SECRET em PropertiesService) antes de processar
// qualquer payload -- ver comentario no topo de WhatsApp.gs.
//
// Correcao (2026-08-04, antes do primeiro teste real): a Evolution API nao
// da como injetar um campo extra ("secret") no corpo do webhook -- ela
// manda o payload do evento (messages.upsert) puro, sem espaco para um
// campo nosso, e o Apps Script Web App tambem nao expoe headers HTTP
// customizados em doPost(e) (limitacao conhecida da plataforma). Por isso
// o secret tem que vir na query string da URL do webhook configurada na
// Evolution API (?action=whatsappWebhook&secret=...) -- e.parameter
// continua disponivel em POST mesmo com corpo JSON. Sem este ajuste o
// webhook rejeitaria toda mensagem real com erro de secret invalido.
var ACOES_POST_SEM_SESSAO = {
  whatsappWebhook: true
};

var ACOES_POST = {
  salvarAnotacao: function (dados) { return salvarAnotacao_(dados.oportunidadeId, dados.anotacoes); },
  moverEtapaOportunidade: function (dados) {
    return moverEtapaOportunidade_(dados.oportunidadeId, dados.novaEtapaId, dados.motivoPerdaId, dados.motivoPerdaOutroTexto, dados.usuarioId);
  },
  transferirOportunidade: function (dados) {
    return transferirOportunidade_(dados.oportunidadeId, dados.novoResponsavelId, dados.usuarioId);
  },
  associarVeiculoEstoque: function (dados) {
    return associarVeiculoEstoque_(dados.oportunidadeId, dados.veiculoEstoqueId, dados.usuarioId);
  },
  criarOportunidade: function (dados) {
    return criarOportunidade_(dados);
  },
  // Sprint 6 "Operação do dia a dia" (2026-08-07) -- ver Oportunidades.gs/
  // Clientes.gs para a implementação e o racional de cada uma.
  excluirOportunidade: function (dados) {
    return excluirOportunidade_(dados.oportunidadeId, dados.usuarioId);
  },
  editarDadosOportunidade: function (dados) {
    return editarDadosOportunidade_(dados.oportunidadeId, dados, dados.usuarioId);
  },
  // Sprint 7 "Próximas Ações" (2026-08-07) -- ver Oportunidades.gs para a
  // implementação e o racional (tipo estruturado + data/hora + responsável,
  // substitui o texto livre da Sprint 1 que nunca persistiu de verdade).
  atualizarProximaAcao: function (dados) {
    return atualizarProximaAcao_(dados.oportunidadeId, {
      proximaAcaoTipo: dados.tipo,
      proximaAcaoOutroTexto: dados.outroTexto,
      proximaAcaoData: dados.data,
      proximaAcaoResponsavelId: dados.responsavelId
    }, dados.usuarioId);
  },
  concluirProximaAcao: function (dados) {
    return concluirProximaAcao_(dados.oportunidadeId, dados.usuarioId);
  },
  // Sprint 5 (2026-08-04) -- modulo WhatsApp (ver WhatsApp.gs). O 2o
  // parametro (e) so e usado por whatsappWebhook, para ler ?secret= da
  // query string -- ver comentario acima de ACOES_POST_SEM_SESSAO.
  whatsappWebhook: function (dados, e) {
    if (!dados.secret && e && e.parameter && e.parameter.secret) {
      dados.secret = e.parameter.secret;
    }
    return receberWebhookWhatsapp_(dados);
  },
  enviarMensagemWhatsapp: function (dados) {
    return enviarMensagemWhatsapp_(dados.oportunidadeId, dados.texto, dados.usuarioId);
  },
  vincularConversaOportunidade: function (dados) {
    return vincularConversaOportunidade_(dados.telefone, dados.oportunidadeId, dados.usuarioId);
  }
};

function doPost(e) {
  var action = e.parameter.action;
  var handler = ACOES_POST[action];

  if (!handler) {
    return respostaErro_('Acao de escrita desconhecida: ' + action);
  }

  var dados = {};
  try {
    if (e.postData && e.postData.contents) {
      dados = JSON.parse(e.postData.contents);
    }
  } catch (erro) {
    return respostaErro_('Corpo da requisicao invalido (esperado JSON).');
  }

  try {
    // Hotfix "Visibilidade por Usuário" (2026-08-10): mesma resolução de
    // usuário autenticado do doGet acima, por consistência -- nenhum
    // endpoint de escrita foi restringido por papel nesta correção (fora
    // de escopo, ver diretriz técnica: "preservar transferência" e "não
    // ampliar/restringir permissões"), mas o contexto já fica disponível
    // (3o parâmetro do handler) para quando isso for necessário, sem
    // precisar mexer de novo no Roteador. Como efeito colateral, também
    // endurece a validação de sessão aqui: uma sessão cujo usuário foi
    // removido da aba Usuarios depois do login agora é tratada como
    // sessão expirada, igual ao doGet, em vez de continuar aceita.
    var usuarioAutenticado = null;
    if (!ACOES_POST_SEM_SESSAO[action]) {
      usuarioAutenticado = obterUsuarioAutenticado_(dados.sessionToken || dados.idToken);
    }
    return respostaOk_(handler(dados, e, usuarioAutenticado));
  } catch (erro) {
    return respostaErro_(erro.message || erro);
  }
}
