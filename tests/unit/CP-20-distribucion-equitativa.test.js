import test from 'node:test';
import assert from 'node:assert/strict';
import ShareSplitService from '../../src/services/sharesplit-service.js';

// Plan de Pruebas MoneyShare EAM, CP-20 (HU-009): distribución equitativa.
// Repositorio y servicio de notificaciones simulados; sin base de datos.
function crearEscenario(t) {
  const share = { id_share: 1, name: 'Viaje', paid_amount: 120 };
  const splits = [
    { id_user: 1, paid: 120, percentage: 0 },
    { id_user: 2, paid: 0, percentage: 0 }
  ];
  const repo = {
    findSplitsByShare: t.mock.fn(async () => splits),
    updateSplit: t.mock.fn(async () => {})
  };
  const servicio = new ShareSplitService(repo, {});
  return { share, repo, servicio };
}

test('PU-18 | CP-20 | Distribuir un gasto total de 120 entre dos integrantes: 60 para cada uno', async (t) => {
  const { share, repo, servicio } = crearEscenario(t);
  await servicio.splitEqually(share);

  const llamadas = repo.updateSplit.mock.calls.map((c) => c.arguments);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0][0].assigned_amount, 60);
  assert.equal(llamadas[0][1], 1);
  assert.equal(llamadas[0][2], 1);
  assert.equal(llamadas[1][0].assigned_amount, 60);
  assert.equal(llamadas[1][1], 2);
  assert.equal(llamadas[1][2], 1);
});

test('PU-19 | CP-20 | Distribución equitativa entre dos integrantes: 50 % para cada uno', async (t) => {
  const { share, repo, servicio } = crearEscenario(t);
  await servicio.splitEqually(share);

  const llamadas = repo.updateSplit.mock.calls.map((c) => c.arguments);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0][0].percentage, 50);
  assert.equal(llamadas[1][0].percentage, 50);
});
