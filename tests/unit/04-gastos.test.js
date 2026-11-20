import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import expenseValidator from '../../src/middleware/expenseValidator.js';
import ExpenseController from '../../src/controllers/expense-controller.js';
import ExpenseService from '../../src/services/expense-service.js';
import ExpenseRepository from '../../src/repositories/expense-repository.js';
import Expense from '../../src/dto/ExpenseDTO.js';
import { createRes, validar, camposConError, ejecutarRuta } from '../helpers/express-helpers.js';
import { construirMundo, crearShare, registrarGasto, ANA, BETO, CARLA } from '../helpers/fakes.js';

// Iteracion 2 - Registro, consulta, edicion y eliminacion de gastos (HU-005 a HU-007) - CP-13 a CP-19
afterEach(() => mock.restoreAll());

async function escenario() {
  const mundo = construirMundo();
  const share = await crearShare(mundo, { creador: ANA, miembros: [BETO] });
  return { mundo, share };
}

describe('CP-13: registrar gasto de 120 por A en el Share S (RU-059–062, RU-077–079)', () => {
  it('el gasto queda asociado a S y al usuario autenticado, con los datos enviados', async () => {
    const { mundo, share } = await escenario();
    const gasto = await registrarGasto(mundo, { share, usuario: ANA, monto: 120, category: 'Comida', description: 'Cena' });

    assert.equal(gasto.id_share, share.id_share);
    assert.equal(gasto.id_user, ANA.id_user);
    assert.equal(Number(gasto.amount), 120);
    const enS = await mundo.expenseService.findExpensesByShare(share.id_share);
    assert.equal(enS.length, 1);
  });

  it('incrementa en 120 el total del Share y lo pagado por A (B no cambia)', async () => {
    const { mundo, share } = await escenario();
    assert.equal(await mundo.totalPagado(share.id_share), 0);

    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });

    assert.equal(await mundo.totalPagado(share.id_share), 120);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pagado, 120);
    assert.equal((await mundo.splitDe(share.id_share, BETO.id_user)).pagado, 0);
  });

  it('los gastos se acumulan: 120 + 30 = 150', async () => {
    const { mundo, share } = await escenario();
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 30 });
    assert.equal(await mundo.totalPagado(share.id_share), 150);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pagado, 150);
  });

  it('recalcula monto asignado y balance de todos los participantes (RU-079)', async () => {
    const { mundo, share } = await escenario();
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 60, pagado: 120, balance: 60 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 60, pagado: 0, balance: -60 });
  });

  it('un usuario inexistente no puede registrar gastos y no se altera nada', async () => {
    const { mundo, share } = await escenario();
    await assert.rejects(
      () => mundo.expenseService.createExpense({ id_share: share.id_share, amount: 50 }, 'fantasma@example.com'),
      { message: 'Usuario no encontrado' });
    assert.equal(mundo.expenseRepository.rows.length, 0);
    assert.equal(await mundo.totalPagado(share.id_share), 0);
  });

  it('el controlador responde 201 y toma el usuario del token', async () => {
    const service = { createExpense: mock.fn(async (d) => ({ id_expense: 1, ...d })) };
    const res = createRes();
    await new ExpenseController(service).createExpense(
      { body: { id_share: 1, amount: 120 }, dataToken: { userEmail: ANA.email } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(service.createExpense.mock.calls[0].arguments[1], ANA.email);
  });
});

describe('CP-14: gasto con monto 0, negativo o no numérico (RU-062, RU-063)', () => {
  const base = { id_share: 1, amount: 120 };

  for (const amount of [0, -10, -0.01, 0.009, 'abc', '', '12abc', null]) {
    it(`rechaza el monto ${JSON.stringify(amount)}`, async () => {
      const errores = await validar(expenseValidator.createExpenseValidator, { ...base, amount });
      assert.deepEqual(camposConError(errores), ['amount']);
    });
  }

  it('rechaza un gasto sin monto (el monto es requerido)', async () => {
    assert.deepEqual(camposConError(await validar(expenseValidator.createExpenseValidator, { id_share: 1 })), ['amount']);
  });

  for (const amount of [0.01, 1, 120, '120', '120.50']) {
    it(`acepta el monto válido ${JSON.stringify(amount)}`, async () => {
      assert.deepEqual(await validar(expenseValidator.createExpenseValidator, { ...base, amount }), []);
    });
  }

  it('rechaza el gasto sin id de Share', async () => {
    assert.deepEqual(camposConError(await validar(expenseValidator.createExpenseValidator, { amount: 10 })), ['id_share']);
  });

  it('las solicitudes inválidas se cortan con 400 y no alteran total ni balances', async () => {
    const { mundo, share } = await escenario();
    await registrarGasto(mundo, { share, monto: 120 });
    const splitsAntes = mundo.shareSplitRepository.snapshot();
    const shareAntes = mundo.shareRepository.snapshot();
    const controller = new ExpenseController(mundo.expenseService);

    for (const amount of [0, -5, 'abc']) {
      const res = createRes();
      const { bloqueada } = await ejecutarRuta(
        [...expenseValidator.createExpenseValidator, expenseValidator.validatorExpense, controller.createExpense],
        { body: { id_share: share.id_share, amount }, dataToken: { userEmail: ANA.email } }, res);
      assert.equal(bloqueada, true);
      assert.equal(res.statusCode, 400);
    }

    assert.equal(mundo.expenseRepository.rows.length, 1);
    assert.equal(mundo.shareRepository.snapshot(), shareAntes);
    assert.equal(mundo.shareSplitRepository.snapshot(), splitsAntes);
  });
});

describe('CP-15: gasto con categoría, descripción y fecha (RU-064–RU-067)', () => {
  it('persiste categoría, descripción y fecha válidas', async () => {
    const { mundo, share } = await escenario();
    const gasto = await registrarGasto(mundo, {
      share, monto: 45, category: 'Transporte', description: 'Taxi al aeropuerto', date: '2026-11-18'
    });
    const guardado = await mundo.expenseService.getExpenseByID(gasto.id_expense);
    assert.equal(guardado.category, 'Transporte');
    assert.equal(guardado.description, 'Taxi al aeropuerto');
    assert.equal(guardado.date, '2026-11-18');
  });

  it('el validador acepta categoría y fecha válidas, y ambas son opcionales', async () => {
    const base = { id_share: 1, amount: 10 };
    assert.deepEqual(await validar(expenseValidator.createExpenseValidator, { ...base, category: 'Comida', date: '2026-11-18' }), []);
    assert.deepEqual(await validar(expenseValidator.createExpenseValidator, base), []);
  });

  for (const date of ['18/11/2026', 'ayer', '2026-13-40', '11-18-2026']) {
    it(`rechaza la fecha inválida "${date}"`, async () => {
      const errores = await validar(expenseValidator.createExpenseValidator, { id_share: 1, amount: 10, date });
      assert.deepEqual(camposConError(errores), ['date']);
    });
  }

  it('rechaza una categoría que no es texto', async () => {
    const errores = await validar(expenseValidator.createExpenseValidator, { id_share: 1, amount: 10, category: 123 });
    assert.deepEqual(camposConError(errores), ['category']);
  });

  it('con fecha inválida la solicitud se corta con 400 y no se registra el gasto', async () => {
    const { mundo, share } = await escenario();
    const controller = new ExpenseController(mundo.expenseService);
    const res = createRes();
    const { bloqueada } = await ejecutarRuta(
      [...expenseValidator.createExpenseValidator, expenseValidator.validatorExpense, controller.createExpense],
      { body: { id_share: share.id_share, amount: 10, date: 'ayer' }, dataToken: { userEmail: ANA.email } }, res);
    assert.equal(bloqueada, true);
    assert.equal(res.statusCode, 400);
    assert.equal(mundo.expenseRepository.rows.length, 0);
  });
});

describe('CP-16: consultar gastos del Share S cuando existen gastos en otro Share (RU-068)', () => {
  it('la lista contiene únicamente los gastos de S', async () => {
    const mundo = construirMundo();
    const S = await crearShare(mundo, { creador: ANA, miembros: [BETO], nombre: 'Share S' });
    const T = await crearShare(mundo, { creador: CARLA, nombre: 'Share T' });
    const g1 = await registrarGasto(mundo, { share: S, usuario: ANA, monto: 100 });
    const g2 = await registrarGasto(mundo, { share: S, usuario: BETO, monto: 50 });
    await registrarGasto(mundo, { share: T, usuario: CARLA, monto: 999 });

    const lista = await mundo.expenseService.findExpensesByShare(S.id_share);

    assert.deepEqual(lista.map((g) => g.id_expense).sort(), [g1.id_expense, g2.id_expense].sort());
    assert.ok(lista.every((g) => g.id_share === S.id_share));
    assert.equal(lista.reduce((t, g) => t + Number(g.amount), 0), 150);
  });

  it('un Share inexistente produce error', async () => {
    const mundo = construirMundo();
    await assert.rejects(() => mundo.expenseService.findExpensesByShare(999), { message: 'Share no encontrado' });
  });

  it('el controlador responde 200 con la lista y 500 con el mensaje si falla', async () => {
    const ok = createRes();
    await new ExpenseController({ findExpensesByShare: async () => [{ id_expense: 1 }] })
      .findExpensesByShare({ params: { shareId: 1 } }, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body.data, [{ id_expense: 1 }]);

    const fallo = createRes();
    await new ExpenseController({ findExpensesByShare: async () => { throw new Error('Share no encontrado'); } })
      .findExpensesByShare({ params: { shareId: 9 } }, fallo);
    assert.equal(fallo.statusCode, 500);
    assert.equal(fallo.body.message, 'Share no encontrado');
  });
});

describe('CP-17: gastos del usuario A en S y gastos asociados a A (RU-069, RU-070)', () => {
  it('findExpensesByShareUser retorna solo los gastos de A dentro de S', async () => {
    const mundo = construirMundo();
    const S = await crearShare(mundo, { creador: ANA, miembros: [BETO], nombre: 'Share S' });
    const T = await crearShare(mundo, { creador: ANA, nombre: 'Share T' });
    const a1 = await registrarGasto(mundo, { share: S, usuario: ANA, monto: 100 });
    await registrarGasto(mundo, { share: S, usuario: BETO, monto: 50 });
    await registrarGasto(mundo, { share: T, usuario: ANA, monto: 70 });

    const lista = await mundo.expenseService.findExpensesByShareUser(S.id_share, ANA.id_user);

    assert.deepEqual(lista.map((g) => g.id_expense), [a1.id_expense]);
    assert.ok(lista.every((g) => g.id_user === ANA.id_user && g.id_share === S.id_share));
  });

  it('valida que el Share y el usuario existan', async () => {
    const mundo = construirMundo();
    const S = await crearShare(mundo);
    await assert.rejects(() => mundo.expenseService.findExpensesByShareUser(999, ANA.id_user), { message: 'Share no encontrado' });
    await assert.rejects(() => mundo.expenseService.findExpensesByShareUser(S.id_share, 999), { message: 'Usuario no encontrado' });
  });

  it('el repositorio filtra por Share y por usuario en la consulta', async () => {
    const buscar = mock.method(Expense, 'findAll', async () => []);
    await new ExpenseRepository().findExpensesByShareUser(7, 3);
    assert.deepEqual(buscar.mock.calls[0].arguments[0], { where: { id_share: 7, id_user: 3 } });
  });

  // it('DEFECTO: consultar los gastos asociados a un usuario (RU-070) debe funcionar con el repositorio real',
  //   { todo: 'DEF-03: ExpenseService.getExpenseByUser llama a expenseRepository.findExpensesByUser, que no existe (GET /expense/user/:username → 500)' },
  //   async () => {
  //     mock.method(Expense, 'findAll', async () => [{ id_expense: 1 }]);
  //     const service = new ExpenseService(new ExpenseRepository(), {}, {});
  //     const gastos = await service.getExpenseByUser('ana');
  //     assert.ok(Array.isArray(gastos));
  //   });
});

describe('CP-18: actualizar un gasto de 120 a 150 (RU-071–RU-073)', () => {
  async function conGastoDe120() {
    const { mundo, share } = await escenario();
    const gasto = await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    return { mundo, share, gasto };
  }

  it('el total del Share aumenta en 30 y el pagado de A pasa a 150', async () => {
    const { mundo, share, gasto } = await conGastoDe120();
    await mundo.expenseService.updateExpense({ amount: 150 }, gasto.id_expense);
    await mundo.settle();

    assert.equal(Number((await mundo.expenseService.getExpenseByID(gasto.id_expense)).amount), 150);
    assert.equal(await mundo.totalPagado(share.id_share), 150);
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pagado, 150);
  });

  it('recalcula asignaciones y balances: A +75, B -75', async () => {
    const { mundo, share, gasto } = await conGastoDe120();
    await mundo.expenseService.updateExpense({ amount: 150 }, gasto.id_expense);
    await mundo.settle();
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 75, pagado: 150, balance: 75 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 75, pagado: 0, balance: -75 });
  });

  it('reducir el monto (120 → 100) también descuenta del total', async () => {
    const { mundo, share, gasto } = await conGastoDe120();
    await mundo.expenseService.updateExpense({ amount: 100 }, gasto.id_expense);
    await mundo.settle();
    assert.equal(await mundo.totalPagado(share.id_share), 100);
  });

  it('un gasto inexistente produce error y no altera el Share', async () => {
    const { mundo, share } = await conGastoDe120();
    const antes = mundo.shareRepository.snapshot();
    await assert.rejects(() => mundo.expenseService.updateExpense({ amount: 10 }, 999), { message: 'Gasto no encontrado' });
    assert.equal(mundo.shareRepository.snapshot(), antes);
    assert.equal(await mundo.totalPagado(share.id_share), 120);
  });

  it('el validador de actualización rechaza monto 0, negativo o no numérico', async () => {
    for (const amount of [0, -1, 'abc']) {
      assert.deepEqual(camposConError(await validar(expenseValidator.updateExpenseValidator, { amount })), ['amount']);
    }
    assert.deepEqual(await validar(expenseValidator.updateExpenseValidator, { amount: 150 }), []);
    assert.deepEqual(await validar(expenseValidator.updateExpenseValidator, { category: 'Comida' }), []);
  });

  // it('DEFECTO: actualizar solo la categoría no debe alterar el total del Share',
  //   { todo: 'DEF-04: ExpenseService.updateExpense calcula (undefined - monto) = NaN cuando el cuerpo no trae amount y corrompe paid_amount (expense-service.js:88-96)' },
  //   async () => {
  //     const { mundo, share, gasto } = await conGastoDe120();
  //     await mundo.expenseService.updateExpense({ category: 'Servicios' }, gasto.id_expense);
  //     await mundo.settle();
  //     assert.equal(await mundo.totalPagado(share.id_share), 120);
  //     assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pagado, 120);
  //   });
});

describe('CP-19: eliminar un gasto existente de 150 (RU-074–RU-076)', () => {
  it('descuenta 150 del total y deja los balances en cero', async () => {
    const { mundo, share } = await escenario();
    const gasto = await registrarGasto(mundo, { share, usuario: ANA, monto: 150 });

    await mundo.expenseService.deleteExpense(gasto.id_expense);
    await mundo.settle();

    assert.equal(await mundo.totalPagado(share.id_share), 0);
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 0, pagado: 0, balance: 0 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 0, pagado: 0, balance: 0 });
    assert.equal(await mundo.expenseService.getExpenseByID(gasto.id_expense), null);
  });

  it('con varios gastos recalcula solo los balances afectados: 100 de A y 50 de B → se elimina el de A', async () => {
    const { mundo, share } = await escenario();
    const deAna = await registrarGasto(mundo, { share, usuario: ANA, monto: 100 });
    await registrarGasto(mundo, { share, usuario: BETO, monto: 50 });

    await mundo.expenseService.deleteExpense(deAna.id_expense);
    await mundo.settle();

    assert.equal(await mundo.totalPagado(share.id_share), 50);
    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 25, pagado: 0, balance: -25 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 25, pagado: 50, balance: 25 });
  });

  it('un gasto inexistente produce error y no modifica acumulados', async () => {
    const { mundo, share } = await escenario();
    await registrarGasto(mundo, { share, monto: 80 });
    const antes = mundo.shareSplitRepository.snapshot();
    await assert.rejects(() => mundo.expenseService.deleteExpense(999), { message: 'Gasto no encontrado' });
    assert.equal(mundo.shareSplitRepository.snapshot(), antes);
    assert.equal(await mundo.totalPagado(share.id_share), 80);
  });

  it('el controlador responde 200 al eliminar y 400 cuando falla', async () => {
    mock.method(console, 'error', () => {});
    const ok = createRes();
    await new ExpenseController({ deleteExpense: async () => 1 }).deleteExpense({ params: { id: 1 } }, ok);
    assert.equal(ok.statusCode, 200);
    const fallo = createRes();
    await new ExpenseController({ deleteExpense: async () => { throw new Error('Gasto no encontrado'); } })
      .deleteExpense({ params: { id: 9 } }, fallo);
    assert.equal(fallo.statusCode, 400);
  });
});
