import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import userValidator from '../../src/middleware/userValidator.js';
import verifyToken from '../../src/middleware/verifyToken.js';
import UserRepository from '../../src/repositories/user-repository.js';
import UserController from '../../src/controllers/user-controller.js';
import User from '../../src/dto/UserDTO.js';
import userRouter from '../../src/routes/user.js';
import shareRouter from '../../src/routes/share.js';
import expenseRouter from '../../src/routes/expense.js';
import shareSplitRouter from '../../src/routes/shareSplit.js';
import notificationRouter from '../../src/routes/notification.js';
import aiChatRouter from '../../src/routes/aichat.js';
import { createRes, validar, camposConError, ejecutarRuta } from '../helpers/express-helpers.js';

// Iteracion 1 - Autenticacion y token JWT (HU-002) - CP-06 a CP-08
const CORREO = 'camila@example.com';
const CLAVE = 'ClaveSegura123!';
let hash;

async function usuarioRegistrado() {
  hash ??= await bcrypt.hash(CLAVE, 4); // costo bajo: solo para velocidad de la prueba
  return { id_user: 1, email: CORREO, password: hash };
}
async function iniciarSesion() {
  mock.method(User, 'findOne', async () => usuarioRegistrado());
  return new UserRepository().login({ email: CORREO, password: CLAVE });
}
function reqConToken(token) {
  return { headers: { authorization: token === undefined ? undefined : `Bearer ${token}` } };
}

afterEach(() => mock.restoreAll());

describe('CP-06: inicio de sesión con credenciales correctas (RU-012, RU-014)', () => {
  it('genera un token JWT firmado, con el correo del usuario y vigencia de 1 hora', async () => {
    const { login, token } = await iniciarSesion();
    assert.equal(login, true);
    assert.equal(token.split('.').length, 3, 'un JWT tiene 3 segmentos');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(payload.userEmail, CORREO);
    assert.equal(payload.exp - payload.iat, 3600);
  });

  it('busca al usuario por correo', async () => {
    const buscar = mock.method(User, 'findOne', async () => usuarioRegistrado());
    await new UserRepository().login({ email: CORREO, password: CLAVE });
    assert.deepEqual(buscar.mock.calls[0].arguments[0], { where: { email: CORREO } });
  });

  it('el token generado es aceptado por el middleware de recursos protegidos', async () => {
    const { token } = await iniciarSesion();
    const req = reqConToken(token);
    const next = mock.fn();
    verifyToken(req, createRes(), next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(req.dataToken.userEmail, CORREO);
  });

  it('el controlador responde 200 con el token', async () => {
    const controller = new UserController({ login: async () => ({ login: true, token: 'abc.def.ghi' }) });
    const res = createRes();
    await controller.login({ body: { email: CORREO, password: CLAVE } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.token, 'abc.def.ghi');
  });

  it('el validador de login acepta correo y contraseña', async () => {
    assert.deepEqual(await validar(userValidator.loginValidator, { email: CORREO, password: CLAVE }), []);
  });
});

describe('CP-07: credenciales incorrectas (RU-013)', () => {
  it('rechaza una contraseña incorrecta y no entrega token', async () => {
    mock.method(console, 'error', () => {});
    mock.method(User, 'findOne', async () => usuarioRegistrado());
    await assert.rejects(
      () => new UserRepository().login({ email: CORREO, password: 'OtraClave123!' }),
      { message: 'Error en la autenticación' }
    );
  });

  it('rechaza un correo no registrado', async () => {
    mock.method(console, 'error', () => {});
    mock.method(User, 'findOne', async () => null);
    await assert.rejects(
      () => new UserRepository().login({ email: 'nadie@example.com', password: CLAVE }),
      { message: 'Error en la autenticación' }
    );
  });

  it('el controlador responde 400 y no incluye token', async () => {
    const controller = new UserController({ login: async () => { throw new Error('Error en la autenticación'); } });
    const res = createRes();
    await controller.login({ body: { email: CORREO, password: 'mala' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Error en el inicio de sesión');
    assert.equal(res.body.data, undefined);
  });

  it('el validador rechaza correo o contraseña vacíos y corta la petición con 400', async () => {
    assert.deepEqual(camposConError(await validar(userValidator.loginValidator, { email: CORREO, password: '' })), ['password']);
    assert.deepEqual(camposConError(await validar(userValidator.loginValidator, { email: '', password: CLAVE })), ['email']);

    const login = mock.fn();
    const res = createRes();
    const { bloqueada } = await ejecutarRuta(
      [...userValidator.loginValidator, userValidator.validatorUser, login],
      { body: { email: '', password: '' } }, res
    );
    assert.equal(bloqueada, true);
    assert.equal(res.statusCode, 400);
    assert.equal(login.mock.callCount(), 0);
  });

  it('una ruta protegida rechaza un token firmado con otro secreto (credenciales erróneas)', () => {
    const falso = jwt.sign({ userEmail: CORREO }, 'otro-secreto');
    const res = createRes();
    const next = mock.fn();
    mock.method(console, 'error', () => {});
    verifyToken(reqConToken(falso), res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.callCount(), 0);
  });
});

describe('CP-08: recurso protegido sin token, alterado o expirado (RU-108–RU-110)', () => {
  const tokenValido = () => jwt.sign({ userEmail: CORREO }, process.env.JWT_SECRET, { expiresIn: '1h' });

  function intentar(req) {
    const res = createRes();
    const next = mock.fn();
    mock.method(console, 'error', () => {});
    verifyToken(req, res, next);
    return { res, next };
  }

  it('sin token: 401 y no continúa', () => {
    const { res, next } = intentar({ headers: {} });
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it('esquema distinto de Bearer: 401', () => {
    const { res, next } = intentar({ headers: { authorization: `Basic ${tokenValido()}` } });
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it('cabecera "Bearer " sin token: rechazada', () => {
    const { res, next } = intentar({ headers: { authorization: 'Bearer ' } });
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
    assert.equal(next.mock.callCount(), 0);
  });

  it('token alterado en el payload: 403', () => {
    const [h, , s] = tokenValido().split('.');
    const payloadFalso = Buffer.from(JSON.stringify({ userEmail: 'intruso@example.com', exp: 9999999999 })).toString('base64url');
    const { res, next } = intentar(reqConToken(`${h}.${payloadFalso}.${s}`));
    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.callCount(), 0);
  });

  it('token con la firma alterada: 403', () => {
    const t = tokenValido();
    const alterado = t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
    const { res, next } = intentar(reqConToken(alterado));
    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.callCount(), 0);
  });

  it('token expirado: 403 con mensaje de token inválido o expirado', () => {
    const expirado = jwt.sign({ userEmail: CORREO }, process.env.JWT_SECRET, { expiresIn: -60 });
    const { res, next } = intentar(reqConToken(expirado));
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /inválido o expirado/);
    assert.equal(next.mock.callCount(), 0);
  });

  it('token válido: continúa y expone el correo en req.dataToken', () => {
    const req = reqConToken(tokenValido());
    const { res, next } = intentar(req);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(res.statusCode, 200);
    assert.equal(req.dataToken.userEmail, CORREO);
  });

  it('todas las rutas de la API exigen verifyToken, salvo la lista de rutas públicas esperadas', () => {
    const routers = { '/user': userRouter, '/share': shareRouter, '/expense': expenseRouter,
      '/share-split': shareSplitRouter, '/notification': notificationRouter, '/ai-chat': aiChatRouter };
    const sinProteger = [];
    for (const [prefijo, router] of Object.entries(routers)) {
      for (const capa of router.stack.filter((l) => l.route)) {
        if (capa.route.stack[0].handle !== verifyToken) {
          for (const metodo of Object.keys(capa.route.methods)) {
            sinProteger.push(`${metodo.toUpperCase()} ${prefijo}${capa.route.path}`);
          }
        }
      }
    }
    // Públicas por diseño: registro, login y alta de notificación de bienvenida (se invoca al registrarse).
    assert.deepEqual(sinProteger.sort(), [
      'POST /notification/welcome',
      'POST /user/login',
      'POST /user/register'
    ]);
  });
});
