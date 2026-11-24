# MoneyShare — Backend · Pruebas unitarias y Pipeline CI

API REST del proyecto **MoneyShare** (plataforma web para administrar gastos compartidos). Este repositorio contiene el backend en **Node.js / Express** junto con la batería de **pruebas unitarias** definida en el *Plan de Pruebas MoneyShare EAM* y el **pipeline de integración continua** definido en el documento *Pipeline DevOps*, implementado con **GitHub Actions**.

- **Repositorio:** https://github.com/MariCalderon8/IS3-moneyshare-pruebas-backend
- **Equipo:** Maria Camila Castro Cardona · Mariluz Calderon Guevara · Sebastian Botero González
- **Alcance de las pruebas:** 10 casos de prueba (CP) y 24 pruebas unitarias (PU).
- **Alcance del pipeline:** pasos 1 a 5 (trigger, entorno, checkout, build, pruebas unitarias). **No** incluye despliegue ni publicación.

## Contenido

1. [Requisitos previos](#1-requisitos-previos)
2. [Instalación del ambiente](#2-instalación-del-ambiente)
3. [Ejecución local de las pruebas](#3-ejecución-local-de-las-pruebas)
4. [Pruebas implementadas (trazabilidad CP → PU)](#4-pruebas-implementadas-trazabilidad-cp--pu)
5. [El pipeline](#5-el-pipeline)
6. [Ejecutar el pipeline paso a paso](#6-ejecutar-el-pipeline-paso-a-paso)
7. [Ejecutar la aplicación (opcional)](#7-ejecutar-la-aplicación-opcional)

---

## 1. Requisitos previos

| Herramienta | Versión | Para qué se usa |
|---|---|---|
| Git | cualquiera reciente | Clonar el repositorio y enviar cambios |
| Node.js | **20 o superior** (el pipeline usa 20) | Ejecutar `node:test` y las pruebas |
| npm | incluido con Node.js | Instalar dependencias (`npm ci`) |
| Cuenta de GitHub | — | Ver/ejecutar el pipeline en GitHub Actions |

## 2. Instalación del ambiente

```bash
# 1. Clonar el repositorio
git clone https://github.com/MariCalderon8/IS3-moneyshare-pruebas-backend.git
cd IS3-moneyshare-pruebas-backend

# 2. Instalar dependencias
npm ci
```

## 3. Ejecución local de las pruebas

```bash
npm run test:unit    # comando principal
npm test             # equivalente
```

Ambos ejecutan únicamente `tests/unit/*.test.js` con el ejecutor nativo `node:test` y reportan la cobertura de código (`--experimental-test-coverage`).

**Resultado esperado con el código original:**
 
```
# tests 40
# pass 40
# fail 0
# skipped 0
```
 
Los 40 tests son las **24 PU principales** más **16 subpruebas** de variantes (por ejemplo, PU-05 prueba por separado contraseña sin mayúscula, sin número y sin carácter especial). Las subpruebas no son PU adicionales.

## 4. Pruebas implementadas (trazabilidad CP → PU)

| Archivo (`tests/unit/`) | CP | PU | Código evaluado |
|---|---|---|---|
| `CP-02-registro-datos.test.js` | CP-02 | PU-01 a PU-03 | `src/middleware/userValidator.js` |
| `CP-04-contrasena.test.js` | CP-04 | PU-04 a PU-06 | `src/middleware/userValidator.js` |
| `CP-05-telefono.test.js` | CP-05 | PU-07 a PU-10 | `src/middleware/userValidator.js` |
| `CP-08-token-jwt.test.js` | CP-08 | PU-11 a PU-13 | `src/middleware/verifyToken.js` |
| `CP-10-creacion-share.test.js` | CP-10 | PU-14, PU-15 | `src/middleware/shareValidator.js` |
| `CP-14-monto-gasto.test.js` | CP-14 | PU-16, PU-17 | `src/middleware/expenseValidator.js` |
| `CP-20-distribucion-equitativa.test.js` | CP-20 | PU-18, PU-19 | `src/services/sharesplit-service.js` |
| `CP-22-distribucion-personalizada.test.js` | CP-22 | PU-20 | `src/services/sharesplit-service.js` |
| `CP-23-porcentajes-invalidos.test.js` | CP-23 | PU-21, PU-22 | `src/services/sharesplit-service.js` |
| `CP-30-compensacion.test.js` | CP-30 | PU-23, PU-24 | `src/services/share-service.js` |

Detalle de las PU:

| PU | Verifica | Resultado esperado |
|---|---|---|
| PU-01 | Nombre de 2 caracteres | Rechazado |
| PU-02 | Usuario de 2 caracteres | Rechazado |
| PU-03 | Correo con formato inválido | Rechazado |
| PU-04 | Contraseña de 7 caracteres | Rechazada |
| PU-05 | Contraseña sin mayúscula / sin número / sin carácter especial | Rechazada en cada variante |
| PU-06 | Contraseña que cumple todas las reglas | Aceptada |
| PU-07 | Teléfono de 9 dígitos | Rechazado |
| PU-08 | Teléfono de 10 y 15 dígitos | Aceptados |
| PU-09 | Teléfono de 16 dígitos | Rechazado |
| PU-10 | Teléfono con letras o símbolos | Rechazado en cada variante |
| PU-11 | Solicitud sin token | HTTP 401 |
| PU-12 | Token inválido o expirado | HTTP 403 en cada variante |
| PU-13 | Token válido | `next()` y datos decodificados asignados |
| PU-14 | Nombre de Share de 2 caracteres | Rechazado |
| PU-15 | Fecha de vencimiento inválida | Rechazada |
| PU-16 | Monto cero o negativo | Rechazado en ambos casos |
| PU-17 | Monto positivo válido | Aceptado |
| PU-18 | Gasto de 120 entre 2 integrantes | 60 para cada uno |
| PU-19 | Distribución equitativa entre 2 integrantes | 50 % cada uno |
| PU-20 | 120 con 70 % / 30 % | 84 y 36 |
| PU-21 | Porcentajes que suman 90 % | Rechazados, sin actualizaciones |
| PU-22 | Porcentajes que suman 110 % | Rechazados, sin actualizaciones |
| PU-23 | Compensación de 61 con saldo a favor de 60 | Rechazada, sin actualizar balances |
| PU-24 | Compensación de 60 con saldo a favor de 60 | Aceptada |

Las utilidades de simulación compartidas están en `tests/helpers/mocks.js`.

## 5. El pipeline

Archivo: [`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml). Refleja el flujo definido en el documento *Pipeline DevOps*

| Paso del documento | Implementación en el workflow |
|---|---|
| 1. Trigger | `on: push` (main, develop), `pull_request` (hacia main) y `workflow_dispatch` (manual) |
| 2. Provisión del entorno | `runs-on: ubuntu-latest` + `actions/setup-node@v4` con Node 20 y caché de npm. Sin Docker |
| 3. Checkout | `actions/checkout@v4` |
| 4. Build | `npm ci` y verificación de sintaxis con `node --check` sobre todos los `.js` de `src/` |
| 5. Pruebas unitarias | `npm run test:unit` (24 PU) con `set -o pipefail`, de modo que cualquier fallo rompe el job |
| Evidencia | `actions/upload-artifact@v4` publica el resultado y la cobertura (se ejecuta siempre, incluso si hay fallos) |

Reglas del pipeline: no usa `continue-on-error`, no tiene umbrales de cobertura, no necesita secretos y no despliega ni publica paquetes.

## 6. Ejecutar el pipeline paso a paso

### 6.1 Lanzar una ejecución

Hay tres formas de activar el pipeline:

| Forma | Cómo |
|---|---|
| **Push** | Hacer `git push` a `main` o `develop` del repositorio |
| **Pull request** | Abrir un PR cuya rama destino sea `main`|
| **Manual** | Pestaña **Actions** → workflow *MoneyShare Backend - CI (10 CP / 24 PU)* → **Run workflow** → elegir rama → **Run workflow** |


### 6.2 Ver el resultado

1. Pestaña **Actions** → abrir la ejecución más reciente.
2. Abrir el job **Verificacion de backend y pruebas unitarias (24 PU)**.
3. Revisar cada paso: *Checkout del codigo*, *Configurar Node.js*, *Instalar dependencias*, *Verificar sintaxis de JavaScript*, *Pruebas unitarias (24 PU) y cobertura*, *Publicar evidencia de resultados y cobertura*.
4. En el paso de pruebas se ve la lista de PU y el resumen (`tests`, `pass`, `fail`, `skipped`) con la tabla de cobertura.
5. El SHA del commit evaluado aparece en el encabezado de la ejecución y en el paso de checkout.

## 7. Ejecutar la aplicación (opcional)

No es necesario para las pruebas ni para el pipeline. Requiere PostgreSQL instalado y configurado.

```bash
npm ci
cp .env.example .env     # completar variables de conexión, JWT y demás servicios
npm start                # http://localhost:3000, salvo que se configure otro puerto
```

Esquema de la base de datos: ejecutar en PostgreSQL el script src/database/Script_DDL_corrected.sql (crea la base moneyshare, sus tipos y tablas). Opcionalmente, src/database/exampleData.sql carga datos de ejemplo.
