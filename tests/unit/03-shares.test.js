import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import shareValidator from '../../src/middleware/shareValidator.js';
import ShareController from '../../src/controllers/share-controller.js';
import Share from '../../src/dto/ShareDTO.js';
import { createRes, validar, camposConError, ejecutarRuta } from '../helpers/express-helpers.js';
import { construirMundo, crearShare, ANA, BETO, CARLA } from '../helpers/fakes.js';

// Iteracion 1 - Shares: creacion, codigo e incorporacion (HU-003, HU-004) - CP-09 a CP-12
afterEach(() => mock.restoreAll());

describe('CP-09: crear Share con nombre válido (RU-016–018, RU-022–027)', () => {
  it('createCode genera códigos alfanuméricos de exactamente 8 caracteres', async () => {
    const { shareService } = construirMundo();
    const codigos = [];
    for (let i = 0; i < 500; i++) codigos.push(await shareService.createCode());
    for (const c of codigos) assert.match(c, /^[A-Za-z0-9]{8}$/);
    assert.equal(new Set(codigos).size, codigos.length, 'no se esperan repetidos en 500 códigos');
  });

  it('el creador queda identificado a partir del usuario autenticado', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: BETO, nombre: 'Casa compartida' });
    assert.equal(share.id_creator, BETO.id_user);
    assert.equal(share.name, 'Casa compartida');
  });

  it('el código generado es alfanumérico de 8 caracteres y queda guardado en el Share', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);
    assert.match(share.code, /^[A-Za-z0-9]{8}$/);
  });

  it('el creador se incorpora automáticamente como participante con su distribución inicial', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);
    const splits = await mundo.shareSplitRepository.findSplitsByShare(share.id_share);
    assert.equal(splits.length, 1);
    assert.equal(splits[0].id_user, ANA.id_user);
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 100, asignado: 0, pagado: 0, balance: 0 });
  });

  it('si el código generado ya pertenece a otro Share, genera uno nuevo (unicidad, RU-025)', async () => {
    const mundo = construirMundo();
    const existente = await crearShare(mundo, { nombre: 'Primer share' });
    const secuencia = [existente.code, existente.code, 'NuevoCod'];
    const crearCodigo = mock.method(mundo.shareService, 'createCode', async () => secuencia.shift());

    const segundo = await crearShare(mundo, { creador: BETO, nombre: 'Segundo share' });

    assert.equal(segundo.code, 'NuevoCod');
    assert.equal(crearCodigo.mock.callCount(), 3, 'reintentó hasta obtener un código libre');
    assert.notEqual(segundo.code, existente.code);
  });

  it('validateCode devuelve false para un código existente y true para uno libre', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);
    assert.equal(await mundo.shareService.validateCode(share.code), false);
    assert.equal(await mundo.shareService.validateCode('LIBRE123'), true);
  });

  it('el validador acepta un Share con nombre válido y descripción/fecha opcionales', async () => {
    assert.deepEqual(await validar(shareValidator.createShareValidator, { name: 'Viaje' }), []);
    assert.deepEqual(await validar(shareValidator.createShareValidator,
      { name: 'Viaje', description: 'Gastos del viaje', due_date: '2026-12-31' }), []);
  });

  it('el modelo declara el código como único (RU-114)', () => {
    assert.equal(Share.rawAttributes.code.unique, true);
  });

  it('el controlador responde 201 con el Share creado', async () => {
    const service = { createShare: mock.fn(async (d) => ({ id_share: 1, ...d })) };
    const res = createRes();
    await new ShareController(service).createShare(
      { body: { name: 'Viaje' }, dataToken: { userEmail: ANA.email } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.message, 'Share creado exitosamente');
    assert.deepEqual(service.createShare.mock.calls[0].arguments[1], ANA.email);
  });
});

describe('CP-10: Share con nombre de 2 caracteres o fecha inválida (RU-018, RU-021)', () => {
  it('rechaza nombre de 2 caracteres y acepta el límite de 3', async () => {
    assert.deepEqual(camposConError(await validar(shareValidator.createShareValidator, { name: 'ab' })), ['name']);
    assert.deepEqual(await validar(shareValidator.createShareValidator, { name: 'abc' }), []);
  });

  it('rechaza nombre ausente y nombre de más de 100 caracteres', async () => {
    assert.deepEqual(camposConError(await validar(shareValidator.createShareValidator, {})), ['name']);
    assert.deepEqual(camposConError(await validar(shareValidator.createShareValidator, { name: 'a'.repeat(101) })), ['name']);
    assert.deepEqual(await validar(shareValidator.createShareValidator, { name: 'a'.repeat(100) }), []);
  });

  for (const due_date of ['mañana', '31/12/2026', '2026-13-45', 'abc']) {
    it(`rechaza fecha de vencimiento inválida: "${due_date}"`, async () => {
      assert.deepEqual(camposConError(await validar(shareValidator.createShareValidator, { name: 'Viaje', due_date })), ['due_date']);
    });
  }

  for (const due_date of ['2026-12-31', '2026-12-31T23:59:59Z']) {
    it(`acepta fecha ISO 8601 válida: "${due_date}"`, async () => {
      assert.deepEqual(await validar(shareValidator.createShareValidator, { name: 'Viaje', due_date }), []);
    });
  }

  it('la solicitud inválida se corta con 400 y NO se crea ningún Share', async () => {
    const mundo = construirMundo();
    const controller = new ShareController(mundo.shareService);
    const res = createRes();
    const { bloqueada } = await ejecutarRuta(
      [...shareValidator.createShareValidator, shareValidator.validatorShare, controller.createShare],
      { body: { name: 'ab', due_date: 'no-es-fecha' }, dataToken: { userEmail: ANA.email } }, res);

    assert.equal(bloqueada, true);
    assert.equal(res.statusCode, 400);
    assert.equal(mundo.shareRepository.rows.length, 0);
    assert.equal(mundo.shareSplitRepository.rows.length, 0);
  });
});

describe('CP-11: unirse por código válido y repetir la unión (RU-030, RU-032, RU-033)', () => {
  it('la primera unión crea el miembro y recalcula la distribución equitativa', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);

    const devuelto = await mundo.shareService.addMember(share.code, BETO.email);

    assert.equal(devuelto.id_share, share.id_share);
    const splits = await mundo.shareSplitRepository.findSplitsByShare(share.id_share);
    assert.equal(splits.length, 2);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pct, 50);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).pct, 50);
  });

  it('la segunda unión del mismo usuario se rechaza y no duplica al integrante', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { miembros: [BETO] });

    await assert.rejects(
      () => mundo.shareService.addMember(share.code, BETO.email),
      { message: 'El usuario ya está registrado en el share' });

    const splits = await mundo.shareSplitRepository.findSplitsByShare(share.id_share);
    assert.equal(splits.filter((s) => s.id_user === BETO.id_user).length, 1);
    assert.equal(splits.length, 2);
  });

  it('el creador tampoco puede volver a unirse a su propio Share', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);
    await assert.rejects(() => mundo.shareService.addMember(share.code, ANA.email),
      { message: 'El usuario ya está registrado en el share' });
    assert.equal(mundo.shareSplitRepository.rows.length, 1);
  });

  it('con split_equally = false no se reajustan los porcentajes de los demás', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { extra: { split_equally: false } });
    await mundo.shareService.addMember(share.code, BETO.email);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pct, 0);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).pct, 0);
  });

  it('el controlador responde 200 al unirse y 400 con el mensaje cuando falla', async () => {
    const ok = createRes();
    await new ShareController({ addMember: async () => ({ id_share: 1 }) })
      .addMember({ body: { code: 'ABCDEFGH' }, dataToken: { userEmail: BETO.email } }, ok);
    assert.equal(ok.statusCode, 200);

    mock.method(console, 'error', () => {});
    const fallo = createRes();
    await new ShareController({ addMember: async () => { throw new Error('Share no encontrado'); } })
      .addMember({ body: { code: 'X' }, dataToken: { userEmail: BETO.email } }, fallo);
    assert.equal(fallo.statusCode, 400);
    assert.equal(fallo.body.message, 'Share no encontrado');
  });

  // it('DEFECTO: un intento de unión repetido no debe generar otra notificación "Te uniste"',
  //   { todo: 'DEF-02: ShareService.addMember notifica ANTES de validar que el usuario ya es miembro (share-service.js:115-118)' },
  //   async () => {
  //     const mundo = construirMundo();
  //     const share = await crearShare(mundo, { miembros: [BETO] });
  //     await mundo.settle();
  //     const antes = (await mundo.notificacionesDe(BETO.id_user)).length;

  //     await assert.rejects(() => mundo.shareService.addMember(share.code, BETO.email));
  //     await mundo.settle();

  //     assert.equal((await mundo.notificacionesDe(BETO.id_user)).length, antes);
  //   });
});

describe('CP-12: código inexistente y consulta de Shares por usuario (RU-028–RU-031)', () => {
  it('un código inexistente genera error y no crea miembros ni notificaciones', async () => {
    const mundo = construirMundo();
    await crearShare(mundo);
    const splitsAntes = mundo.shareSplitRepository.snapshot();
    const notifAntes = mundo.notificationRepository.rows.length;

    await assert.rejects(() => mundo.shareService.addMember('NOEXISTE', BETO.email), { message: 'Share no encontrado' });

    assert.equal(mundo.shareSplitRepository.snapshot(), splitsAntes);
    assert.equal(mundo.notificationRepository.rows.length, notifAntes);
  });

  it('un usuario inexistente no puede unirse', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);
    await assert.rejects(() => mundo.shareService.addMember(share.code, 'fantasma@example.com'),
      { message: 'Usuario no encontrado' });
  });

  it('findShareByCode localiza el Share por su código y devuelve null si no existe (RU-028)', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo);
    assert.equal((await mundo.shareService.findShareByCode(share.code)).id_share, share.id_share);
    assert.equal(await mundo.shareService.findShareByCode('NOEXISTE'), null);
  });

  it('cada usuario consulta únicamente los Shares en los que participa (RU-029)', async () => {
    const mundo = construirMundo();
    const s1 = await crearShare(mundo, { creador: ANA, miembros: [BETO], nombre: 'Share de Ana y Beto' });
    const s2 = await crearShare(mundo, { creador: CARLA, nombre: 'Share de Carla' });

    const deAna = await mundo.shareService.findSharesByUser(ANA.email);
    const deBeto = await mundo.shareService.findSharesByUser(BETO.email);
    const deCarla = await mundo.shareService.findSharesByUser(CARLA.email);

    assert.deepEqual(deAna.map((s) => s.id_share), [s1.id_share]);
    assert.deepEqual(deBeto.map((s) => s.id_share), [s1.id_share]);
    assert.deepEqual(deCarla.map((s) => s.id_share), [s2.id_share]);
  });

  it('un usuario sin Shares recibe una lista vacía y un correo inválido es rechazado', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA });
    assert.deepEqual(await mundo.shareService.findSharesByUser(CARLA.email), []);
    await assert.rejects(() => mundo.shareService.findSharesByUser('fantasma@example.com'), { message: 'Email no válido' });
  });
});
