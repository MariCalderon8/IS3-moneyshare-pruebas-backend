import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import verifyToken from '../../src/middleware/verifyToken.js';
import { crearRes, crearNext } from '../helpers/mocks.js';

// Plan de Pruebas MoneyShare EAM, CP-08 (HU-002): validación de token JWT.
// `req`, `res`, `next` y `jwt.verify()` están simulados; no hay servidor ni secretos reales.
process.env.JWT_SECRET = 'secreto-de-prueba';

test('PU-11 | CP-08 | Solicitud sin token responde HTTP 401', (t) => {
  const verify = t.mock.method(jwt, 'verify', () => ({}));
  const req = { headers: {} };
  const res = crearRes();
  const next = crearNext();
  verifyToken(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.llamado, false);
  assert.equal(verify.mock.callCount(), 0, 'No debe intentar verificar un token inexistente');
  assert.equal(req.dataToken, undefined);
});

test('PU-12 | CP-08 | Token inválido o expirado responde HTTP 403', async (t) => {
  const variantes = [
    { nombre: 'token inválido', error: Object.assign(new Error('invalid signature'), { name: 'JsonWebTokenError' }) },
    { nombre: 'token expirado', error: Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }) }
  ];

  for (const { nombre, error } of variantes) {
    await t.test(`Variante: ${nombre}`, (st) => {
      st.mock.method(console, 'error', () => {}); // silencia el log del middleware
      const verify = st.mock.method(jwt, 'verify', () => {
        throw error;
      });
      const req = { headers: { authorization: 'Bearer token-cualquiera' } };
      const res = crearRes();
      const next = crearNext();
      verifyToken(req, res, next);

      assert.equal(res.statusCode, 403);
      assert.equal(next.llamado, false);
      assert.equal(verify.mock.callCount(), 1);
      assert.equal(req.dataToken, undefined);
    });
  }
});

test('PU-13 | CP-08 | Token válido autoriza la solicitud y asigna los datos decodificados', (t) => {
  const decodificado = { id: 7, email: 'camila@example.com' };
  const verify = t.mock.method(jwt, 'verify', () => decodificado);
  const req = { headers: { authorization: 'Bearer token-valido' } };
  const res = crearRes();
  const next = crearNext();
  verifyToken(req, res, next);

  assert.equal(next.llamado, true, 'Debe ejecutar next()');
  assert.equal(res.statusCode, undefined, 'No debe responder con error');
  assert.deepEqual(req.dataToken, decodificado);
  assert.deepEqual(verify.mock.calls[0].arguments, ['token-valido', 'secreto-de-prueba']);
});
