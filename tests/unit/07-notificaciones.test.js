import '../helpers/setup-env.js';
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import NotificationController from '../../src/controllers/notification-controller.js';
import { createRes } from '../helpers/express-helpers.js';
import { construirMundo, crearShare, registrarGasto, ANA, BETO, CARLA } from '../helpers/fakes.js';

// Iteracion 4 - Notificaciones internas (HU-014 a HU-016) - CP-36 a CP-42
afterEach(() => mock.restoreAll());

const NOMBRE = 'Viaje a la costa';

describe('CP-36: crear Share con el usuario A (RU-091, RU-099)', () => {
  it('se crea una notificación interna para el creador, con el nombre del Share', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA, nombre: NOMBRE });
    await mundo.settle();

    const deAna = await mundo.notificacionesDe(ANA.id_user);
    assert.equal(deAna.length, 1);
    assert.equal(deAna[0].type, 'general');
    assert.match(deAna[0].message, /Creaste un nuevo share/);
    assert.ok(deAna[0].message.includes(NOMBRE));
  });

  it('registra la fecha de generación (RU-099)', async () => {
    const mundo = construirMundo();
    const antes = Date.now();
    await crearShare(mundo, { creador: ANA });
    const [n] = await mundo.notificacionesDe(ANA.id_user);
    assert.ok(n.date instanceof Date);
    assert.ok(n.date.getTime() >= antes - 1000 && n.date.getTime() <= Date.now() + 1000);
  });

  it('otros usuarios no reciben notificación por la creación', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA });
    assert.equal((await mundo.notificacionesDe(BETO.id_user)).length, 0);
    assert.equal((await mundo.notificacionesDe(CARLA.id_user)).length, 0);
  });
});

describe('CP-37: incorporar a B mediante código de invitación (RU-092)', () => {
  it('B recibe una notificación de que se unió al Share', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, nombre: NOMBRE });
    await mundo.shareService.addMember(share.code, BETO.email);

    const deBeto = await mundo.notificacionesDe(BETO.id_user);
    assert.equal(deBeto.length, 1);
    assert.equal(deBeto[0].type, 'general');
    assert.match(deBeto[0].message, /Te uniste al share/);
    assert.ok(deBeto[0].message.includes(NOMBRE));
  });

  it('el creador no recibe la notificación de "unión" al crear su propio Share', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA });
    const deAna = await mundo.notificacionesDe(ANA.id_user);
    assert.ok(deAna.every((n) => !/Te uniste/.test(n.message)));
  });
});

describe('CP-38: registrar un gasto de 120 en un Share con A y B (RU-093–RU-095)', () => {
  async function conGasto() {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO], nombre: NOMBRE });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    return mundo;
  }
  const delGasto = (lista) => lista.filter((n) => /gasto de \$120/.test(n.message));

  it('el autor del gasto recibe un aviso con el monto y el nombre del Share', async () => {
    const mundo = await conGasto();
    const [n] = delGasto(await mundo.notificacionesDe(ANA.id_user));
    assert.ok(n, 'A debe tener la notificación del gasto');
    assert.match(n.message, /Añadiste un gasto de \$120/);
    assert.ok(n.message.includes(NOMBRE));
  });

  it('los demás integrantes reciben un aviso que identifica al autor, el monto y el Share', async () => {
    const mundo = await conGasto();
    const [n] = delGasto(await mundo.notificacionesDe(BETO.id_user));
    assert.ok(n, 'B debe tener la notificación del gasto');
    assert.ok(n.message.includes('ana'), 'identifica al usuario que hizo el gasto (RU-095)');
    assert.ok(n.message.includes('$120'));
    assert.ok(n.message.includes(NOMBRE));
  });

  it('quien no es integrante del Share no recibe aviso', async () => {
    const mundo = await conGasto();
    assert.equal((await mundo.notificacionesDe(CARLA.id_user)).length, 0);
  });
});

describe('CP-39: registrar una compensación de B a A (RU-089, RU-090)', () => {
  async function conPago() {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO], nombre: NOMBRE });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    await mundo.shareService.makePayment(share.id_share, 30, BETO.id_user, ANA.id_user);
    return mundo;
  }

  it('el pagador recibe la notificación del pago realizado', async () => {
    const mundo = await conPago();
    const n = (await mundo.notificacionesDe(BETO.id_user)).find((x) => x.type === 'payment');
    assert.ok(n, 'B debe tener notificación de tipo payment');
    assert.match(n.message, /Pagaste \$30 a ana/);
    assert.ok(n.message.includes(NOMBRE));
  });

  it('el receptor recibe la notificación del pago recibido', async () => {
    const mundo = await conPago();
    const n = (await mundo.notificacionesDe(ANA.id_user)).find((x) => x.type === 'payment');
    assert.ok(n, 'A debe tener notificación de tipo payment');
    assert.match(n.message, /beto te pagó \$30/);
    assert.ok(n.message.includes(NOMBRE));
  });

  it('una compensación rechazada no genera notificaciones', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO] });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    await assert.rejects(() => mundo.shareService.makePayment(share.id_share, 500, BETO.id_user, ANA.id_user));
    assert.equal(mundo.notificationRepository.rows.filter((n) => n.type === 'payment').length, 0);
  });
});

describe('CP-40: consultar como A y como C las notificaciones personales (RU-096, RU-099)', () => {
  it('cada usuario ve solo sus notificaciones, con mensaje y fecha del evento', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA, nombre: NOMBRE });
    await crearShare(mundo, { creador: CARLA, nombre: 'Share de Carla' });

    const deAna = await mundo.notificationService.findNotificationsByUser(ANA.email);
    const deCarla = await mundo.notificationService.findNotificationsByUser(CARLA.email);

    assert.equal(deAna.length, 1);
    assert.equal(deCarla.length, 1);
    assert.ok(deAna.every((n) => n.id_user === ANA.id_user));
    assert.ok(deCarla.every((n) => n.id_user === CARLA.id_user));
    assert.ok(deAna[0].message.includes(NOMBRE) && !deAna[0].message.includes('Share de Carla'));
    assert.ok(deAna[0].date instanceof Date);
  });

  it('un usuario sin eventos recibe una lista vacía', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA });
    assert.deepEqual(await mundo.notificationService.findNotificationsByUser(CARLA.email), []);
  });

  it('la consulta conserva las notificaciones hasta que se eliminan (no hay "marcar como leída")', async () => {
    const mundo = construirMundo();
    await crearShare(mundo, { creador: ANA });
    const primera = await mundo.notificationService.findNotificationsByUser(ANA.email);
    const segunda = await mundo.notificationService.findNotificationsByUser(ANA.email);
    assert.deepEqual(segunda, primera);
  });

  it('la notificación de bienvenida queda asociada al usuario', async () => {
    const mundo = construirMundo();
    await mundo.notificationService.createWelcomeNotification(CARLA.email);
    const [n] = await mundo.notificacionesDe(CARLA.id_user);
    assert.match(n.message, /Bienvenido a MoneyShare/);
  });

  it('el controlador usa el correo del token y responde 200 con los datos', async () => {
    const service = { findNotificationsByUser: mock.fn(async () => [{ id_notification: 1 }]) };
    const res = createRes();
    await new NotificationController(service).findNotificationsByUser({ dataToken: { userEmail: ANA.email } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(service.findNotificationsByUser.mock.calls[0].arguments, [ANA.email]);
    assert.deepEqual(res.body.data, [{ id_notification: 1 }]);
  });
});

describe('CP-41: eliminar una notificación de A y consultar de nuevo A y B (RU-097)', () => {
  async function conNotificaciones() {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO] });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    return mundo;
  }

  it('desaparece la notificación de A y las de B permanecen intactas', async () => {
    const mundo = await conNotificaciones();
    const deAnaAntes = await mundo.notificacionesDe(ANA.id_user);
    const deBetoAntes = await mundo.notificacionesDe(BETO.id_user);
    assert.ok(deAnaAntes.length >= 2);

    await mundo.notificationService.deleteNotification(deAnaAntes[0].id_notification);

    const deAna = await mundo.notificacionesDe(ANA.id_user);
    assert.equal(deAna.length, deAnaAntes.length - 1);
    assert.ok(!deAna.some((n) => n.id_notification === deAnaAntes[0].id_notification));
    assert.deepEqual(await mundo.notificacionesDe(BETO.id_user), deBetoAntes);
  });

  it('el controlador responde 200 al eliminar y 500 con el mensaje si falla', async () => {
    const ok = createRes();
    const service = { deleteNotification: mock.fn(async () => 1) };
    await new NotificationController(service).deleteNotification({ params: { id: 4 } }, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(service.deleteNotification.mock.calls[0].arguments, [4]);

    const fallo = createRes();
    await new NotificationController({ deleteNotification: async () => { throw new Error('boom'); } })
      .deleteNotification({ params: { id: 4 } }, fallo);
    assert.equal(fallo.statusCode, 500);
    assert.equal(fallo.body.message, 'boom');
  });
});

describe('CP-42: eliminar todas las notificaciones de A y volver a consultar (RU-098)', () => {
  it('A queda sin notificaciones y las de B permanecen', async () => {
    const mundo = construirMundo();
    const share = await crearShare(mundo, { creador: ANA, miembros: [BETO] });
    await registrarGasto(mundo, { share, usuario: ANA, monto: 120 });
    const deBetoAntes = await mundo.notificacionesDe(BETO.id_user);
    assert.ok(deBetoAntes.length >= 2, 'B tiene al menos la de unión y la del gasto');

    await mundo.notificationService.deleteAllNotifications(ANA.email);

    assert.deepEqual(await mundo.notificationService.findNotificationsByUser(ANA.email), []);
    assert.deepEqual(await mundo.notificacionesDe(BETO.id_user), deBetoAntes);
  });

  it('eliminar todas sin tener notificaciones no produce error', async () => {
    const mundo = construirMundo();
    await mundo.notificationService.deleteAllNotifications(CARLA.email);
    assert.deepEqual(await mundo.notificacionesDe(CARLA.id_user), []);
  });

  it('el controlador usa el correo del token y responde 200', async () => {
    const service = { deleteAllNotifications: mock.fn(async () => 3) };
    const res = createRes();
    await new NotificationController(service).deleteAllNotifications({ dataToken: { userEmail: ANA.email } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(service.deleteAllNotifications.mock.calls[0].arguments, [ANA.email]);
  });
});
