import test from 'node:test';
import assert from 'node:assert/strict';
import ShareService from '../../src/services/share-service.js';

// Plan de Pruebas MoneyShare EAM, CP-30 (HU-012): compensación superior al saldo.
// Pagador (id 10): obligación de 60, aún sin pagar. Receptor (id 20): pagó 120, saldo a favor de 60.
function crearEscenario(t) {
  const share = { id_share: 1, name: 'Viaje', type: 'share_expense' };
  const splits = {
    10: { id_user: 10, paid: 0, assigned_amount: 60, balance: -60 },
    20: { id_user: 20, paid: 120, assigned_amount: 60, balance: 60 }
  };
  const usuarios = {
    10: { id_user: 10, username: 'pagador' },
    20: { id_user: 20, username: 'receptor' }
  };

  const shareRepository = { findShareById: t.mock.fn(async () => share) };
  const shareSplitService = {
    findSplitByUserShare: t.mock.fn(async (_shareId, userId) => splits[userId]),
    updateSplit: t.mock.fn(async () => {})
  };
  const userService = { findById: t.mock.fn(async (id) => usuarios[id]) };
  const notificationService = {
    createMakePaymentNotification: t.mock.fn(async () => {}),
    createReceivePaymentNotification: t.mock.fn(async () => {})
  };
  const servicio = new ShareService(shareRepository, shareSplitService, userService, {}, notificationService);
  return { servicio, shareSplitService, notificationService };
}

test('PU-23 | CP-30 | Rechazar compensación de 61 con saldo a favor del receptor de 60', async (t) => {
  const { servicio, shareSplitService, notificationService } = crearEscenario(t);

  await assert.rejects(() => servicio.makePayment(1, 61, 10, 20), {
    message: 'El monto excede el total a pagar'
  });
  assert.equal(shareSplitService.updateSplit.mock.callCount(), 0, 'No debe actualizar balances');
  assert.equal(notificationService.createMakePaymentNotification.mock.callCount(), 0);
  assert.equal(notificationService.createReceivePaymentNotification.mock.callCount(), 0);
});

test('PU-24 | CP-30 | Aceptar compensación de 60 con saldo a favor de 60 y obligación suficiente', async (t) => {
  const { servicio, shareSplitService, notificationService } = crearEscenario(t);
  await servicio.makePayment(1, 60, 10, 20);

  // Assert: actualizaciones de balances
  const llamadas = shareSplitService.updateSplit.mock.calls.map((c) => c.arguments);
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas[0], [{ paid: 60, balance: 0 }, 10, 1]); // pagador
  assert.deepEqual(llamadas[1], [{ paid: 60, balance: 0 }, 20, 1]); // receptor
  // Assert: notificaciones
  assert.deepEqual(notificationService.createMakePaymentNotification.mock.calls[0].arguments, [10, 'Viaje', 'receptor', 60]);
  assert.deepEqual(notificationService.createReceivePaymentNotification.mock.calls[0].arguments, [20, 'Viaje', 'pagador', 60]);
});
