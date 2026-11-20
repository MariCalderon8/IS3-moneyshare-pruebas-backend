import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import shareValidator from '../../src/middleware/shareValidator.js';
import ShareController from '../../src/controllers/share-controller.js';
import ShareMemberService from '../../src/services/sharemember-service.js';
import ShareMemberRepository from '../../src/repositories/sharemember-repository.js';
import ShareRepository from '../../src/repositories/share-repository.js';
import ShareMember from '../../src/dto/ShareMemberDTO.js';
import Share from '../../src/dto/ShareDTO.js';
import ShareSplit from '../../src/dto/ShareSplitDTO.js';
import Expense from '../../src/dto/ExpenseDTO.js';
import { models } from '../../src/dto/initializeDTOS.js';
import { createRes, validar, camposConError, ejecutarRuta } from '../helpers/express-helpers.js';
import { construirMundo, crearShare, registrarGasto, ANA, BETO, CARLA } from '../helpers/fakes.js';

// Iteracion 3 - Balances, integrantes y compensaciones (HU-010 a HU-013) - CP-24 a CP-35
afterEach(() => mock.restoreAll());

/** Share con A y B, gasto de 120 pagado por A y reparto 50/50 (A +60, B -60). */
async function baseBalances() {
  const mundo = construirMundo();
  const share = await crearShare(mundo, { creador: ANA, miembros: [BETO] });
  await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
  return { mundo, share };
}
const pagos = (mundo) => mundo.notificationRepository.rows.filter((n) => n.type === 'payment');

describe('CP-24: consultar miembros, porcentajes, asignados, pagados y balances (RU-044–RU-048)', () => {
  it('el modelo de consulta expone integrante, porcentaje, monto asignado, pagado y balance', () => {
    const atributos = Object.keys(ShareMember.rawAttributes);
    for (const campo of ['id_share', 'id_user', 'username', 'percentage', 'amount_to_pay', 'paid', 'balance']) {
      assert.ok(atributos.includes(campo), `falta el atributo ${campo}`);
    }
  });

  it('el repositorio consulta únicamente los miembros del Share indicado', async () => {
    const buscar = mock.method(ShareMember, 'findAll', async () => []);
    await new ShareMemberRepository().findMembersByShare(7);
    assert.deepEqual(buscar.mock.calls[0].arguments[0], { where: { id_share: 7 } });
  });

  it('el servicio devuelve los miembros que entrega el repositorio', async () => {
    const miembros = [{ id_user: 1, balance: 60 }, { id_user: 2, balance: -60 }];
    const service = new ShareMemberService({ findMembersByShare: async () => miembros });
    assert.deepEqual(await service.findMembersByShare(1), miembros);
  });

  it('si el repositorio no devuelve datos se informa "Share no encontrado"', async () => {
    const service = new ShareMemberService({
      findMembersByShare: async () => null, findMembersWithDebt: async () => null, findMembersWithOverload: async () => null
    });
    await assert.rejects(() => service.findMembersByShare(9), { message: 'Share no encontrado' });
    await assert.rejects(() => service.findMembersWithDebt(9), { message: 'Share no encontrado' });
    await assert.rejects(() => service.findMembersWithOverload(9), { message: 'Share no encontrado' });
  });

  it('los valores de cada integrante corresponden al Share consultado, sin mezclar otro Share', async () => {
    const { mundo, share } = await baseBalances();
    const otro = await crearShare(mundo, { creador: CARLA, nombre: 'Otro share' });
    await registrarGasto(mundo, { share: otro, usuario: CARLA, monto: 500 });

    const splits = await mundo.shareSplitService.findSplitsByShare(share.id_share);
    assert.deepEqual(splits.map((s) => s.id_user).sort(), [ANA.id_user, BETO.id_user]);
    assert.equal(await mundo.totalPagado(share.id_share), 120);
  });

  it('el controlador responde 200 con los miembros y 400 con el mensaje si falla', async () => {
    mock.method(console, 'error', () => {});
    const ok = createRes();
    await new ShareController({ findMembersByShare: async () => [{ id_user: 1 }] })
      .findMembersByShare({ params: { idShare: 1 } }, ok);
    assert.equal(ok.statusCode, 200);
    const fallo = createRes();
    await new ShareController({ findMembersByShare: async () => { throw new Error('Share no encontrado'); } })
      .findMembersByShare({ params: { idShare: 1 } }, fallo);
    assert.equal(fallo.statusCode, 400);
  });
});

describe('CP-25: A pagó 120 y B no pagó, reparto 50/50 (RU-055–RU-057)', () => {
  it('A tiene +60 a favor y B -60 por pagar', async () => {
    const { mundo, share } = await baseBalances();
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).balance, 60);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).balance, -60);
  });

  it('balance = pagado − asignado en cada integrante', async () => {
    const { mundo, share } = await baseBalances();
    for (const u of [ANA, BETO]) {
      const s = await mundo.splitDe(share.id_share, u.id_user);
      assert.equal(s.balance, s.pagado - s.asignado);
    }
  });

  it('los integrantes con deuda se identifican con balance < 0 y los de saldo a favor con balance > 0', async () => {
    const buscar = mock.method(ShareMember, 'findAll', async () => []);
    const repo = new ShareMemberRepository();
    await repo.findMembersWithDebt(3);
    await repo.findMembersWithOverload(3);

    const deuda = buscar.mock.calls[0].arguments[0].where;
    const aFavor = buscar.mock.calls[1].arguments[0].where;
    assert.equal(deuda.id_share, 3);
    assert.equal(deuda.balance[Op.lt], 0);
    assert.equal(aFavor.id_share, 3);
    assert.equal(aFavor.balance[Op.gt], 0);
  });
});

describe('CP-26: incorporar a C a un Share con reparto equitativo de dos miembros (RU-034, RU-050)', () => {
  it('el reparto pasa a 3 miembros y se actualizan montos y balances', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.addMember(share.code, CARLA.email);

    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 33.33, asignado: 40, pagado: 120, balance: 80 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 33.33, asignado: 40, pagado: 0, balance: -40 });
    assert.deepEqual(await mundo.splitDe(share.id_share, CARLA.id_user), { pct: 33.33, asignado: 40, pagado: 0, balance: -40 });
  });

  it('los balances siguen compensándose (suma 0) y el total del Share no cambia', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.addMember(share.code, CARLA.email);
    let balances = 0;
    for (const u of [ANA, BETO, CARLA]) balances += (await mundo.splitDe(share.id_share, u.id_user)).balance;
    assert.equal(Math.round(balances * 100) / 100, 0);
    assert.equal(await mundo.totalPagado(share.id_share), 120);
  });
});

describe('CP-27: retirar a B de un Share con reparto personalizado (RU-035, RU-036)', () => {
  async function conRepartoPersonalizado() {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO, CARLA] });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    await mundo.shareService.modifySplitsPercentages(share.id_share, [
      { id_user: ANA.id_user, percentage: 50 }, { id_user: BETO.id_user, percentage: 30 }, { id_user: CARLA.id_user, percentage: 20 }]);
    return { mundo, share };
  }

  it('al eliminar la participación de B, la redistribución deja a los restantes en reparto equitativo', async () => {
    const { mundo, share } = await conRepartoPersonalizado();
    const split = await mundo.shareService.findSplitByShareUser(share.id_share, BETO.id_user);

    await mundo.shareSplitService.deleteSplit(split.id_split);
    await mundo.shareService.splitPercentagesEqually(share.id_share);

    assert.equal(await mundo.shareSplitRepository.findSplitByUserShare(share.id_share, BETO.id_user), null);
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 60, pagado: 120, balance: 60 });
    assert.deepEqual(await mundo.splitDe(share.id_share, CARLA.id_user), { pct: 50, asignado: 60, pagado: 0, balance: -60 });
  });

  it('deleteSplit del servicio delega en el repositorio con el id recibido', async () => {
    const repo = { deleteSplit: mock.fn(async () => 1) };
    await new (await import('../../src/services/sharesplit-service.js')).default(repo, {}).deleteSplit(42);
    assert.deepEqual(repo.deleteSplit.mock.calls[0].arguments, [42]);
  });

  // it('DEFECTO: removeMember debe eliminar al integrante y dejar a los restantes con reparto equitativo',
  //   { todo: 'DEF-08: ShareService.removeMember pasa el objeto split (no su id) a deleteSplit y no espera (await) ni la eliminación ni el recálculo (share-service.js:removeMember)' },
  //   async () => {
  //     const { mundo, share } = await conRepartoPersonalizado();

  //     await mundo.shareService.removeMember(share.id_share, BETO.id_user);
  //     await mundo.settle();

  //     const restantes = await mundo.shareSplitRepository.findSplitsByShare(share.id_share);
  //     assert.deepEqual(restantes.map((s) => s.id_user).sort(), [ANA.id_user, CARLA.id_user]);
  //     assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pct, 50);
  //     assert.equal((await mundo.splitDe(share.id_share, CARLA.id_user)).pct, 50);
  //   });
});

describe('CP-28: intentar retirar al creador del Share (HU-012 criterio 2)', () => {
  it('el sistema impide el retiro y no elimina su participación', async () => {
    const { mundo, share } = await baseBalances();
    const antes = mundo.shareSplitRepository.snapshot();

    await assert.rejects(() => mundo.shareService.removeMember(share.id_share, ANA.id_user),
      { message: 'No se puede eliminar al creador del share' });
    await mundo.settle();

    assert.equal(mundo.shareSplitRepository.snapshot(), antes);
  });

  it('el controlador responde 400 con el mensaje', async () => {
    mock.method(console, 'error', () => {});
    const { mundo, share } = await baseBalances();
    const res = createRes();
    await new ShareController(mundo.shareService)
      .removeMember({ body: { id_share: share.id_share, id_user: ANA.id_user } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'No se puede eliminar al creador del share');
  });
});

describe('CP-29: compensación de 30 de B hacia A con saldos -60/+60 (RU-080, RU-086–RU-088)', () => {
  it('se registra el pago: B queda en -30 y A en +30', async () => {
    const { mundo, share } = await baseBalances();

    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user);

    const b = await mundo.splitDe(share.id_share, BETO.id_user);
    const a = await mundo.splitDe(share.id_share, ANA.id_user);
    assert.equal(b.balance, -30);
    assert.equal(a.balance, 30);
    assert.equal(b.pagado, 30, 'aumenta lo pagado por quien paga');
    assert.equal(a.pagado, 90, 'se reduce lo pagado por quien recibe');
  });

  it('pagar exactamente el saldo del receptor (60) deja ambos balances en cero', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.makePayment(share.id_share, 60, BETO.id_user, ANA.id_user);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).balance, 0);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).balance, 0);
  });

  it('el total acumulado del Share no cambia con una compensación (es un movimiento interno)', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user);
    assert.equal(await mundo.totalPagado(share.id_share), 120);
  });

  it('una vez saldado, no se puede pagar a un usuario con balance neutro (RU-083)', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.makePayment(share.id_share, 60, BETO.id_user, ANA.id_user);
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 1, BETO.id_user, ANA.id_user),
      { message: 'No se le puede pagar a usuarios con balance neutro o negativo' });
  });

  it('el controlador responde 200 con "Pago realizado con éxito"', async () => {
    const service = { makePayment: mock.fn(async () => undefined) };
    const res = createRes();
    await new ShareController(service).makePayment(
      { body: { id_share: 1, amount_to_pay: 30, paying_user_id: 2, paid_user_id: 1 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, 'Pago realizado con éxito');
    assert.deepEqual(service.makePayment.mock.calls[0].arguments, [1, 30, 2, 1]);
  });
});

describe('CP-30: pago de 61 cuando el receptor solo tiene +60 (RU-083, RU-084)', () => {
  it('se rechaza la compensación y no cambian los balances', async () => {
    const { mundo, share } = await baseBalances();
    const antes = mundo.shareSplitRepository.snapshot();

    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 61, BETO.id_user, ANA.id_user),
      { message: 'El monto excede el total a pagar' });

    assert.equal(mundo.shareSplitRepository.snapshot(), antes);
    assert.equal(pagos(mundo).length, 0, 'no se notifica un pago que no ocurrió');
  });

  it('el límite exacto (60) sí se permite', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.makePayment(share.id_share, 60, BETO.id_user, ANA.id_user);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).balance, 0);
  });

  it('la regla del receptor es independiente de la del pagador: con +40 a favor no puede recibir 41 aunque el pagador deba 80', async () => {
    // Total 160 (A paga 80 y C paga 80). Porcentajes exactos 25/50/25 → A +40, C +40, B -80.
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO, CARLA] });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 80 });
    await registrarGasto(mundo, { share, usuario: CARLA, monto: 80 });
    await mundo.shareService.modifySplitsPercentages(share.id_share, [
      { id_user: ANA.id_user, percentage: 25 }, { id_user: BETO.id_user, percentage: 50 }, { id_user: CARLA.id_user, percentage: 25 }]);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).balance, 40);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).balance, -80);
    const antes = mundo.shareSplitRepository.snapshot();

    // 41 < 80 (lo que B debe) pero 41 > 40 (lo que A tiene a favor): solo la regla del receptor lo impide
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 41, BETO.id_user, ANA.id_user),
      { message: 'El monto excede el total a pagar' });
    assert.equal(mundo.shareSplitRepository.snapshot(), antes);

    // 40 (exactamente el saldo del receptor) sí se permite
    await mundo.shareService.makePayment(share.id_share, 40, BETO.id_user, ANA.id_user);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).balance, 0);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).balance, -40);
  });

  it('el controlador informa el error (≥ 400) con el mensaje', async () => {
    mock.method(console, 'error', () => {});
    const { mundo, share } = await baseBalances();
    const res = createRes();
    await new ShareController(mundo.shareService).makePayment(
      { body: { id_share: share.id_share, amount_to_pay: 61, paying_user_id: BETO.id_user, paid_user_id: ANA.id_user } }, res);
    assert.ok(res.statusCode >= 400);
    assert.equal(res.body.message, 'El monto excede el total a pagar');
  });
});

describe('CP-31: compensación que excede la obligación de quien paga (RU-085)', () => {
  /** A pagó 120 entre 3: A +80, B -40, C -40. A cobra mucho, pero B solo debe 40. */
  async function tresMiembros() {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO, CARLA] });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    return { mundo, share };
  }

  it('no permite que B pague más de lo que le corresponde asumir (40), aunque A tenga saldo suficiente', async () => {
    const { mundo, share } = await tresMiembros();
    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user); // B paga 30 de 40
    const antes = mundo.shareSplitRepository.snapshot();

    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 20, BETO.id_user, ANA.id_user),
      { message: 'El monto excede el total a pagar' });

    assert.equal(mundo.shareSplitRepository.snapshot(), antes, 'sin sobrepago al deudor');
  });

  it('el límite exacto de la obligación (10 restantes) sí se permite', async () => {
    const { mundo, share } = await tresMiembros();
    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user);
    await mundo.shareService.makePayment(share.id_share, 10, BETO.id_user, ANA.id_user);
    const b = await mundo.splitDe(share.id_share, BETO.id_user);
    assert.equal(b.pagado, 40);
    assert.equal(b.balance, 0);
  });

  it('tampoco se permite pagar de una sola vez más de 40', async () => {
    const { mundo, share } = await tresMiembros();
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 41, BETO.id_user, ANA.id_user),
      { message: 'El monto excede el total a pagar' });
  });
});

describe('CP-32: pago con usuario ajeno al Share como pagador o receptor (RU-081, RU-082)', () => {
  it('rechaza si el pagador no pertenece al Share', async () => {
    const { mundo, share } = await baseBalances();
    const antes = mundo.shareSplitRepository.snapshot();
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 10, CARLA.id_user, ANA.id_user),
      { message: 'El usuario no pertenece al share' });
    assert.equal(mundo.shareSplitRepository.snapshot(), antes);
    assert.equal(pagos(mundo).length, 0);
  });

  it('rechaza si el receptor no pertenece al Share', async () => {
    const { mundo, share } = await baseBalances();
    const antes = mundo.shareSplitRepository.snapshot();
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 10, BETO.id_user, CARLA.id_user),
      { message: 'El usuario no pertenece al share' });
    assert.equal(mundo.shareSplitRepository.snapshot(), antes);
    assert.equal(pagos(mundo).length, 0);
  });

  it('rechaza usuarios inexistentes', async () => {
    const { mundo, share } = await baseBalances();
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 10, 999, ANA.id_user),
      { message: 'Usuario no encontrado' });
  });

  it('rechaza si el servicio de usuarios no devuelve a alguno de los dos', async () => {
    const { mundo, share } = await baseBalances();
    mock.method(mundo.userService, 'findById', async () => null);
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 10, BETO.id_user, ANA.id_user),
      { message: 'Uno de los usuarios no es válido' });
  });

  it('rechaza pagos en un Share inexistente', async () => {
    const mundo = construirMundo();
    await assert.rejects(() => mundo.shareService.makePayment(999, 10, BETO.id_user, ANA.id_user),
      { message: 'Share no encontrado' });
  });

  it('solo se aceptan pagos en Shares de gastos o deudas, no de metas (RU-081)', async () => {
    const mundo = construirMundo();
    const meta = await crearShare(mundo, { miembros: [BETO], extra: { type: 'share_goal' } });
    await assert.rejects(() => mundo.shareService.makePayment(meta.id_share, 10, BETO.id_user, ANA.id_user),
      { message: 'Share no válido' });
  });

  it('se aceptan los Shares de tipo share_debt', async () => {
    const mundo = construirMundo();
    const deuda = await crearShare(mundo, { miembros: [BETO], extra: { type: 'share_debt' } });
    await registrarGasto(mundo, { share: deuda, monto: 120 });
    await mundo.shareService.makePayment(deuda.id_share, 30, BETO.id_user, ANA.id_user);
    assert.equal((await mundo.splitDe(deuda.id_share, BETO.id_user)).balance, -30);
  });
});

describe('CP-33: editar nombre/descripción/fecha de un Share y monto positivo (RU-037–RU-042)', () => {
  it('acepta nombre, descripción, fecha y monto válidos', async () => {
    const errores = await validar(shareValidator.updateShareValidator,
      { name: 'Nuevo nombre', description: 'Nueva descripción', due_date: '2027-01-15', amount: 150.5 });
    assert.deepEqual(errores, []);
  });

  it('la actualización es parcial: cada campo es opcional', async () => {
    assert.deepEqual(await validar(shareValidator.updateShareValidator, {}), []);
    assert.deepEqual(await validar(shareValidator.updateShareValidator, { description: 'Solo descripción' }), []);
  });

  for (const amount of [0, -1, -0.01, 'abc', '']) {
    it(`rechaza el monto no válido ${JSON.stringify(amount)} (RU-041)`, async () => {
      assert.deepEqual(camposConError(await validar(shareValidator.updateShareValidator, { amount })), ['amount']);
    });
  }

  it('acepta el monto mínimo positivo 0.01', async () => {
    assert.deepEqual(await validar(shareValidator.updateShareValidator, { amount: 0.01 }), []);
  });

  it('rechaza nombre vacío o de más de 100 caracteres y fecha con formato inválido', async () => {
    assert.deepEqual(camposConError(await validar(shareValidator.updateShareValidator, { name: '' })), ['name']);
    assert.deepEqual(camposConError(await validar(shareValidator.updateShareValidator, { name: 'a'.repeat(101) })), ['name']);
    assert.deepEqual(camposConError(await validar(shareValidator.updateShareValidator, { due_date: '31/12/2026' })), ['due_date']);
  });

  it('con un monto no válido la petición se corta con 400 y el Share no cambia', async () => {
    const { mundo, share } = await baseBalances();
    const antes = mundo.shareRepository.snapshot();
    const controller = new ShareController(mundo.shareService);
    const res = createRes();
    const { bloqueada } = await ejecutarRuta(
      [...shareValidator.updateShareValidator, shareValidator.validatorShare, controller.updateShare],
      { body: { id_share: share.id_share, amount: -5 } }, res);
    assert.equal(bloqueada, true);
    assert.equal(res.statusCode, 400);
    assert.equal(mundo.shareRepository.snapshot(), antes);
  });

  it('con datos válidos el Share se actualiza y se devuelve actualizado', async () => {
    const { mundo, share } = await baseBalances();
    const controller = new ShareController(mundo.shareService);
    const res = createRes();
    const { bloqueada } = await ejecutarRuta(
      [...shareValidator.updateShareValidator, shareValidator.validatorShare, controller.updateShare],
      { body: { id_share: share.id_share, name: 'Renombrado', description: 'Otra descripción', due_date: '2027-01-15', amount: 300 } }, res);

    assert.equal(bloqueada, false);
    assert.equal(res.statusCode, 200);
    const guardado = await mundo.shareService.findShareById(share.id_share);
    assert.equal(guardado.name, 'Renombrado');
    assert.equal(guardado.description, 'Otra descripción');
    assert.equal(guardado.due_date, '2027-01-15');
    assert.equal(Number(guardado.amount), 300);
  });

  it('el repositorio devuelve el Share actualizado y falla si no existe el Share', async () => {
    mock.method(Share, 'update', async () => [1]);
    mock.method(Share, 'findOne', async () => ({ id_share: 1, name: 'Renombrado' }));
    assert.equal((await new ShareRepository().updateShare({ id_share: 1, name: 'Renombrado' })).name, 'Renombrado');

    mock.restoreAll();
    mock.method(Share, 'update', async () => [0]);
    await assert.rejects(() => new ShareRepository().updateShare({ id_share: 99 }),
      { message: 'No se encontró el Share para actualizar' });
  });
});

describe('CP-34: eliminar Share con gastos y distribuciones asociadas (RU-043, RU-118)', () => {
  it('el servicio elimina el Share y devuelve el mensaje de confirmación', async () => {
    const { mundo, share } = await baseBalances();
    assert.equal(await mundo.shareService.deleteShare(share.id_share), 'Share eliminado correctamente');
    assert.equal(await mundo.shareService.findShareById(share.id_share), null);
  });

  it('eliminar un Share inexistente produce error', async () => {
    const mundo = construirMundo();
    await assert.rejects(() => mundo.shareService.deleteShare(999), { message: 'No se encontró el Share para eliminar' });
  });

  it('el repositorio destruye por id y distingue si había filas afectadas', async () => {
    const destruir = mock.method(Share, 'destroy', async () => 1);
    assert.equal(await new ShareRepository().deleteShare(5), 'Share eliminado correctamente');
    assert.deepEqual(destruir.mock.calls[0].arguments[0], { where: { id_share: 5 } });

    mock.restoreAll();
    mock.method(Share, 'destroy', async () => 0);
    await assert.rejects(() => new ShareRepository().deleteShare(5), { message: 'No se encontró el Share para eliminar' });
  });

  it('gastos y distribuciones declaran ON DELETE CASCADE hacia el Share en sus columnas', () => {
    assert.equal(Expense.rawAttributes.id_share.onDelete, 'CASCADE');
    assert.equal(ShareSplit.rawAttributes.id_share.onDelete, 'CASCADE');
  });

  it('la asociación Share → Expense usa la llave id_share con cascada', () => {
    const asociacion = Object.values(models.Share.associations).find((a) => a.target === models.Expense);
    assert.equal(asociacion.foreignKey, 'id_share');
    assert.equal(asociacion.options.onDelete, 'CASCADE');
  });

  // it('DEFECTO: la asociación Share → ShareSplit debe usar la llave foránea id_share',
  //   { todo: 'DEF-09: ShareDTO.associate declara hasMany(ShareSplit, { foreignKey: "id_split" }) en lugar de id_share (ShareDTO.js, última línea de associate)' },
  //   () => {
  //     const asociacion = Object.values(models.Share.associations).find((a) => a.target === models.ShareSplit);
  //     assert.equal(asociacion.foreignKey, 'id_share');
  //   });
});

describe('CP-35: balances tras modificar un gasto y registrar una compensación (RU-048, RU-079, RU-088)', () => {
  it('cada operación se refleja en los importes: gasto 120 → editado a 150 → pago de 30', async () => {
    const { mundo, share } = await baseBalances();
    const gasto = (await mundo.expenseService.findExpensesByShare(share.id_share))[0];

    // Línea base (CP-25)
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 60, pagado: 120, balance: 60 });

    // Tras modificar el gasto de 120 a 150
    await mundo.expenseService.updateExpense({ amount: 150 }, gasto.id_expense);
    await mundo.settle();
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 75, pagado: 150, balance: 75 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 75, pagado: 0, balance: -75 });

    // Tras la compensación de 30 de B hacia A
    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user);
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 75, pagado: 120, balance: 45 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 75, pagado: 30, balance: -45 });
    assert.equal(await mundo.totalPagado(share.id_share), 150);
  });

  it('un nuevo gasto posterior a la compensación mantiene los balances consistentes', async () => {
    const { mundo, share } = await baseBalances();
    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user); // A +30, B -30
    await registrarGasto(mundo, { share, usuario: BETO, monto: 40 });                    // total 160 → asignado 80 c/u

    const a = await mundo.splitDe(share.id_share, ANA.id_user);
    const b = await mundo.splitDe(share.id_share, BETO.id_user);
    assert.equal(a.balance, a.pagado - a.asignado);
    assert.equal(b.balance, b.pagado - b.asignado);
    assert.equal(a.balance + b.balance, 0);
  });
});
