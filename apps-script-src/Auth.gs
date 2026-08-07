/**
 * Autenticação real com Google (Passo 4 do roadmap, autorizado pelo CPO em
 * 2026-08-02). Substitui o stub anterior (que só conferia o e-mail contra a
 * aba Usuarios, sem validar o token).
 *
 * Estratégia de sessão (decisão dentro da autonomia técnica concedida —
 * resolve a ressalva que o CPO tinha deixado em aberto: "o ID token expira
 * em ~1h e não deve ser usado sozinho como mecanismo de sessão"):
 *
 * 1. O ID token do Google (JWT emitido pelo Google Identity Services no
 *    frontend) só é usado UMA VEZ, na ação "login" — validado aqui contra
 *    o endpoint tokeninfo do Google (assinatura, audience, expiração) e
 *    depois conferido contra a aba Usuarios (ativo = true).
 * 2. Se válido, geramos um token de sessão opaco nosso (UUID), guardado no
 *    CacheService do Script. É esse token — não o ID token do Google — que
 *    o frontend reenvia em toda chamada seguinte (listEtapas,
 *    listOportunidades etc.).
 * 3. Cada ação de leitura confere o token de sessão no cache (leitura
 *    local, sem chamada de rede ao Google) — evita repetir a validação
 *    contra o Google em cada uma das chamadas paralelas do Dashboard/
 *    Pipeline, o que só agravaria a instabilidade de concorrência já
 *    registrada na diretriz técnica.
 * 4. Sessão ausente/expirada no cache → erro "SESSAO_EXPIRADA", que o
 *    frontend trata de forma específica (força novo login).
 *
 * Sprint 6 "Operação do dia a dia" (2026-08-07) — item 2 "Permanecer mais
 * tempo logado": TTL original (55min, escolhido só para ficar abaixo da
 * validade de ~1h do ID token do Google, que na prática só é usado uma vez
 * na própria ação "login" e nunca mais depois disso — ver acima) fazia o
 * time reautenticar várias vezes ao longo do dia. Duas mudanças, sem exigir
 * nada do frontend:
 * (a) TTL sobe para 6h — o máximo permitido pelo CacheService do Apps
 *     Script (21600s); um valor maior é rejeitado silenciosamente pela
 *     plataforma, então não dá pra simplesmente "aumentar mais".
 * (b) exigirSessaoValida_ agora RENOVA o TTL a cada chamada válida (sessão
 *     "deslizante") — cada ação que o usuário faz empurra o expediente
 *     inteiro pra frente, então na prática ninguém desloga no meio do dia
 *     enquanto estiver usando o CRM pelo menos uma vez a cada 6h. Só
 *     expira de verdade após 6h de inatividade total (ex: durante a noite).
 * GOOGLE_CLIENT_ID vive em PropertiesService (mesmo padrão do PLANILHA_ID),
 * não fica hardcoded aqui.
 */

var TTL_SESSAO_SEGUNDOS = 6 * 60 * 60; // 6h — máximo do CacheService; renovado a cada uso (ver exigirSessaoValida_)

function getGoogleClientId_() {
  var id = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!id) {
    throw new Error('GOOGLE_CLIENT_ID nao configurado em PropertiesService.');
  }
  return id;
}

// Valida o ID token do Google via endpoint tokeninfo (abordagem recomendada
// pelo Google para backends sem biblioteca local de verificação de JWT).
// Confere assinatura/expiração (o próprio endpoint rejeita token inválido/
// expirado) e audience (garante que o token foi emitido para o nosso
// Client ID, não para outro app).
function validarIdTokenGoogle_(idToken) {
  if (!idToken) {
    return { valido: false, motivo: 'TOKEN_AUSENTE' };
  }

  var resposta = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );

  if (resposta.getResponseCode() !== 200) {
    return { valido: false, motivo: 'TOKEN_INVALIDO_OU_EXPIRADO' };
  }

  var claims = JSON.parse(resposta.getContentText());

  if (claims.aud !== getGoogleClientId_()) {
    return { valido: false, motivo: 'TOKEN_AUDIENCE_INCORRETA' };
  }
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    return { valido: false, motivo: 'EMAIL_NAO_VERIFICADO' };
  }

  return { valido: true, email: claims.email, nome: claims.name };
}

function buscarUsuarioPorEmail_(email) {
  var usuarios = lerAbaComoObjetos_(ABAS.USUARIOS);
  var encontrado = null;
  usuarios.some(function (u) {
    if (u.email === email) {
      encontrado = u;
      return true;
    }
    return false;
  });
  return encontrado;
}

// Ação "login": recebe o ID token do Google, devolve o usuário + um token
// de sessão nosso, ou um erro específico (token inválido, e-mail não
// cadastrado, usuário inativo) para a tela de login mostrar a mensagem
// certa.
function autenticar_(idToken) {
  var validacao = validarIdTokenGoogle_(idToken);
  if (!validacao.valido) {
    throw new Error(validacao.motivo);
  }

  var usuario = buscarUsuarioPorEmail_(validacao.email);
  if (!usuario) {
    throw new Error('USUARIO_NAO_CADASTRADO');
  }
  if (usuario.ativo !== true) {
    throw new Error('USUARIO_INATIVO');
  }

  var sessionToken = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put(sessionToken, JSON.stringify({ email: usuario.email, id: usuario.id }), TTL_SESSAO_SEGUNDOS);

  return {
    usuario: usuario,
    sessionToken: sessionToken,
    expiraEmSegundos: TTL_SESSAO_SEGUNDOS
  };
}

// Confere um token de sessão (não o ID token do Google) contra o cache.
// Toda ação de leitura chama isto antes de responder. Lança erro
// "SESSAO_EXPIRADA" se ausente/expirado — o frontend intercepta esse
// texto especificamente para forçar novo login em vez de mostrar um erro
// genérico.
function exigirSessaoValida_(sessionToken) {
  if (!sessionToken) {
    throw new Error('SESSAO_EXPIRADA');
  }
  var cache = CacheService.getScriptCache();
  var bruto = cache.get(sessionToken);
  if (!bruto) {
    throw new Error('SESSAO_EXPIRADA');
  }
  // Sprint 6 (2026-08-07) — sessão deslizante: renova o TTL a cada uso
  // válido, para o usuário não perder a sessão no meio do expediente (ver
  // nota completa no topo do arquivo).
  cache.put(sessionToken, bruto, TTL_SESSAO_SEGUNDOS);
  return JSON.parse(bruto);
}

// Ação "logout": remove a sessão do cache imediatamente (não espera o TTL).
function encerrarSessao_(sessionToken) {
  if (sessionToken) {
    CacheService.getScriptCache().remove(sessionToken);
  }
  return { encerrado: true };
}
