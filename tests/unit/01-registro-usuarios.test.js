import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { UniqueConstraintError } from 'sequelize';
import userValidator from '../../src/middleware/userValidator.js';
import UserRepository from '../../src/repositories/user-repository.js';
import UserService from '../../src/services/user-service.js';
import UserController from '../../src/controllers/user-controller.js';
import User from '../../src/dto/UserDTO.js';
import { createRes, validar, camposConError, ejecutarRuta } from '../helpers/express-helpers.js';

// Iteracion 1 - Registro de usuarios (HU-001) - CP-01 a CP-05
const VALIDO = {
  name: 'Camila Botero',
  email: 'camila@example.com',
  username: 'camila123',
  password: 'ClaveSegura123!',
  tel: '3001234567'
};
const registro = (cambios) => ({ ...VALIDO, ...cambios });
const mensajes = (errores, campo) => errores.filter((e) => e.path === campo).map((e) => e.msg);

afterEach(() => mock.restoreAll());

describe('CP-01: registrar usuario con datos válidos (RU-001, RU-007–011, RU-111)', () => {
  it('el validador de registro acepta datos válidos', async () => {
    assert.deepEqual(await validar(userValidator.registerValidator, VALIDO), []);
  });

  it('persiste nombre, correo, usuario y teléfono, y NO guarda la contraseña en texto plano', async () => {
    const crear = mock.method(User, 'create', async (datos) => ({ ...datos, id_user: 10 }));

    const usuario = await new UserRepository().register(VALIDO);

    assert.equal(crear.mock.callCount(), 1);
    const guardado = crear.mock.calls[0].arguments[0];
    assert.equal(guardado.name, VALIDO.name);
    assert.equal(guardado.email, VALIDO.email);
    assert.equal(guardado.username, VALIDO.username);
    assert.equal(guardado.tel, VALIDO.tel);
    assert.notEqual(guardado.password, VALIDO.password, 'la contraseña no debe guardarse en claro');
    assert.match(guardado.password, /^\$2[aby]\$\d{2}\$/, 'debe ser un hash bcrypt');
    assert.equal(await bcrypt.compare(VALIDO.password, guardado.password), true);
    assert.equal(usuario.id_user, 10);
  });

  it('el servicio delega el registro en el repositorio y envía el correo de bienvenida', async () => {
    const repo = { register: mock.fn(async (info) => ({ id_user: 1, ...info })) };
    const service = new UserService(repo);
    service.emailService = { sendWelcomeEmail: mock.fn(async () => {}) }; // sin red

    const usuario = await service.register(VALIDO);

    assert.equal(repo.register.mock.callCount(), 1);
    assert.deepEqual(service.emailService.sendWelcomeEmail.mock.calls[0].arguments, [VALIDO.email, VALIDO.name]);
    assert.equal(usuario.id_user, 1);
  });

  it('el controlador responde 201 con el usuario creado', async () => {
    const controller = new UserController({ register: async (b) => ({ id_user: 1, ...b }) });
    const res = createRes();
    await controller.register({ body: VALIDO }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.email, VALIDO.email);
  });
});

describe('CP-02: nombre/usuario de 2 caracteres o correo inválido (RU-002, RU-003, RU-005)', () => {
  it('rechaza nombre de 2 caracteres y acepta el límite de 3', async () => {
    assert.deepEqual(camposConError(await validar(userValidator.registerValidator, registro({ name: 'Jo' }))), ['name']);
    assert.deepEqual(await validar(userValidator.registerValidator, registro({ name: 'Ana' })), []);
  });

  it('rechaza nombre de usuario de 2 caracteres y acepta el límite de 3', async () => {
    assert.deepEqual(camposConError(await validar(userValidator.registerValidator, registro({ username: 'ab' }))), ['username']);
    assert.deepEqual(await validar(userValidator.registerValidator, registro({ username: 'abc' })), []);
  });

  for (const email of ['correo-invalido', 'sin-arroba.com', 'a@', '@dominio.com', 'con espacio@dominio.com']) {
    it(`rechaza el correo sin formato válido: "${email}"`, async () => {
      const errores = await validar(userValidator.registerValidator, registro({ email }));
      assert.deepEqual(camposConError(errores), ['email']);
      assert.match(mensajes(errores, 'email')[0], /email válido/);
    });
  }

  it('rechaza campos obligatorios ausentes', async () => {
    const errores = await validar(userValidator.registerValidator, {});
    assert.deepEqual(camposConError(errores).sort(), ['email', 'name', 'password', 'tel', 'username']);
  });

  it('la petición inválida se corta con 400 e informa el campo, sin llegar al controlador', async () => {
    const register = mock.fn();
    const res = createRes();
    const { bloqueada } = await ejecutarRuta(
      [...userValidator.registerValidator, userValidator.validatorUser, register],
      { body: registro({ name: 'Jo' }) }, res
    );
    assert.equal(bloqueada, true);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errors[0].path, 'name');
    assert.equal(register.mock.callCount(), 0);
  });
});

describe('CP-03: correo o usuario duplicado (RU-004, RU-006, RU-112–113)', () => {
  const errorDuplicado = () => new UniqueConstraintError({ message: 'Validation error', errors: [] });

  it('el repositorio propaga el error de unicidad y no devuelve una segunda cuenta', async () => {
    const crear = mock.method(User, 'create', async () => { throw errorDuplicado(); });
    await assert.rejects(() => new UserRepository().register(VALIDO), UniqueConstraintError);
    assert.equal(crear.mock.callCount(), 1);
  });

  it('el servicio propaga el rechazo del registro duplicado', async () => {
    const repo = { register: async () => { throw errorDuplicado(); } };
    const service = new UserService(repo);
    service.emailService = { sendWelcomeEmail: async () => {} };
    await assert.rejects(() => service.register(VALIDO), UniqueConstraintError);
  });

  it('el controlador responde 400 con mensaje de error (no 201)', async () => {
    const controller = new UserController({ register: async () => { throw errorDuplicado(); } });
    const res = createRes();
    await controller.register({ body: VALIDO }, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message);
    assert.equal(res.body.data, undefined);
  });

  it('el modelo declara unicidad de correo y nombre de usuario a nivel de persistencia', () => {
    assert.equal(User.rawAttributes.email.unique, true);
    assert.equal(User.rawAttributes.username.unique, true);
  });

  // it('DEFECTO: no debe enviarse el correo de bienvenida si el registro falla',
  //   { todo: 'DEF-01: UserService.register envía el correo ANTES de crear la cuenta (user-service.js:11-12)' },
  //   async () => {
  //     const repo = { register: async () => { throw errorDuplicado(); } };
  //     const service = new UserService(repo);
  //     service.emailService = { sendWelcomeEmail: mock.fn(async () => {}) };
  //     await assert.rejects(() => service.register(VALIDO));
  //     assert.equal(service.emailService.sendWelcomeEmail.mock.callCount(), 0);
  //   });
});

describe('CP-04: reglas de contraseña (RU-007–RU-010)', () => {
  const casos = [
    { descripcion: '7 caracteres', password: 'Abc12!x', regla: /mínimo 8 caracteres/ },
    { descripcion: 'sin mayúscula', password: 'clave1234!', regla: /mayúscula/ },
    { descripcion: 'sin número', password: 'ClaveSegura!', regla: /número/ },
    { descripcion: 'sin carácter especial', password: 'ClaveSegura123', regla: /caracter especial/ }
  ];

  for (const { descripcion, password, regla } of casos) {
    it(`rechaza contraseña ${descripcion} y solo reporta esa regla`, async () => {
      const errores = await validar(userValidator.registerValidator, registro({ password }));
      assert.deepEqual(camposConError(errores), ['password']);
      const msgs = mensajes(errores, 'password');
      assert.equal(msgs.length, 1, `se esperaba una sola regla violada, hubo: ${msgs.join(' | ')}`);
      assert.match(msgs[0], regla);
    });
  }

  it('acepta el límite inferior (8 caracteres) y el superior (100)', async () => {
    assert.deepEqual(await validar(userValidator.registerValidator, registro({ password: 'Abcdef1!' })), []);
    assert.deepEqual(await validar(userValidator.registerValidator, registro({ password: 'A1!' + 'a'.repeat(97) })), []);
  });

  it('rechaza más de 100 caracteres', async () => {
    const errores = await validar(userValidator.registerValidator, registro({ password: 'A1!' + 'a'.repeat(98) }));
    assert.deepEqual(camposConError(errores), ['password']);
  });

  for (const especial of ['!', '@', '#', '$', '%', '&', '*', '_', '-', '.']) {
    it(`acepta el carácter especial "${especial}"`, async () => {
      assert.deepEqual(await validar(userValidator.registerValidator, registro({ password: `Clave123${especial}` })), []);
    });
  }
});

describe('CP-05: teléfono de 9, 10, 15 y 16 dígitos (RU-011)', () => {
  const escenarios = [
    { tel: '123456789', valido: false },       // 9 dígitos: rechazar
    { tel: '1234567890', valido: true },       // 10 dígitos: aceptar
    { tel: '123456789012345', valido: true },  // 15 dígitos: aceptar
    { tel: '1234567890123456', valido: false } // 16 dígitos: rechazar
  ];

  for (const { tel, valido } of escenarios) {
    it(`${tel.length} dígitos: ${valido ? 'se acepta' : 'se rechaza'}`, async () => {
      const errores = await validar(userValidator.registerValidator, registro({ tel }));
      assert.deepEqual(camposConError(errores), valido ? [] : ['tel']);
    });
  }

  for (const tel of ['300abc4567', '300-123-4567', '+573001234567', '300 123 4567', '']) {
    it(`rechaza teléfono no numérico: "${tel}"`, async () => {
      assert.deepEqual(camposConError(await validar(userValidator.registerValidator, registro({ tel }))), ['tel']);
    });
  }

  it('rechaza teléfono enviado como número (debe ser cadena)', async () => {
    assert.deepEqual(camposConError(await validar(userValidator.registerValidator, registro({ tel: 3001234567 }))), ['tel']);
  });
});
