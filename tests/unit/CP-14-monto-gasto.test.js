import test from 'node:test';
import assert from 'node:assert/strict';
import expenseValidator from '../../src/middleware/expenseValidator.js';
import { ejecutarValidacion, erroresDe } from '../helpers/mocks.js';

// Plan de Pruebas MoneyShare EAM, CP-14 (HU-006): validación de monto de gasto.
const crear = (amount) =>
  ejecutarValidacion(
    expenseValidator.createExpenseValidator,
    expenseValidator.validatorExpense,
    { id_share: 1, amount, category: 'Comida', date: '2026-11-20' }
  );

test('PU-16 | CP-14 | Rechazar monto cero o negativo', async (t) => {
  const variantes = [
    { nombre: 'cero', amount: 0 },
    { nombre: 'negativo', amount: -50 }
  ];
  for (const { nombre, amount } of variantes) {
    await t.test(`Monto ${nombre}`, async () => {
      const { errores, res, next } = await crear(amount);

      assert.equal(erroresDe(errores, 'amount').length > 0, true, `El monto ${amount} debe rechazarse`);
      assert.equal(erroresDe(errores, 'amount').length, errores.length, 'Solo debe fallar amount');
      assert.equal(res.statusCode, 400);
      assert.equal(next.llamado, false);
    });
  }
});

test('PU-17 | CP-14 | Aceptar monto positivo válido', async () => {
  const amount = 150.5;
  const { errores, res, next } = await crear(amount);

  assert.equal(errores.length, 0, 'No debe haber errores de validación');
  assert.equal(res.statusCode, undefined);
  assert.equal(next.llamado, true);
});
