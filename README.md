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

Para ejecutar las pruebas del backend:

```bash
npm run test:unit
```

También se pueden ejecutar mediante:

```bash
npm test
```

Estos comandos requieren que se hayan incorporado previamente el archivo de prueba y los scripts de `package.json`.

Actualmente se implementa una prueba unitaria correspondiente al **CP-05**, que valida la longitud del número telefónico durante el registro de usuarios (10 a 15 dígitos).

Las pruebas no requieren iniciar el servidor ni conectarse a PostgreSQL.

## 4. Ejecución automática de pruebas

El proyecto utiliza **GitHub Actions** mediante `.github/workflows/backend-ci.yml`.

El pipeline se activa automáticamente al realizar un push a las ramas configuradas y ejecuta la instalación de dependencias, validación del código y pruebas unitarias.

Los resultados pueden consultarse en la pestaña **Actions** del repositorio en GitHub.