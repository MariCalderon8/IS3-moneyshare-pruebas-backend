# Pruebas unitarias — MoneyShare Backend

Implementan los escenarios **CP-01 a CP-48** del *Plan de Pruebas MoneyShare EAM* en su porción **unitaria**:
lógica de validadores, servicios, controladores, middleware JWT, repositorios (con el modelo simulado) y
metadatos de los modelos. **No** usan PostgreSQL, Gemini, correo ni red.

## Cómo ejecutarlas

```bash
npm ci
npm test                 # = npm run test:unit (todas las pruebas + cobertura)
npm run test:unit -- --test-name-pattern="CP-29"   # un solo caso
```

## Estructura

```
tests/
├── helpers/
│   ├── setup-env.js        # variables de entorno falsas (se importa PRIMERO en cada prueba)
│   ├── express-helpers.js  # req/res falsos, ejecución de validadores y de cadenas de ruta
│   └── fakes.js            # repositorios en memoria + fábrica del grafo de servicios reales
└── unit/
    ├── 01-registro-usuarios.test.js          CP-01 … CP-05
    ├── 02-autenticacion-jwt.test.js          CP-06 … CP-08
    ├── 03-shares.test.js                     CP-09 … CP-12
    ├── 04-gastos.test.js                     CP-13 … CP-19
    ├── 05-distribucion-gastos.test.js        CP-20 … CP-23
    ├── 06-balances-integrantes-pagos.test.js CP-24 … CP-35
    ├── 07-notificaciones.test.js             CP-36 … CP-42
    └── 08-asistente-ia.test.js               CP-43 … CP-48
```

Cada `describe` se llama `CP-XX: …` con los RU que cubre, para rastrear plan → prueba.

## Estrategia

* **Lógica real, datos simulados.** Los servicios (`share-service`, `sharesplit-service`, `expense-service`,
  `notification-service`…) se ejecutan tal cual; solo se reemplaza el acceso a datos por repositorios en memoria.
  Estos imitan al driver de PostgreSQL: `DECIMAL` devuelto como texto con 2 decimales y porcentaje `DECIMAL(5,2)`.
* **Repositorios y modelos:** se simula `Model.create/findOne/findAll/update/destroy` con `mock.method`.
* **Entorno aislado:** `setup-env.js` fija secretos falsos, de modo que ninguna prueba usa el `.env` real.

## Qué NO cubre (requiere pruebas de integración / funcionales del plan)

| Caso | Parte no unitaria |
|---|---|
| CP-01, CP-03 | Persistencia real en BD y rechazo real por restricción `UNIQUE` (solo se verifica que el modelo la declara y que el error se propaga) |
| CP-06, CP-07 | Comportamiento de la interfaz Angular tras el login |
| CP-34 | Borrado en cascada real en PostgreSQL (se verifica la declaración `ON DELETE CASCADE`) |
| CP-43 … CP-47 | Pertinencia semántica de las respuestas de Gemini (se verifica prompt, envío, reinicio de historial y token) |
| RU-015 | El plan indica que debe validarse antes su mecanismo; no tiene caso ejecutable |

## Defectos detectados (pruebas marcadas `todo`)

Las pruebas `todo` describen el comportamiento **correcto** esperado. Hoy fallan por un defecto del código, pero no
ponen el CI en rojo. Cuando se corrija el defecto, la prueba pasará: entonces hay que quitarle la marca `todo`.

| ID | CP | Defecto | Ubicación |
|---|---|---|---|
| DEF-01 | 03 | El correo de bienvenida se envía **antes** de crear la cuenta; si el registro falla, igual se envía | `user-service.js` `register` |
| DEF-02 | 11 | Un intento de unión repetido genera otra notificación "Te uniste" antes de validar duplicados | `share-service.js` `addMember` |
| DEF-03 | 17 | `getExpenseByUser` llama a `findExpensesByUser`, que **no existe** en el repositorio (GET `/expense/user/:username` → error) | `expense-service.js` / `expense-repository.js` |
| DEF-04 | 18 | Editar un gasto sin enviar `amount` calcula `NaN` y corrompe el total del Share y lo pagado | `expense-service.js` `updateExpense` |
| DEF-05 | 21 | Con 3 miembros, un gasto de 100 pierde 0.01 (el % se persiste como 33.33) | `sharesplit-service.js` `updateSplitData` |
| DEF-06 | 23 | Se aceptan porcentajes negativos si suman 100 (p. ej. 150 y -50) | `sharesplit-service.js` `validatePercentages` |
| DEF-07 | 23 | Con un usuario ajeno al Share, la distribución se aplica a medias (no es atómica) | `sharesplit-service.js` `modifyPercentage` |
| DEF-08 | 27 | `removeMember` pasa el objeto (no el id) a `deleteSplit` y no usa `await`: el integrante no se elimina | `share-service.js` `removeMember` |
| DEF-09 | 34 | `Share.hasMany(ShareSplit)` usa la llave `id_split` en lugar de `id_share` | `ShareDTO.js` |
