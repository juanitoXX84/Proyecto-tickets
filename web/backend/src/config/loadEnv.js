const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * Carga .env desde la primera ruta que exista (proyecto típico: web/.env o backend/.env).
 */
function loadEnv() {
  // __dirname = .../backend/src/config → subir 3 niveles = raíz web (web/.env)
  const candidates = [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      if (process.env.NODE_ENV !== 'production') {
        console.log('[ticket-rivals-api] .env cargado desde:', file);
      }
      // node --watch no reinicia al guardar solo .env; en dev recargamos variables al cambiar el archivo.
      if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_ENV_WATCH !== 'true') {
        let debounce = null;
        try {
          fs.watch(file, () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              debounce = null;
              dotenv.config({ path: file, override: true });
              try {
                const { logEmailConfigOnStartup } = require('../services/mailService');
                logEmailConfigOnStartup();
              } catch {
                /* mailService aún no cargado en el primer tick */
              }
              console.log('[ticket-rivals-api] .env recargado (cambios aplicados sin reiniciar).');
            }, 400);
          });
        } catch {
          /* ignorar si watch no disponible */
        }
      }
      return file;
    }
  }

  dotenv.config();
  console.warn(
    '[ticket-rivals-api] No se encontró ningún archivo .env. Crea uno con DB_USER, DB_PASS, DB_NAME (por ejemplo en la carpeta web/ junto a .env.example).'
  );
  return null;
}

module.exports = { loadEnv };
