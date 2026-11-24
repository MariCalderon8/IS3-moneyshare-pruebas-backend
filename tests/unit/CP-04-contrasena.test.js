import test from 'node:test';
import assert from 'node:assert/strict';
import userValidator from '../../src/middleware/userValidator.js';
import { ejecutarValidacion, erroresDe } from '../helpers/mocks.js';

// Plan de Pruebas MoneyShare EAM, CP-04 (HU-001): validación de contraseña.
const datosValidos = () => ({
  name: 'Camila Botero',
  email: 'camila@example.com',
  username: 'camila123',
  password: 'ClaveSegura123!',
  tel: '3001234567'
});

const registrar = (password) =>
  ejecutarValidacion(
    userValidator.registerValidator,
    userValidator.validatorUser,
    { ...datosValidos(), password }
  );

test('PU-04 | CP-04 | Rechazar contraseña de 7 caracteres', async () => {
  // 7 caracteres con mayúscula, número y especial (solo falla la longitud).
  const password = 'Abcde1!';
  assert.equal(password.length, 7);
  const { errores, res, next } = await registrar(password);

  assert.equal(erroresDe(errores, 'password').length > 0, true, 'La contraseña de 7 caracteres debe generar error');
  assert.equal(erroresDe(errores, 'password').length, errores.length, 'Solo debe fallar el campo password');
  assert.equal(res.statusCode, 400);
  assert.equal(next.llamado, false);
});

test('PU-05 | CP-04 | Rechazar contraseña sin mayúscula, sin número o sin carácter especial', async (t) => {
  const variantes = [
    { nombre: 'sin mayúscula', password: 'clavesegura123!' },
    { nombre: 'sin número', password: 'ClaveSegura!!!' },
    { nombre: 'sin carácter especial', password: 'ClaveSegura123' }
  ];

  for (const { nombre, password } of variantes) {
    await t.test(`Contraseña ${nombre}`, async () => {
      const { errores, res, next } = await registrar(password);

      assert.equal(erroresDe(errores, 'password').length > 0, true, `La contraseña ${nombre} debe rechazarse`);
      assert.equal(erroresDe(errores, 'password').length, errores.length, 'Solo debe fallar el campo password');
      assert.equal(res.statusCode, 400);
      assert.equal(next.llamado, false);
    });
  }
});

test('PU-06 | CP-04 | Aceptar contraseña que cumple todas las reglas', async () => {
  const password = 'ClaveSegura123!';
  const { errores, res, next } = await registrar(password);

  assert.equal(errores.length, 0, 'No debe haber errores de validación');
  assert.equal(res.statusCode, undefined, 'No debe responder con error');
  assert.equal(next.llamado, true, 'Debe continuar con next()');
});
