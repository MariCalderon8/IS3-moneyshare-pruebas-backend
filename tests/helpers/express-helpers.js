import { validationResult } from 'express-validator';

/** Respuesta Express falsa: registra status y cuerpo enviados. */
export function createRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

/** Ejecuta una lista de validadores express-validator y devuelve los errores. */
export async function validar(validadores, body) {
  const req = { body };
  for (const v of validadores) await v.run(req);
  return validationResult(req).array();
}

/** Devuelve solo los nombres de campo con error. */
export function camposConError(errores) {
  return [...new Set(errores.map((e) => e.path))];
}

/**
 * Simula el encadenado de una ruta Express (validadores -> validatorX -> controlador).
 * Devuelve { bloqueada } indicando si algun middleware previo al controlador corto la peticion.
 * El ultimo elemento (controlador) solo se invoca si ninguno de los anteriores bloqueo.
 */
export async function ejecutarRuta(handlers, req, res) {
  const previos = handlers.slice(0, -1);
  const controlador = handlers[handlers.length - 1];

  for (const handler of previos) {
    let avanzo = false;
    await new Promise((resolve) => {
      const next = (err) => { avanzo = !err; resolve(); };
      Promise.resolve(handler(req, res, next)).then(() => resolve());
    });
    if (!avanzo) return { bloqueada: true };
  }
  await controlador(req, res);
  return { bloqueada: false };
}

/** Deja correr las promesas "fire and forget" del codigo (p. ej. notificaciones sin await). */
export async function esperarTareasPendientes() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}
