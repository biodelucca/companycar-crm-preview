// Dados fictícios para o protótipo navegável (preview de produto).
// Objetivo: validar layout, navegação, UX, fluxo do pipeline e
// responsividade — sem depender de Apps Script/Planilha/autenticação real.
// Ver decisão do CEO em 2026-08-02 (pivô de prioridade: produto > infra).
//
// Formato idêntico ao que a API real (Apps Script) devolve, para que a
// troca de "mock" por "API real" no futuro não exija mudanças nos
// componentes — apenas na implementação dos services.
export const mockUsuarios = [
  { id: "u1", nome: "Guilherme", email: "guilherme@companycar.com.br", papel: "Gerencia", ativo: true, criadoEm: "2026-01-01" },
  { id: "u2", nome: "Ian", email: "ian@companycar.com.br", papel: "Closer", ativo: true, criadoEm: "2026-01-01" },
  { id: "u3", nome: "Ramon", email: "ramon@companycar.com.br", papel: "Closer", ativo: true, criadoEm: "2026-01-01" },
  { id: "u4", nome: "Ester", email: "ester@companycar.com.br", papel: "SDR", ativo: true, criadoEm: "2026-01-01" },
  ];
export const mockEtapas = [
  { id: "e1", nome: "Novo Lead", ordem: 1, tipo: "ativa" },
  { id: "e2", nome: "Tentativa de Contato", ordem: 2, tipo: "ativa" },
  { id: "e3", nome: "Pré-qualificação", ordem: 3, tipo: "ativa" },
  { id: "e4", nome: "Cotação", ordem: 4, tipo: "ativa" },
  { id: "e5", nome: "Visita Agendada", ordem: 5, tipo: "ativa" },
  { id: "e6", nome: "Negociação Final", ordem: 6, tipo: "ativa" },
  { id: "e7", nome: "Venda/Documentação", ordem: 7, tipo: "ganho" },
  { id: "e8", nome: "Perdido", ordem: 8, tipo: "perdido" },
  ];
export const mockClientes = [
  { id: "c1", nome: "Marcos Vieira", telefone: "(48) 99911-2233", email: "marcos.vieira@gmail.com", cidade: "Içara", criadoEm: "2026-07-20", atualizadoEm: "2026-08-01" },
  { id: "c2", nome: "Fernanda Bez", telefone: "(48) 99822-1144", email: "fernanda.bez@gmail.com", cidade: "Criciúma", criadoEm: "2026-07-21", atualizadoEm: "2026-08-01" },
  { id: "c3", nome: "Rodrigo Cardoso", telefone: "(48) 99733-5566", email: "rodrigo.cardoso@hotmail.com", cidade: "Araranguá", criadoEm: "2026-07-22", atualizadoEm: "2026-07-31" },
  { id: "c4", nome: "Juliana Menegatti", telefone: "(48) 99644-7788", email: "ju.menegatti@gmail.com", cidade: "Içara", criadoEm: "2026-07-23", atualizadoEm: "2026-08-01" },
  { id: "c5", nome: "Anderson Kuhn", telefone: "(48) 99555-9900", email: "anderson.kuhn@gmail.com", cidade: "Forquilhinha", criadoEm: "2026-07-24", atualizadoEm: "2026-07-30" },
  { id: "c6", nome: "Patrícia Souza", telefone: "(48) 99466-1122", email: "patricia.souza@gmail.com", cidade: "Sombrio", criadoEm: "2026-07-24", atualizadoEm: "2026-08-02" },
  { id: "c7", nome: "Elton Zanette", telefone: "(48) 99377-3344", email: "elton.zanette@gmail.com", cidade: "Criciúma", criadoEm: "2026-07-25", atualizadoEm: "2026-08-01" },
  { id: "c8", nome: "Camila Duarte", telefone: "(48) 99288-5566", email: "camila.duarte@gmail.com", cidade: "Içara", criadoEm: "2026-07-26", atualizadoEm: "2026-07-29" },
  { id: "c9", nome: "Vinícius Ghisi", telefone: "(48) 99199-7788", email: "vinicius.ghisi@gmail.com", cidade: "Criciúma", criadoEm: "2026-07-27", atualizadoEm: "2026-08-02" },
  { id: "c10", nome: "Bruna Fernandes", telefone: "(48) 99099-9911", email: "bruna.fernandes@gmail.com", cidade: "Içara", criadoEm: "2026-07-28", atualizadoEm: "2026-08-01" },
  { id: "c11", nome: "Diego Bittencourt", telefone: "(48) 98988-2211", email: "diego.bittencourt@gmail.com", cidade: "Araranguá", criadoEm: "2026-07-29", atualizadoEm: "2026-07-31" },
  { id: "c12", nome: "Tainara Corrêa", telefone: "(48) 98877-3322", email: "tainara.correa@gmail.com", cidade: "Içara", criadoEm: "2026-07-30", atualizadoEm: "2026-08-02" },
  ];
export const mockOportunidades = [
  { id: "o1", clienteId: "c1", etapaId: "e1", responsavelId: "u4", proximaAcao: "Fazer primeiro contato via WhatsApp", proximaAcaoData: "2026-08-03", veiculoInteresse: "HB20 1.0 2021", origemId: "org1", criadoEm: "2026-08-01", atualizadoEm: "2026-08-01" },
  { id: "o2", clienteId: "c2", etapaId: "e1", responsavelId: "u4", proximaAcao: "Enviar catálogo de SUVs disponíveis", proximaAcaoData: "2026-08-03", veiculoInteresse: "Jeep Renegade 2020", origemId: "org2", criadoEm: "2026-08-02", atualizadoEm: "2026-08-02" },
  { id: "o3", clienteId: "c3", etapaId: "e2", responsavelId: "u4", proximaAcao: "Ligar novamente às 14h", proximaAcaoData: "2026-08-02", veiculoInteresse: "Chevrolet Onix 1.0 2022", origemId: "org1", criadoEm: "2026-07-30", atualizadoEm: "2026-08-02" },
  { id: "o4", clienteId: "c4", etapaId: "e2", responsavelId: "u4", proximaAcao: "Tentar contato por ligação", proximaAcaoData: "2026-08-03", veiculoInteresse: "Fiat Argo 1.3 2021", origemId: "org3", criadoEm: "2026-07-31", atualizadoEm: "2026-08-02" },
  { id: "o5", clienteId: "c5", etapaId: "e3", responsavelId: "u2", proximaAcao: "Entender uso do veículo e forma de pagamento", proximaAcaoData: "2026-08-04", veiculoInteresse: "Fiat Strada 1.4 2020", origemId: "org2", criadoEm: "2026-07-28", atualizadoEm: "2026-08-01" },
  { id: "o6", clienteId: "c6", etapaId: "e3", responsavelId: "u3", proximaAcao: "Confirmar se tem veículo na troca", proximaAcaoData: "2026-08-04", veiculoInteresse: "Renault Kwid 1.0 2022", origemId: "org1", criadoEm: "2026-07-29", atualizadoEm: "2026-08-01" },
  { id: "o7", clienteId: "c7", etapaId: "e4", responsavelId: "u2", proximaAcao: "Enviar proposta com condições de financiamento", proximaAcaoData: "2026-08-03", veiculoInteresse: "Toyota Corolla 2.0 2019", veiculoTroca: { modelo: "Ford Ka 2016", ano: 2016, km: 78000, placa: "ABC1D23" }, origemId: "org2", condicaoComercial: "Financiado 48x", valorProposto: 98900, criadoEm: "2026-07-25", atualizadoEm: "2026-08-01" },
  { id: "o8", clienteId: "c8", etapaId: "e4", responsavelId: "u3", proximaAcao: "Ajustar valor da entrada conforme pedido", proximaAcaoData: "2026-08-03", veiculoInteresse: "Jeep Compass 1.3 2021", origemId: "org3", condicaoComercial: "Financiado 60x", valorProposto: 132900, criadoEm: "2026-07-26", atualizadoEm: "2026-08-02" },
  { id: "o9", clienteId: "c9", etapaId: "e5", responsavelId: "u2", proximaAcao: "Confirmar presença na visita de amanhã", proximaAcaoData: "2026-08-03", veiculoInteresse: "Volkswagen Saveiro 1.6 2020", origemId: "org1", condicaoComercial: "À vista", valorProposto: 84900, criadoEm: "2026-07-24", atualizadoEm: "2026-08-02" },
  { id: "o10", clienteId: "c10", etapaId: "e5", responsavelId: "u3", proximaAcao: "Preparar veículo para test-drive", proximaAcaoData: "2026-08-04", veiculoInteresse: "Honda Civic 2.0 2018", origemId: "org2", condicaoComercial: "Financiado 36x", valorProposto: 89900, criadoEm: "2026-07-23", atualizadoEm: "2026-08-01" },
  { id: "o11", clienteId: "c11", etapaId: "e6", responsavelId: "u2", proximaAcao: "Fechar condição final de troca", proximaAcaoData: "2026-08-03", veiculoInteresse: "Chevrolet Onix 1.0 2023", veiculoTroca: { modelo: "HB20 2017", ano: 2017, km: 95000, placa: "XYZ4E56" }, origemId: "org1", condicaoComercial: "Troca + financiamento 48x", valorProposto: 79900, criadoEm: "2026-07-22", atualizadoEm: "2026-08-02" },
  { id: "o12", clienteId: "c12", etapaId: "e6", responsavelId: "u3", proximaAcao: "Aguardar retorno sobre aprovação de crédito", proximaAcaoData: "2026-08-04", veiculoInteresse: "Hyundai Creta 1.6 2021", origemId: "org3", condicaoComercial: "Financiado 60x", valorProposto: 118900, criadoEm: "2026-07-21", atualizadoEm: "2026-08-01" },
  { id: "o13", clienteId: "c1", etapaId: "e7", responsavelId: "u2", proximaAcao: "Enviar documentação para o despachante", proximaAcaoData: "2026-08-03", veiculoInteresse: "Fiat Toro 2.0 2020", origemId: "org1", condicaoComercial: "Financiado 48x", valorProposto: 139900, criadoEm: "2026-07-18", atualizadoEm: "2026-08-02" },
  { id: "o14", clienteId: "c2", etapaId: "e7", responsavelId: "u3", proximaAcao: "Agendar entrega do veículo", proximaAcaoData: "2026-08-04", veiculoInteresse: "Chevrolet Tracker 1.0 2022", origemId: "org2", condicaoComercial: "À vista", valorProposto: 109900, criadoEm: "2026-07-19", atualizadoEm: "2026-08-01" },
  { id: "o15", clienteId: "c3", etapaId: "e8", responsavelId: "u2", proximaAcao: "—", proximaAcaoData: null, veiculoInteresse: "Renault Sandero 1.6 2019", origemId: "org1", etapaOrigemPerdaId: "e4", motivoPerdaId: "m1", perdidoEm: "2026-07-30", perdidoPor: "u2", criadoEm: "2026-07-15", atualizadoEm: "2026-07-30" },
  { id: "o16", clienteId: "c4", etapaId: "e8", responsavelId: "u3", proximaAcao: "—", proximaAcaoData: null, veiculoInteresse: "Fiat Cronos 1.3 2021", origemId: "org3", etapaOrigemPerdaId: "e5", motivoPerdaId: "m2", perdidoEm: "2026-07-29", perdidoPor: "u3", criadoEm: "2026-07-14", atualizadoEm: "2026-07-29" },
  ];
export const mockMotivosPerda = {
      m1: "Fechou com concorrente",
      m2: "Não aprovado no crédito",
};
