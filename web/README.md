# Ticket Rivals

Plataforma de venta de boletos (académica): **Express + MySQL** en el backend y **React (Vite) + Tailwind** en el frontend. Roles: `usuario`, `organizador`, `admin`.

## Requisitos

- Node.js 18+
- MySQL o MariaDB

## Base de datos

### XAMPP (local en Windows)

1. Abre el **panel de control de XAMPP** y pulsa **Start** en **MySQL** (y Apache solo si usas phpMyAdmin por navegador).
2. Entra a **phpMyAdmin** (`http://localhost/phpmyadmin`), crea la base `ticket_rivals` e importa tu archivo `.sql` (dump).
3. En tu `.env`, los valores habituales con XAMPP son: `DB_HOST=127.0.0.1`, `DB_USER=root`, `DB_PASS` vacío si no configuraste contraseña al root, `DB_NAME=ticket_rivals`. El puerto por defecto de MySQL es **3306** (no hace falta cambiarlo salvo que lo modifiques en XAMPP).

### Pasos generales

1. Crea la base `ticket_rivals` e importa tu dump SQL (phpMyAdmin o cliente MySQL).
2. Ejecuta también `database/schema_updates.sql` para añadir `ordenes.idevento` (enlaza cada orden con un evento y permite calcular recaudación por evento).
3. Para **pagos reales (Fase 4)**: `database/schema_tablas_compra_opcional.sql` (si no tienes ya `ordenes`/`pagos`/`boletos`) y `database/schema_fase4_mercadopago.sql`.

## Configuración

1. Copia `.env.example` a `.env`. Puedes dejarlo en la carpeta **`web/`** (recomendado) o en **`web/backend/`**; el servidor busca en ambos sitios.
2. Rellena `DB_*`, `JWT_SECRET` y, si usas Google, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y la URI de redirección en Google Cloud Console:

   `http://localhost:3001/api/auth/google/callback`

3. Instala dependencias:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Desarrollo

En dos terminales:

```bash
# Terminal 1 — API (puerto 3001)
cd backend
npm run dev
```

```bash
# Terminal 2 — Frontend (puerto 5173, proxy /api → 3001)
cd frontend
npm run dev
```

Abre `http://localhost:5173`. La API responde en `http://localhost:3001/api/health`.

## Endpoints útiles

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/events` | Listado público de eventos activos |
| GET | `/api/events/:id` | Detalle público |
| POST | `/api/auth/register` | Registro (rol `usuario`) |
| POST | `/api/auth/login` | Login email/contraseña |
| GET | `/api/auth/me` | Perfil (Bearer JWT) |
| GET | `/api/auth/google` | Inicio OAuth Google |
| GET | `/api/organizer/events` | Eventos del organizador (JWT + rol) |
| POST | `/api/payments/create-preference` | Preferencia Mercado Pago (requiere `.env` MP + migración Fase 4) |
| POST | `/api/payments/webhook/:token` | Webhook MP (raw JSON; token secreto en URL) |
| GET | `/api/admin/payments` | Listado de pagos (admin) |
| GET | `/api/admin/finance/summary` | Resumen por fechas `desde`/`hasta` (admin) |
| POST | `/api/admin/payments/:id/refund` | Reembolso vía API MP + marca local |

## Fases del proyecto (resumen)

| Fase | Contenido |
|------|------------|
| 0–1 | Panel admin, usuarios, suspensión, auditoría de login |
| 2–3 | Moderación de eventos, destacados, cancelación |
| 4 | Mercado Pago (preferencia, webhook, boletos), admin pagos/resumen/reembolsos |
| 5 (pendiente) | Recintos reutilizables y plantillas de zonas |

## Próximos pasos sugeridos

- Fase 5: catálogo de recintos y plantillas de mapas/zonas.
- Pulir emails post-compra y post-cancelación masivos.
