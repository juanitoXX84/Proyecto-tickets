const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    const host = process.env.DB_HOST || '127.0.0.1';
    const user = process.env.DB_USER;
    const database = process.env.DB_NAME;
    const password = process.env.DB_PASS !== undefined && process.env.DB_PASS !== null ? process.env.DB_PASS : '';

    if (!user || String(user).trim() === '') {
      throw new Error(
        'DB_USER no está definido. Crea un archivo .env en la carpeta del proyecto (web/.env o backend/.env) con DB_USER=root (XAMPP) y DB_NAME=ticket_rivals.'
      );
    }
    if (!database || String(database).trim() === '') {
      throw new Error('DB_NAME no está definido en .env (ej. DB_NAME=ticket_rivals).');
    }

    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
    });
  }
  return pool;
}

async function query(sql, params) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

module.exports = { getPool, query };
