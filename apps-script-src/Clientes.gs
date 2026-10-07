/**
 * Regras da entidade Cliente. Até a Sprint 3.5, apenas leitura — listagem
 * para popular o Pipeline/Painel lateral com dados reais.
 *
 * Sprint 3.5 "Nova Negociação" (2026-08-03) — primeira escrita real da
 * entidade Cliente: criarOportunidade_ (Oportunidades.gs) precisa, antes de
 * criar a oportunidade, decidir se reaproveita um cliente já cadastrado ou
 * cria um novo — regra explícita do CEO: "verificar se já existe cliente
 * com o mesmo telefone; se existir, reutilizar o cliente; se não existir,
 * criar um novo cliente." Nenhuma outra entrada (CPF, endereço, documentos)
 * — fora do escopo desta Sprint por instrução explícita do CEO.
 */

// Hotfix "Visibilidade por Usuário" (2026-08-10): Cliente não tem
// responsavel_id próprio (quem é "dono" de um lead é a Oportunidade, não a
// pessoa) -- por isso a regra aqui é derivada, não direta: Gerente/
// Administrador continuam vendo a base inteira de clientes; SDR/Closer só
// veem os clientes que aparecem em pelo menos uma oportunidade da própria
// carteira (reaproveita listOportunidades_, que já aplica a mesma regra --
// ver Oportunidades.gs). Sem isso, mesmo depois de esconder as
// oportunidades de outros responsáveis, o nome/telefone/cidade de todos os
// clientes da revenda continuaria vazando para qualquer usuário comum.
function listClientes_(usuarioAutenticado) {
  if (!usuarioAutenticado) {
    throw new Error('listClientes_ requer usuarioAutenticado (contexto de sessao) por seguranca.');
  }
  var clientes = lerAbaComoObjetos_(ABAS.CLIENTES);
  if (usuarioTemVisaoCompleta_(usuarioAutenticado)) {
    return clientes;
  }
  var idsClientesVisiveis = {};
  listOportunidades_(usuarioAutenticado).forEach(function (o) {
    idsClientesVisiveis[String(o.cliente_id)] = true;
  });
  return clientes.filter(function (c) { return !!idsClientesVisiveis[String(c.id)]; });
}

// Telefone é comparado só pelos dígitos — evita falso-negativo de dedup por
// diferença de formatação ("(48) 99999-0001" vs "48999990001") sem exigir
// nenhuma regra de máscara/validação de telefone no MVP.
function normalizarTelefone_(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

function encontrarClientePorTelefone_(telefone) {
  var alvo = normalizarTelefone_(telefone);
  if (!alvo) return null;
  var clientes = lerAbaComoObjetos_(ABAS.CLIENTES);
  for (var i = 0; i < clientes.length; i++) {
    if (normalizarTelefone_(clientes[i].telefone) === alvo) return clientes[i];
  }
  return null;
}

// Cria um cliente novo (linha na aba Clientes) e devolve o mesmo formato
// "cru" (snake_case) que lerAbaComoObjetos_ devolveria para uma linha
// existente — quem chama (criarOportunidade_) não precisa saber se o
// cliente é novo ou reaproveitado, o formato de retorno é sempre o mesmo.
// Sem LockService aqui: a única escrita concorrente possível é duas
// criações de oportunidade quase simultâneas com o MESMO telefone novo,
// cenário raro no MVP (um vendedor por vez cadastrando um lead) — registrar
// como simplificação consciente, não uma omissão. O lock de
// criarOportunidade_ (que chama esta função) ainda protege a escrita da
// oportunidade em si.
/**
 * Sprint 6 "Operação do dia a dia" (2026-08-07) — item 4 "Editar dados do
 * cliente". Localiza a linha do cliente pelo id (mesmo padrão de
 * encontrarLinhaOportunidade_ em Oportunidades.gs — resolve coluna por
 * nome de cabeçalho, não por índice fixo).
 */
function encontrarLinhaCliente_(aba, clienteId) {
  var valores = aba.getDataRange().getValues();
  var cabecalho = valores[0];
  var colId = cabecalho.indexOf('id');
  if (colId === -1) {
    throw new Error('Coluna "id" nao encontrada na aba Clientes.');
  }
  for (var i = 1; i < valores.length; i++) {
    if (String(valores[i][colId]) === String(clienteId)) {
      return { linha: i + 1, cabecalho: cabecalho };
    }
  }
  return null;
}

var ROTULOS_CAMPO_CLIENTE_ = { nome: 'nome', telefone: 'telefone', cidade: 'cidade', email: 'email' };

// Atualiza só os campos presentes em `camposNovos` (nome/telefone/cidade/
// email) e, se `mudancasArray` for passado, empurra uma descrição legível
// de cada campo que de fato mudou de valor — usado por
// editarDadosOportunidade_ (Oportunidades.gs) para montar um único evento
// de Timeline com o resumo de tudo que foi editado. Chamada sempre dentro
// do lock de quem chama (não abre lock próprio aqui, mesmo padrão de
// criarCliente_ acima, que é chamada de dentro do lock de
// criarOportunidade_).
function atualizarCliente_(clienteId, camposNovos, mudancasArray) {
  var aba = getAba_(ABAS.CLIENTES);
  var encontrada = encontrarLinhaCliente_(aba, clienteId);
  if (!encontrada) {
    throw new Error('Cliente nao encontrado: ' + clienteId);
  }
  var cabecalho = encontrada.cabecalho;
  var linha = encontrada.linha;

  Object.keys(camposNovos).forEach(function (campo) {
    var col = cabecalho.indexOf(campo);
    if (col === -1) return;
    var valorAtual = aba.getRange(linha, col + 1).getValue();
    var valorAtualStr = valorAtual === null || valorAtual === undefined ? '' : String(valorAtual);
    var valorNovo = camposNovos[campo];
    if (valorAtualStr === valorNovo) return;
    aba.getRange(linha, col + 1).setValue(valorNovo);
    if (mudancasArray) {
      mudancasArray.push(
        (ROTULOS_CAMPO_CLIENTE_[campo] || campo) + ' de "' + (valorAtualStr || '(vazio)') + '" para "' + valorNovo + '"'
      );
    }
  });

  var colAtualizado = cabecalho.indexOf('atualizado_em');
  if (colAtualizado !== -1) aba.getRange(linha, colAtualizado + 1).setValue(new Date().toISOString());

  var linhaAtualizada = aba.getRange(linha, 1, 1, cabecalho.length).getValues()[0];
  var obj = {};
  cabecalho.forEach(function (chave, i) {
    obj[chave] = linhaAtualizada[i];
  });
  return obj;
}

function criarCliente_(dados) {
  var aba = getAba_(ABAS.CLIENTES);
  var agora = new Date().toISOString();
  var id = Utilities.getUuid();
  var linha = {
    id: id,
    nome: dados.nome,
    telefone: dados.telefone,
    email: '',
    cidade: dados.cidade || '',
    criado_em: agora,
    atualizado_em: agora
  };
  adicionarLinhaPorCabecalho_(aba, linha);
  return linha;
}

// ---------------------------------------------------------------------------
// Melhoria 4 "Alerta de oportunidade duplicada" (2026-10-07) -- DETECÇÃO e
// ALERTA apenas: nada aqui cria, altera, junta ou exclui cliente/oportunidade.
// Chamada só pelo handler "criarOportunidade" (Roteador.gs) quando a tela
// Nova Negociação envia verificarDuplicidade:true; WhatsApp/Mobiauto chamam
// criarOportunidade_ direto e continuam exatamente como antes.
// ---------------------------------------------------------------------------

// Chave de COMPARAÇÃO de telefone, só para detectar duplicidade (a gravação e o
// reaproveitamento de cliente em criarOportunidade_ continuam usando só
// normalizarTelefone_, intocada). Parte da mesma normalização (só dígitos) e
// acrescenta o que a base real mostrou ser necessário: o WhatsApp/Mobiauto
// gravam com DDI "55" e, às vezes, sem o 9º dígito; a digitação manual vem sem
// DDI. Resultado: DDD + 8 últimos dígitos, tanto para "(48) 99699-9307" quanto
// para "+55 48 99699-9307" ou "554896999307". Qualquer formato fora de
// 10/11 dígitos (após tirar o DDI) só casa por igualdade exata.
function chaveComparacaoTelefone_(telefone) {
  var d = normalizarTelefone_(telefone);
  if (!d) return '';
  if (d.length >= 12 && d.indexOf('55') === 0) d = d.substring(2);
  if (d.length === 10) return d;
  if (d.length === 11 && d.charAt(2) === '9') return d.substring(0, 2) + d.substring(3);
  return 'x' + d;
}

function valorIsoDup_(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function tempoDup_(v) {
  var t = Date.parse(valorIsoDup_(v));
  return isNaN(t) ? 0 : t;
}

// Devolve { encontrada:false } ou { encontrada:true, nivel:'ativa'|'historico', ... }.
// Regras: oportunidade excluída (excluido_em) é ignorada; prioridade = ativa mais
// recentemente atualizada > encerrada mais recente. Permissão: o que o usuário
// pode VER segue exatamente listOportunidades_ (mesma função, mesma regra).
// Para negociação fora da visibilidade do usuário, devolve só o mínimo para
// evitar duplicidade (nível + nome do responsável da ativa) -- sem cliente,
// veículo, etapa, datas ou id.
function verificarDuplicidadeNegociacao_(telefone, usuarioAutenticado) {
  if (!usuarioAutenticado) {
    throw new Error('verificarDuplicidadeNegociacao_ requer usuarioAutenticado (contexto de sessao) por seguranca.');
  }
  var chave = chaveComparacaoTelefone_(telefone);
  if (!chave) return { encontrada: false };

  var clientesPorId = {};
  lerAbaComoObjetos_(ABAS.CLIENTES).forEach(function (c) {
    if (chaveComparacaoTelefone_(c.telefone) === chave) clientesPorId[String(c.id)] = c;
  });
  if (!Object.keys(clientesPorId).length) return { encontrada: false };

  var etapaPorId = {};
  listEtapas_().forEach(function (e) { etapaPorId[String(e.id)] = e; });
  var usuarioPorId = {};
  listUsuarios_().forEach(function (u) { usuarioPorId[String(u.id)] = u; });

  var visiveis = {};
  listOportunidades_(usuarioAutenticado).forEach(function (o) { visiveis[String(o.id)] = true; });

  var ativas = [];
  var encerradas = [];
  lerAbaComoObjetos_(ABAS.OPORTUNIDADES).forEach(function (o) {
    if (o.excluido_em || !clientesPorId[String(o.cliente_id)]) return;
    var etapa = etapaPorId[String(o.etapa_id)] || null;
    var tipo = etapa ? etapa.tipo : 'ativa';
    var item = { o: o, etapa: etapa, tipo: tipo };
    if (tipo === 'ganho' || tipo === 'perdido') {
      item.ref = tempoDup_(tipo === 'ganho' ? (o.vendido_em || o.atualizado_em) : (o.perdido_em || o.atualizado_em));
      encerradas.push(item);
    } else {
      item.ref = tempoDup_(o.atualizado_em || o.criado_em);
      ativas.push(item);
    }
  });
  if (!ativas.length && !encerradas.length) return { encontrada: false };

  ativas.sort(function (a, b) { return b.ref - a.ref; });
  encerradas.sort(function (a, b) { return b.ref - a.ref; });
  var principal = ativas.length ? ativas[0] : encerradas[0];
  var ehAtiva = ativas.length > 0;
  var nomeResp = function (o) {
    var u = usuarioPorId[String(o.responsavel_id)];
    return u ? u.nome : '';
  };

  var resposta = { encontrada: true, nivel: ehAtiva ? 'ativa' : 'historico' };
  if (!visiveis[String(principal.o.id)]) {
    // Fora da carteira do usuário: nada de dados da negociação.
    if (ehAtiva) resposta.responsavelNome = nomeResp(principal.o);
    return resposta;
  }

  var o = principal.o;
  var cliente = clientesPorId[String(o.cliente_id)];
  var veiculo = o.veiculo_interesse ||
    [o.veiculo_estoque_marca, o.veiculo_estoque_modelo_versao, o.veiculo_estoque_ano].filter(Boolean).join(' ');
  var totalVisiveis = 0;
  ativas.concat(encerradas).forEach(function (x) { if (visiveis[String(x.o.id)]) totalVisiveis++; });
  resposta.totalNegociacoes = totalVisiveis;
  resposta.principal = {
    oportunidadeId: String(o.id),
    clienteNome: cliente ? cliente.nome : '',
    veiculo: veiculo || '',
    etapaNome: principal.etapa ? principal.etapa.nome : '',
    resultado: principal.tipo === 'perdido' ? 'Perdido' : (principal.tipo === 'ganho' ? 'Venda realizada' : ''),
    responsavelNome: nomeResp(o),
    dataReferencia: principal.ref ? new Date(principal.ref).toISOString() : ''
  };
  return resposta;
}
