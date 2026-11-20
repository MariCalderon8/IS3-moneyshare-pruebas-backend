# MoneyShare — Backend

API REST del proyecto **MoneyShare**, una plataforma web para administrar gastos compartidos entre usuarios. El backend gestiona usuarios, autenticación, Shares, gastos, distribuciones, notificaciones y consultas del asistente de IA.

## 1. Requisitos previos

- Node.js 20 y npm.
- PostgreSQL instalado y configurado.

## 2. Ejecutar el proyecto

Clonar el repositorio y acceder a su carpeta:

```bash
cd moneysharebackendvankproject2-main
```

Instalar las dependencias:

```bash
npm ci
```

Crear un archivo `.env` en la raíz del proyecto y configurar las variables de conexión a PostgreSQL, autenticación y demás servicios, tomando como referencia `.env.example`.

Iniciar el servidor:

```bash
npm start
```

El backend estará disponible en `http://localhost:3000`, salvo que se configure otro puerto.

## 3. Ejecutar pruebas unitarias

```bash
npm test            # equivale a npm run test:unit
```

Ejecuta todas las pruebas de `tests/unit/` (casos CP-01 a CP-48 del plan, en su porción unitaria) y muestra la cobertura.
No requieren iniciar el servidor, PostgreSQL, Gemini ni conexión a internet. Para correr un solo caso:

```bash
npm run test:unit -- --test-name-pattern="CP-29"
```

El detalle de cada archivo, lo que no cubren y los defectos detectados está en [`tests/README.md`](tests/README.md).

## 4. Ejecución automática de pruebas

El proyecto utiliza **GitHub Actions** mediante `.github/workflows/backend-ci.yml`.

El pipeline se activa en cada push a `main` o `develop`, en cada pull request hacia `main` y de forma manual. Instala
dependencias (`npm ci`), valida la sintaxis y ejecuta `npm run test:unit` en Node 20 y 22. Si una prueba falla, el
pipeline queda en rojo. El resultado queda como artefacto y como resumen en la pestaña **Actions** del repositorio.
