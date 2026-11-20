// Debe importarse PRIMERO en cada archivo de prueba.
// Fija variables de entorno falsas y deterministas para que las pruebas unitarias:
//   - nunca dependan del .env del desarrollador (ni usen secretos reales),
//   - nunca intenten conectarse a PostgreSQL ni a Gemini.
// Sequelize crea la conexion de forma perezosa, por lo que importar los modelos es seguro.
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-unitarias';
process.env.COOKIE_SECRET = 'cookie-secreto-de-pruebas';
process.env.GEMINI_API_KEY = 'clave-falsa-de-pruebas';
process.env.DB_NAME = 'moneyshare_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_DIALECT = 'postgres';
