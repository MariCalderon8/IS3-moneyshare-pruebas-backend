import test from 'node:test';
import assert from 'node:assert/strict';
import userValidator from '../../src/middleware/userValidator.js';
import { ejecutarValidacion, erroresDe } from '../helpers/mocks.js';

// Plan de Pruebas MoneyShare EAM, CP-05 (HU-001, RU-011): validación de teléfono.
// Reutiliza la implementación original (registro-telefono.test.js), dividida en las PU-07 a PU-10.
// Datos válidos en los otros campos para aislar la regla RU-011.
const datosValidos = () => ({
  name: 'Camila Botero',
  email: 'camila@example.com',
  username: 'camila123',
  password: 'ClaveSegura123!'
});

// Ejecuta las mismas reglas usadas por POST /user/register.
const registrar = (tel) =>
  ejecutarValidacion(
    userValidator.registerValidator,
    userValidator.validatorUser,
    { ...datosValidos(), tel }
  );

async function verificarTelefono(tel, valido) {
  const { errores } = await registrar(tel);
  const erroresOtrosCampos = errores.filter((e) => e.path !== 'tel');
  assert.equal(erroresOtrosCampos.length, 0, `Otros campos no deberían fallar para el teléfono "${tel}"`);
  assert.equal(
    erroresDe(errores, 'tel').length === 0,
    valido,
    `Teléfono "${tel}": se esperaba ${valido ? 'aceptar' : 'rechazar'}`
  );
}

test('PU-07 | CP-05 | Rechazar teléfono de 9 dígitos', async () => {
  await verificarTelefono('123456789', false);
});

test('PU-08 | CP-05 | Aceptar teléfonos de 10 y 15 dígitos', async (t) => {
  const variantes = [
    { nombre: '10 dígitos', tel: '1234567890' },
    { nombre: '15 dígitos', tel: '123456789012345' }
  ];
  for (const { nombre, tel } of variantes) {
    await t.test(`Teléfono de ${nombre}`, async () => {

      await verificarTelefono(tel, true);
    });
  }
});

test('PU-09 | CP-05 | Rechazar teléfono de 16 dígitos', async () => {
  await verificarTelefono('1234567890123456', false);
});

test('PU-10 | CP-05 | Rechazar teléfono con letras o símbolos', async (t) => {
  const variantes = [
    { nombre: 'con letras', tel: '30012345ab' },
    { nombre: 'con prefijo +', tel: '+573001234567' },
    { nombre: 'con guiones', tel: '300-123-4567' },
    { nombre: 'con espacios', tel: '300 123 4567' }
  ];
  for (const { nombre, tel } of variantes) {
    await t.test(`Teléfono ${nombre}`, async () => {

      await verificarTelefono(tel, false);
    });
  }
});
