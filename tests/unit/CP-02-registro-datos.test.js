import test from 'node:test'; 
import assert from 'node:assert/strict';
import userValidator from '../../src/middleware/userValidator.js';
import { ejecutarValidacion, erroresDe } from '../helpers/mocks.js';

// Plan de Pruebas MoneyShare EAM, CP-02 (HU-001): validación de nombre, usuario y correo.
const datosValidos = () => ({
  name: 'Camila Botero',
  email: 'camila@example.com',
  username: 'camila123',
  password: 'ClaveSegura123!',
  tel: '3001234567'
});

const registrar = (body) =>
  ejecutarValidacion(userValidator.registerValidator, userValidator.validatorUser, body);

test('PU-01 | CP-02 | Rechazar nombre de 2 caracteres', async () => {
  const body = { ...datosValidos(), name: 'Ab' };
  const { errores, res, next } = await registrar(body);

  assert.equal(erroresDe(errores, 'name').length > 0, true, 'El nombre de 2 caracteres debe generar error');
  assert.equal(erroresDe(errores, 'name').length, errores.length, 'Solo debe fallar el campo name');
  assert.equal(res.statusCode, 400);
  assert.equal(next.llamado, false);
});

test('PU-02 | CP-02 | Rechazar nombre de usuario de 2 caracteres', async () => {
  const body = { ...datosValidos(), username: 'ab' };
  const { errores, res, next } = await registrar(body);

  assert.equal(erroresDe(errores, 'username').length > 0, true, 'El username de 2 caracteres debe generar error');
  assert.equal(erroresDe(errores, 'username').length, errores.length, 'Solo debe fallar el campo username');
  assert.equal(res.statusCode, 400);
  assert.equal(next.llamado, false);
});

test('PU-03 | CP-02 | Rechazar correo electrónico con formato inválido', async () => {
  const body = { ...datosValidos(), email: 'correo-sin-arroba.com' };
  const { errores, res, next } = await registrar(body);

  assert.equal(erroresDe(errores, 'email').length > 0, true, 'El email inválido debe generar error');
  assert.equal(erroresDe(errores, 'email').length, errores.length, 'Solo debe fallar el campo email');
  assert.equal(res.statusCode, 400);
  assert.equal(next.llamado, false);
});
