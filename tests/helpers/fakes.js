// Dobles de prueba en memoria. Reemplazan SOLO la capa de acceso a datos (repositorios)
// y los servicios externos; la logica de negocio probada es la REAL de src/services.
//
// Fidelidad con PostgreSQL: las columnas DECIMAL se devuelven como cadenas con 2 decimales
// (p. ej. "120.00"), igual que hace el driver `pg`, y el porcentaje se guarda con DECIMAL(5,2).
import ShareService from '../../src/services/share-service.js';
import ShareSplitService from '../../src/services/sharesplit-service.js';
import ExpenseService from '../../src/services/expense-service.js';
import NotificationService from '../../src/services/notification-service.js';
import { esperarTareasPendientes } from './express-helpers.js';

const dec = (v) => Number(v).toFixed(2);
const copia = (o) => (o ? { ...o } : null);

export const USUARIOS = [
  { id_user: 1, name: 'Ana Perez', email: 'ana@example.com', username: 'ana' },
  { id_user: 2, name: 'Beto Gomez', email: 'beto@example.com', username: 'beto' },
  { id_user: 3, name: 'Carla Ruiz', email: 'carla@example.com', username: 'carla' }
];
export const ANA = USUARIOS[0];
export const BETO = USUARIOS[1];
export const CARLA = USUARIOS[2];

/** UserService falso. findById imita al repositorio real: lanza si no existe. */
export class FakeUserService {
  constructor(usuarios = USUARIOS) { this.usuarios = usuarios.map(copia); }
  async getIdByEmail(email) {
    return this.usuarios.find((u) => u.email === email)?.id_user ?? null;
  }
  async findById(id) {
    const u = this.usuarios.find((x) => x.id_user === Number(id));
    if (!u) throw new Error('Usuario no encontrado');
    return copia(u);
  }
}

export class InMemoryShareRepository {
  constructor() { this.rows = []; this.seq = 0; }
  async findShareById(id) { return copia(this.rows.find((s) => s.id_share == id)); }
  async findShareByCode(code) { return copia(this.rows.find((s) => s.code === code)); }
  async createShare(data) {
    const row = {
      amount: '0.00', paid_amount: '0.00', split_equally: true,
      status: 'active', type: 'share_expense', ...data, id_share: ++this.seq
    };
    row.paid_amount = dec(row.paid_amount);
    this.rows.push(row);
    return copia(row);
  }
  async updateShare(newData) {
    const row = this.rows.find((s) => s.id_share == newData.id_share);
    if (!row) throw new Error('No se encontró el Share para actualizar');
    Object.assign(row, newData);
    if ('paid_amount' in newData) row.paid_amount = dec(newData.paid_amount);
    return copia(row);
  }
  async deleteShare(id) {
    const n = this.rows.length;
    this.rows = this.rows.filter((s) => s.id_share != id);
    if (this.rows.length === n) throw new Error('No se encontró el Share para eliminar');
    return 'Share eliminado correctamente';
  }
  snapshot() { return JSON.stringify(this.rows); }
}

export class InMemoryShareSplitRepository {
  constructor() { this.rows = []; this.seq = 0; }
  async findSplitById(id) { return copia(this.rows.find((r) => r.id_split === id)); }
  async findSplitsByShare(shareId) {
    return this.rows.filter((r) => r.id_share == shareId).map(copia);
  }
  async countShareMembers(shareId) {
    return this.rows.filter((r) => r.id_share == shareId).length;
  }
  async findSplitsByUser(userId) {
    return this.rows.filter((r) => r.id_user == userId).map(copia);
  }
  async findSplitByUserShare(shareId, userId) {
    return copia(this.rows.find((r) => r.id_share == shareId && r.id_user == userId));
  }
  async createSplit(userId, shareId) {
    const row = {
      id_split: ++this.seq, id_share: shareId, id_user: userId,
      percentage: '0.00', assigned_amount: '0.00', paid: '0.00', balance: '0.00'
    };
    this.rows.push(row);
    return copia(row);
  }
  async deleteSplit(splitId) {
    const n = this.rows.length;
    this.rows = this.rows.filter((r) => r.id_split !== splitId); // igual que la BD: compara por id
    return n - this.rows.length;
  }
  async updateSplit(data, userId, shareId) {
    const row = this.rows.find((r) => r.id_share == shareId && r.id_user == userId);
    if (!row) return [0];
    for (const [k, v] of Object.entries(data)) row[k] = dec(v);
    return [1];
  }
  snapshot() { return JSON.stringify(this.rows); }
}

export class InMemoryNotificationRepository {
  constructor() { this.rows = []; this.seq = 0; }
  async findNotificationById(id) { return copia(this.rows.find((n) => n.id_notification == id)); }
  async findNotificationsByUser(idUser) {
    return this.rows.filter((n) => n.id_user === idUser).map(copia);
  }
  async createNotification(n) {
    const row = { ...n, id_notification: ++this.seq };
    this.rows.push(row);
    return copia(row);
  }
  async deleteNotification(id) {
    const n = this.rows.length;
    this.rows = this.rows.filter((x) => x.id_notification != id);
    return n - this.rows.length;
  }
  async deleteAllNotifications(idUser) {
    const n = this.rows.length;
    this.rows = this.rows.filter((x) => x.id_user !== idUser);
    return n - this.rows.length;
  }
}

export class InMemoryExpenseRepository {
  constructor() { this.rows = []; this.seq = 0; }
  async findExpenseByID(id) { return copia(this.rows.find((e) => e.id_expense == id)); }
  async findExpensesByShare(shareId) {
    return this.rows.filter((e) => e.id_share == shareId).map(copia);
  }
  async findExpensesByShareUser(shareId, userId) {
    return this.rows.filter((e) => e.id_share == shareId && e.id_user == userId).map(copia);
  }
  async createExpense(info) {
    const row = { ...info, amount: dec(info.amount), id_expense: ++this.seq };
    this.rows.push(row);
    return copia(row);
  }
  async updateExpense(data, id) {
    const row = this.rows.find((e) => e.id_expense == id);
    if (!row) throw new Error('No se encontró el expense para actualizar');
    Object.assign(row, data);
    if ('amount' in data && data.amount !== undefined) row.amount = dec(data.amount);
    return copia(row);
  }
  async deleteExpense(id) {
    const n = this.rows.length;
    this.rows = this.rows.filter((e) => e.id_expense != id);
    if (this.rows.length === n) throw new Error('Error al eliminar gasto');
    return n - this.rows.length;
  }
}

/** Construye el grafo de servicios REALES conectado a repositorios en memoria. */
export function construirMundo() {
  const userService = new FakeUserService();
  const notificationRepository = new InMemoryNotificationRepository();
  const notificationService = new NotificationService(notificationRepository, userService);
  const shareSplitRepository = new InMemoryShareSplitRepository();
  const shareSplitService = new ShareSplitService(shareSplitRepository, notificationService);
  const shareRepository = new InMemoryShareRepository();
  const shareService = new ShareService(
    shareRepository, shareSplitService, userService, {} /* shareMemberService no usado */, notificationService
  );
  const expenseRepository = new InMemoryExpenseRepository();
  const expenseService = new ExpenseService(expenseRepository, userService, shareService);

  return {
    userService, notificationRepository, notificationService,
    shareSplitRepository, shareSplitService, shareRepository, shareService,
    expenseRepository, expenseService,
    settle: esperarTareasPendientes,
    /** Valores numericos de la distribucion de un usuario en un share. */
    async splitDe(shareId, userId) {
      const s = await shareSplitRepository.findSplitByUserShare(shareId, userId);
      if (!s) return null;
      return {
        pct: Number(s.percentage), asignado: Number(s.assigned_amount),
        pagado: Number(s.paid), balance: Number(s.balance)
      };
    },
    async totalPagado(shareId) {
      return Number((await shareRepository.findShareById(shareId)).paid_amount);
    },
    async notificacionesDe(idUser) {
      return notificationRepository.findNotificationsByUser(idUser);
    }
  };
}

/** Crea un share con el creador y los miembros indicados usando la logica real de ShareService. */
export async function crearShare(mundo, { creador = ANA, miembros = [], nombre = 'Viaje a la costa', extra = {} } = {}) {
  const creado = await mundo.shareService.createShare(
    { name: nombre, type: 'share_expense', status: 'active', ...extra }, creador.email
  );
  for (const m of miembros) await mundo.shareService.addMember(creado.code, m.email);
  return mundo.shareRepository.findShareById(creado.id_share);
}

/** Registra un gasto usando la logica real de ExpenseService. */
export async function registrarGasto(mundo, { share, usuario = ANA, monto, ...resto }) {
  const gasto = await mundo.expenseService.createExpense(
    { id_share: share.id_share, amount: monto, category: 'General', description: 'Gasto de prueba', ...resto },
    usuario.email
  );
  await mundo.settle();
  return gasto;
}
