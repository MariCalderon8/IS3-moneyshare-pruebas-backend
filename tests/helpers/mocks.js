// Utilidades de simulación compartidas por las pruebas unitarias.
// Está fuera de tests/unit y no termina en *.test.js: no se ejecuta como prueba.
import { validationResult } from 'express-validator';

/** Simula el objeto `res` de Express registrando status y json enviados. */
export function crearRes() {
  const res = {
    statusCode: undefined,
    cuerpo: undefined,
    status(codigo) {
      res.statusCode = codigo;
      return res;
    },
    json(cuerpo) {
      res.cuerpo = cuerpo;
      return res;
    }
  };
  return res;
}

/** Simula `next()` registrando si fue invocado. */
export function crearNext() {
  const next = () => {
    next.llamado = true;
  };
  next.llamado = false;
  return next;
}

/**
 * Ejecuta una cadena de reglas de express-validator y luego el middleware
 * validador real (validatorUser / validatorShare / validatorExpense),
 * todo sobre un `req` simulado. No usa servidor HTTP.
 */
export async function ejecutarValidacion(reglas, middlewareValidador, body) {
  const req = { body };
  for (const regla of reglas) {
    await regla.run(req);
  }
  const errores = validationResult(req).array();
  const res = crearRes();
  const next = crearNext();
  middlewareValidador(req, res, next);
  return { errores, res, next };
}

/** Errores asociados a un campo concreto. */
export function erroresDe(errores, campo) {
  return errores.filter((e) => e.path === campo);
}
