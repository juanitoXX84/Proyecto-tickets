const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const passport = require('passport');
const { loadEnv } = require('./config/loadEnv');

loadEnv();

const { configurePassport } = require('./config/passport');
const routes = require('./routes');
const mercadopagoWebhookRoutes = require('./routes/mercadopagoWebhookRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

configurePassport();

const app = express();

const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  const sessionSecret = process.env.SESSION_SECRET?.trim() || process.env.JWT_SECRET;
  if (!sessionSecret || sessionSecret === 'dev-session-change-me') {
    throw new Error('Define SESSION_SECRET (o JWT_SECRET) seguro en producción; no uses valores por defecto');
  }
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(
  '/api/payments/webhook',
  express.raw({ type: ['application/json', 'text/plain', '*/*'], limit: '256kb' }),
  mercadopagoWebhookRoutes
);

app.use(express.json({ limit: '100kb' }));

const uploadsRoot = path.join(__dirname, '../../uploads');
app.use('/uploads', express.static(uploadsRoot));

app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'dev-session-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
