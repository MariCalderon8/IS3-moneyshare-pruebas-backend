import test from 'node:test';
import assert from 'node:assert/strict';
import { validationResult } from 'express-validator';
import userValidator from '../../src/middleware/userValidator.js';

// Plan de Pruebas MoneyShare EAM, CP-05 (HU-001, RU-011).
// Una prueba unitaria con cuatro valores limite; no utiliza API, BD ni correo.
test('CP-05: telefono de registro debe tener entre 10 y 15 digitos', async () => {
  const escenarios = [
    { telefono: '123456789', valido: false },      // 9 digitos: rechazar
    { telefono: '1234567890', valido: true },      // 10 digitos: aceptar
    { telefono: '123456789012345', valido: true }, // 15 digitos: aceptar
    { telefono: '1234567890123456', valido: false } // 16 digitos: rechazar
  ];

  for (const { telefono, valido } of escenarios) {
    // Datos validos en los otros campos para aislar la regla RU-011.
    const req = {
      body: {
        name: 'Camila Botero',
        email: 'camila@example.com',
        username: 'camila123',
        password: 'ClaveSegura123!',
        tel: telefono
      }
    };

    // Ejecutamos las mismas reglas usadas por POST /user/register.
    for (const regla of userValidator.registerValidator) {
      await regla.run(req);
    }

    const errores = validationResult(req).array();
    const erroresTelefono = errores.filter((error) => error.path === 'tel');
    const erroresOtrosCampos = errores.filter((error) => error.path !== 'tel');

    assert.equal(
      erroresOtrosCampos.length,
      0,
      `Otros campos no deberian fallar para el telefono ${telefono}`
    );
    assert.equal(
      erroresTelefono.length === 0,
      valido,
      `Telefono ${telefono.length} digitos: se esperaba ${valido ? 'aceptar' : 'rechazar'}`
    );
  }
});
