import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import ShareSplitService from '../../src/services/sharesplit-service.js';
import ShareController from '../../src/controllers/share-controller.js';
import { createRes } from '../helpers/express-helpers.js';
import { construirMundo, crearShare, registrarGasto, ANA, BETO, CARLA } from '../helpers/fakes.js';

// Iteracion 2 - Distribucion equitativa y personalizada (HU-008, HU-009) - CP-20 a CP-23
afterEach(() => mock.restoreAll());

const suma = (valores) => valores.reduce((t, v) => t + v, 0);
const casiIgual = (a, b, tolerancia = 0.011) => Math.abs(a - b) <= tolerancia;

async function conGasto120(miembros) {
  const mundo = construirMundo();
  const share = await crearShare(mundo, { creador: ANA, miembros });
  await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
  return { mundo, share };
}

describe('CP-20: distribuir equitativamente 120 entre A y B (RU-049, RU-050, RU-053, RU-054)', () => {
  it('queda 50 % / 50 % y monto asignado de 60 para cada uno', async () => {
    const { mundo, share } = await conGasto120([BETO]);
    // Parte de una distribución personalizada y la vuelve equitativa
    await mundo.shareService.modifySplitsPercentages(share.id_share, [
      { id_user: ANA.id_user, percentage: 70 }, { id_user: BETO.id_user, percentage: 30 }]);

    await mundo.shareService.splitPercentagesEqually(share.id_share);

    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 50, asignado: 60, pagado: 120, balance: 60 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 50, asignado: 60, pagado: 0, balance: -60 });
  });

  for (const n of [1, 2, 3, 4, 5, 8, 10]) {
    it(`el porcentaje individual es 100 / ${n} participantes (RU-050)`, async () => {
      const usuarios = [ANA, BETO, CARLA];
      const mundo = construirMundo();
      // Para n > 3 se registran splits directamente: solo interesa la fórmula del reparto
      const share = await mundo.shareRepository.createShare({ name: 'S', code: 'ABCDEFGH', id_creator: 1, paid_amount: 100 });
      for (let i = 1; i <= n; i++) await mundo.shareSplitRepository.createSplit(usuarios[i - 1]?.id_user ?? 100 + i, share.id_share);

      const llamadas = [];
      mock.method(mundo.shareSplitService, 'updateSplit', async (data) => { llamadas.push(data); });
      await mundo.shareSplitService.splitEqually(share);

      assert.equal(llamadas.length, n);
      for (const data of llamadas) assert.equal(data.percentage, 100 / n);
    });
  }

  it('sin integrantes no hay a quién repartir y se informa el error', async () => {
    const mundo = construirMundo();
    const share = await mundo.shareRepository.createShare({ name: 'S', code: 'ABCDEFGH', id_creator: 1 });
    await assert.rejects(() => mundo.shareSplitService.splitEqually(share), { message: 'No hay splits para dividir el monto.' });
  });

  it('el controlador responde 200 con la distribución y 400 con el mensaje de error', async () => {
    mock.method(console, 'error', () => {});
    const ok = createRes();
    await new ShareController({ splitPercentagesEqually: async () => undefined })
      .splitPercentagesEqually({ params: { shareId: 1 } }, ok);
    assert.equal(ok.statusCode, 200);
    const fallo = createRes();
    await new ShareController({ splitPercentagesEqually: async () => { throw new Error('No hay splits para dividir el monto.'); } })
      .splitPercentagesEqually({ params: { shareId: 1 } }, fallo);
    assert.equal(fallo.statusCode, 400);
  });
});

describe('CP-21: distribución equitativa de un gasto entre tres integrantes (RU-049, RU-050)', () => {
  it('a precisión de cálculo del servicio, las 3 participaciones son iguales y suman 100 % sin perder importe', async () => {
    const repo = {
      findSplitsByShare: async () => [{ id_user: 1, paid: 120 }, { id_user: 2, paid: 0 }, { id_user: 3, paid: 0 }],
      updateSplit: mock.fn(async () => [1])
    };
    const service = new ShareSplitService(repo, {});
    await service.splitEqually({ id_share: 1, paid_amount: 120 });

    const datos = repo.updateSplit.mock.calls.map((c) => c.arguments[0]);
    assert.equal(datos.length, 3);
    assert.ok(datos.every((d) => d.percentage === datos[0].percentage), 'participaciones iguales');
    assert.ok(Math.abs(suma(datos.map((d) => d.percentage)) - 100) < 1e-9, 'suma 100 %');
    assert.ok(Math.abs(suma(datos.map((d) => d.assigned_amount)) - 120) < 1e-9, 'suma de asignados = total');
    assert.ok(Math.abs(suma(datos.map((d) => d.balance))) < 1e-9, 'los balances se compensan');
  });

  it('con un gasto de 120 entre A, B y C (precisión de la BD) cada uno asume 40 y no se pierde importe', async () => {
    const { mundo, share } = await conGasto120([BETO, CARLA]);
    const filas = [];
    for (const u of [ANA, BETO, CARLA]) filas.push(await mundo.splitDe(share.id_share, u.id_user));

    assert.ok(filas.every((f) => f.pct === 33.33), 'participaciones iguales (33.33 %)');
    assert.ok(filas.every((f) => f.asignado === 40));
    assert.equal(suma(filas.map((f) => f.asignado)), 120);
    assert.deepEqual(filas.map((f) => f.balance), [80, -40, -40]);
    assert.ok(casiIgual(suma(filas.map((f) => f.pct)), 100), 'suma ≈ 100 % (según la precisión aplicada)');
  });

  // it('DEFECTO: un gasto de 100 entre tres integrantes no debe perder importe por redondeo',
  //   { todo: 'DEF-05: el porcentaje se persiste como DECIMAL(5,2) (33.33) y la suma de lo asignado queda en 99.99 (sharesplit-service.js: updateSplitData usa el % ya redondeado)' },
  //   async () => {
  //     const mundo = construirMundo();
  //     const share = await crearShare(mundo, { miembros: [BETO, CARLA] });
  //     await registrarGasto(mundo, { share, monto: 100 });
  //     const filas = [];
  //     for (const u of [ANA, BETO, CARLA]) filas.push(await mundo.splitDe(share.id_share, u.id_user));
  //     assert.equal(Math.round(suma(filas.map((f) => f.asignado)) * 100) / 100, 100);
  //   });
});

describe('CP-22: porcentajes 70 % y 30 % sobre un gasto total de 120 (RU-051–RU-053, RU-058)', () => {
  const personalizado = (a, b) => [
    { id_user: ANA.id_user, percentage: a }, { id_user: BETO.id_user, percentage: b }];

  it('asigna 84 y 36 y recalcula los balances', async () => {
    const { mundo, share } = await conGasto120([BETO]);
    await mundo.shareService.modifySplitsPercentages(share.id_share, personalizado(70, 30));

    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 70, asignado: 84, pagado: 120, balance: 36 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 30, asignado: 36, pagado: 0, balance: -36 });
  });

  it('un gasto posterior respeta los porcentajes personalizados (RU-058, RU-079)', async () => {
    const { mundo, share } = await conGasto120([BETO]);
    await mundo.shareService.modifySplitsPercentages(share.id_share, personalizado(70, 30));

    await registrarGasto(mundo, { share, usuario: BETO, monto: 80 }); // total 200

    assert.deepEqual(await mundo.splitDe(share.id_share, ANA.id_user), { pct: 70, asignado: 140, pagado: 120, balance: -20 });
    assert.deepEqual(await mundo.splitDe(share.id_share, BETO.id_user), { pct: 30, asignado: 60, pagado: 80, balance: 20 });
  });

  it('acepta porcentajes decimales que suman exactamente 100 (33.33 + 33.33 + 33.34)', () => {
    const service = new ShareSplitService({}, {});
    assert.equal(service.validatePercentages([{ percentage: 33.33 }, { percentage: 33.33 }, { percentage: 33.34 }]), true);
  });

  it('el controlador responde 200 con la distribución personalizada', async () => {
    const service = { modifySplitsPercentages: mock.fn(async () => undefined) };
    const res = createRes();
    const cuerpo = personalizado(70, 30);
    await new ShareController(service).modifySplitsPercentages({ params: { shareId: 5 }, body: cuerpo }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(service.modifySplitsPercentages.mock.calls[0].arguments, [5, cuerpo]);
  });
});

describe('CP-23: distribución personalizada que suma 90 % o 110 % (RU-052)', () => {
  const personalizado = (a, b) => [
    { id_user: ANA.id_user, percentage: a }, { id_user: BETO.id_user, percentage: b }];

  for (const [a, b, total] of [[60, 30, 90], [60, 50, 110], [50, 49.99, 99.99], [50, 50.01, 100.01], [0, 0, 0]]) {
    it(`rechaza una distribución que suma ${total} % sin persistir nada`, async () => {
      const { mundo, share } = await conGasto120([BETO]);
      const antes = mundo.shareSplitRepository.snapshot();

      await assert.rejects(
        () => mundo.shareService.modifySplitsPercentages(share.id_share, personalizado(a, b)),
        { message: 'Los porcentajes deben sumar 100' });

      assert.equal(mundo.shareSplitRepository.snapshot(), antes, 'la distribución almacenada no cambia');
    });
  }

  it('acepta exactamente 100 %', async () => {
    const { mundo, share } = await conGasto120([BETO]);
    await mundo.shareService.modifySplitsPercentages(share.id_share, personalizado(60, 40));
    assert.equal((await mundo.splitDe(share.id_share, ANA.id_user)).pct, 60);
  });

  it('el controlador responde 400 con el mensaje cuando la suma es inválida', async () => {
    mock.method(console, 'error', () => {});
    const { mundo, share } = await conGasto120([BETO]);
    const res = createRes();
    await new ShareController(mundo.shareService)
      .modifySplitsPercentages({ params: { shareId: share.id_share }, body: personalizado(60, 30) }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Los porcentajes deben sumar 100');
  });

  // it('DEFECTO: no deben aceptarse porcentajes negativos aunque la suma sea 100',
  //   { todo: 'DEF-06: validatePercentages solo comprueba la suma; [150, -50] suma 100 y se acepta (sharesplit-service.js:validatePercentages)' },
  //   async () => {
  //     const { mundo, share } = await conGasto120([BETO]);
  //     await assert.rejects(() => mundo.shareService.modifySplitsPercentages(share.id_share, personalizado(150, -50)));
  //   });

  // it('DEFECTO: una distribución con un usuario ajeno al Share no debe modificar ningún porcentaje',
  //   { todo: 'DEF-07: modifyPercentage actualiza miembro por miembro sin validar pertenencia; falla a mitad y deja la distribución a medio cambiar (sharesplit-service.js:modifyPercentage)' },
  //   async () => {
  //     const { mundo, share } = await conGasto120([BETO]);
  //     const antes = mundo.shareSplitRepository.snapshot();
  //     await assert.rejects(() => mundo.shareService.modifySplitsPercentages(share.id_share, [
  //       { id_user: ANA.id_user, percentage: 60 }, { id_user: CARLA.id_user, percentage: 40 }])); // Carla no es miembro
  //     assert.equal(mundo.shareSplitRepository.snapshot(), antes);
  //   });
});
