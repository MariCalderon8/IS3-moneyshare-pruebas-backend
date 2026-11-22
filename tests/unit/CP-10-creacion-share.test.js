import test from 'node:test';
import assert from 'node:assert/strict';
import shareValidator from '../../src/middleware/shareValidator.js';
import { ejecutarValidacion, erroresDe } from '../helpers/mocks.js';

// Plan de Pruebas MoneyShare EAM, CP-10 (HU-004): validación de creación de Share.
const datosValidos = () => ({
  name: 'Viaje Cartagena',
  description: 'Gastos del viaje',
  due_date: '2026-12-31'
});

const crear = (body) =>
  ejecutarValidacion(shareValidator.createShareValidator, shareValidator.validatorShare, body);

test('PU-14 | CP-10 | Rechazar nombre de Share de 2 caracteres', async () => {
  const body = { ...datosValidos(), name: 'Ab' };
  const { errores, res, next } = await crear(body);

  assert.equal(erroresDe(errores, 'name').length > 0, true, 'El nombre de 2 caracteres debe generar error');
  assert.equal(erroresDe(errores, 'name').length, errores.length, 'Solo debe fallar el campo name');
  assert.equal(res.statusCode, 400);
  assert.equal(next.llamado, false);
});

test('PU-15 | CP-10 | Rechazar fecha de vencimiento inválida', async (t) => {
  const variantes = [
    { nombre: 'texto no fecha', due_date: 'no-es-una-fecha' },
    { nombre: 'mes inexistente', due_date: '2026-13-45' },
    { nombre: 'formato DD/MM/AAAA', due_date: '31/12/2026' }
  ];
  for (const { nombre, due_date } of variantes) {
    await t.test(`Fecha ${nombre}`, async () => {
      const { errores, res, next } = await crear({ ...datosValidos(), due_date });

      assert.equal(erroresDe(errores, 'due_date').length > 0, true, `La fecha "${due_date}" debe rechazarse`);
      assert.equal(erroresDe(errores, 'due_date').length, errores.length, 'Solo debe fallar due_date');
      assert.equal(res.statusCode, 400);
      assert.equal(next.llamado, false);
    });
  }
});
