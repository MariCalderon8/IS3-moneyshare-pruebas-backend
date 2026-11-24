import test from 'node:test';
import assert from 'node:assert/strict';
import ShareSplitService from '../../src/services/sharesplit-service.js';

// Plan de Pruebas MoneyShare EAM, CP-23 (HU-010): rechazo de porcentajes inválidos.
function crearEscenario(t) {
  const share = { id_share: 1, name: 'Viaje', paid_amount: 120 };
  const repo = {
    findSplitByUserShare: t.mock.fn(async (_s, userId) => ({ id_user: userId, paid: 0 })),
    updateSplit: t.mock.fn(async () => {})
  };
  return { share, repo, servicio: new ShareSplitService(repo, {}) };
}

test('PU-21 | CP-23 | Rechazar distribución cuya suma es 90 %', async (t) => {
  const { share, repo, servicio } = crearEscenario(t);
  const porcentajes = [
    { id_user: 1, percentage: 60 },
    { id_user: 2, percentage: 30 }
  ];

  await assert.rejects(() => servicio.modifyPercentage(share, porcentajes), {
    message: 'Los porcentajes deben sumar 100'
  });
  assert.equal(repo.updateSplit.mock.callCount(), 0, 'No debe actualizar ningún split');
});

test('PU-22 | CP-23 | Rechazar distribución cuya suma es 110 %', async (t) => {
  const { share, repo, servicio } = crearEscenario(t);
  const porcentajes = [
    { id_user: 1, percentage: 70 },
    { id_user: 2, percentage: 40 }
  ];

  await assert.rejects(() => servicio.modifyPercentage(share, porcentajes), {
    message: 'Los porcentajes deben sumar 100'
  });
  assert.equal(repo.updateSplit.mock.callCount(), 0, 'No debe actualizar ningún split');
});
