import test from 'node:test';
import assert from 'node:assert/strict';
import ShareSplitService from '../../src/services/sharesplit-service.js';

// Plan de Pruebas MoneyShare EAM, CP-22 (HU-010): distribución personalizada.
test('PU-20 | CP-22 | Distribuir 120 entre dos integrantes con 70 % y 30 %: montos 84 y 36', async (t) => {
  const share = { id_share: 1, name: 'Viaje', paid_amount: 120 };
  const splitsPorUsuario = {
    1: { id_user: 1, paid: 120 },
    2: { id_user: 2, paid: 0 }
  };
  const repo = {
    findSplitByUserShare: t.mock.fn(async (_shareId, userId) => splitsPorUsuario[userId]),
    updateSplit: t.mock.fn(async () => {})
  };
  const servicio = new ShareSplitService(repo, {});
  const porcentajes = [
    { id_user: 1, percentage: 70 },
    { id_user: 2, percentage: 30 }
  ];

  await servicio.modifyPercentage(share, porcentajes);

  const llamadas = repo.updateSplit.mock.calls.map((c) => c.arguments);
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas[0], [{ percentage: 70, assigned_amount: 84, balance: 36 }, 1, 1]);
  assert.deepEqual(llamadas[1], [{ percentage: 30, assigned_amount: 36, balance: -36 }, 2, 1]);
});
