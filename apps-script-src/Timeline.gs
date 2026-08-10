/**
 * Timeline da oportunidade — histórico automático de eventos relevantes.
 * A partir da Sprint 1 (transferência de responsável e mover etapa com
 * persistência real), esta é a primeira vez que a aba Timeline realmente
 * recebe gravações; antes disso a timeline exibida no painel lateral vivia
 * só em memória (React), semeada com um evento sintético de "criação" por
 * oportunidade (ver Pipeline.tsx). Próxima ação e checklist (Passos 7/8)
 * continuam fora do escopo desta Sprint e seguem só em memória.
 *
 * Nunca gravado manualmente pelo usuário — sempre chamado internamente por
 * outra função de escrita (moverEtapaOportunidade_/transferirOportunidade_)
 * logo após a escrita principal, dentro do mesmo lock.
 */

function registrarEventoTimeline_(oportunidadeId, tipoEvento, descricao, usuarioId) {
  var aba = getAba_(ABAS.TIMELINE);
  aba.appendRow([
    Utilities.getUuid(),
    oportunidadeId,
    tipoEvento,
    descricao,
    usuarioId || '',
    new Date().toISOString()
  ]);
}

// Hotfix "Visibilidade por Usuário" (2026-08-10): até esta correção, esta
// função devolvia a aba Timeline INTEIRA para qualquer usuário autenticado
// -- o frontend só filtrava por oportunidadeId no cliente (Pipeline.tsx),
// ou seja, o histórico completo de TODAS as negociações da revenda (quem
// moveu o quê, transferências, próximas ações, exclusões) já ia pela rede
// para qualquer SDR/Closer logado, mesmo que a tela só mostrasse depois o
// que era da carteira dele -- exatamente o tipo de "filtro só visual" que
// o CEO pediu para não confiar. Agora a filtragem acontece aqui: Gerente/
// Administrador continuam vendo a timeline inteira; SDR/Closer só veem
// eventos de oportunidades da própria carteira (reaproveita
// listOportunidades_, mesma regra de Oportunidades.gs/Clientes.gs).
function listTimeline_(usuarioAutenticado) {
  if (!usuarioAutenticado) {
    throw new Error('listTimeline_ requer usuarioAutenticado (contexto de sessao) por seguranca.');
  }
  var eventos = lerAbaComoObjetos_(ABAS.TIMELINE);
  if (usuarioTemVisaoCompleta_(usuarioAutenticado)) {
    return eventos;
  }
  var idsOportunidadesVisiveis = {};
  listOportunidades_(usuarioAutenticado).forEach(function (o) {
    idsOportunidadesVisiveis[String(o.id)] = true;
  });
  return eventos.filter(function (ev) { return !!idsOportunidadesVisiveis[String(ev.oportunidade_id)]; });
}
