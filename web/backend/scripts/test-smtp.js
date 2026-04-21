'use strict';

/**
 * Prueba SMTP sin levantar la API.
 * Desde la carpeta backend:
 *   node scripts/test-smtp.js                    → solo verifica usuario/clave con el servidor SMTP
 *   node scripts/test-smtp.js correo@ejemplo.com → además envía un correo de prueba a esa dirección
 */

const { loadEnv } = require('../src/config/loadEnv');

async function main() {
  loadEnv();
  const mail = require('../src/services/mailService');
  const dest = process.argv[2];

  console.log('--- Estado (sin secretos) ---');
  console.log(JSON.stringify(mail.getEmailDeliveryStatus(), null, 2));
  console.log('--- Conexión SMTP (verify) ---');

  try {
    if (!dest) {
      console.log('(Sin correo: no se envía mensaje. Uso: node scripts/test-smtp.js tu@correo.com)\n');
    }
    const r = await mail.testSmtpConnection(dest ? { sendTo: dest } : {});
    console.log('OK:', r);
    if (!dest) {
      console.log('\nPara probar que el correo llega a tu bandeja:');
      console.log('  node scripts/test-smtp.js tu@correo.com');
    }
  } catch (e) {
    console.error('\nFALLO:', e.message);
    if (e.deliveryStatus) {
      console.error('Motivo:', e.deliveryStatus.hint || e.deliveryStatus.mode);
    }
    process.exit(1);
  }
}

main();
