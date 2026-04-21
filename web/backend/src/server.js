const app = require('./app');
const { logEmailConfigOnStartup } = require('./services/mailService');

const port = Number(process.env.PORT) || 3001;

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.warn('[ticket-rivals-api] Revisa .env: se necesitan DB_USER y DB_NAME (el .env debe estar en web/ o backend/).');
}

app.listen(port, () => {
  console.log(`API Ticket Rivals escuchando en http://localhost:${port}`);
  logEmailConfigOnStartup();
});
