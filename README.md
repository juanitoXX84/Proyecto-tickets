# Proyecto Tickets - Entrega

Este repositorio contiene el proyecto completo de **Ticket Rivals** para revision academica.

## Estructura

- `web/frontend`: app React + Vite.
- `web/backend`: API Express + MySQL.
- `web/database`: scripts SQL de esquema y actualizaciones.
- `base de datos`: dump SQL principal.

## Requisitos

- Node.js 18 o superior
- MySQL o MariaDB

## 1) Configurar base de datos

1. Crear la base `ticket_rivals`.
2. Importar `base de datos/ticket_rivals.sql`.
3. Ejecutar scripts adicionales de `web/database` si se requiere flujo de pagos/funcionalidades recientes.

## 2) Configurar variables de entorno

1. Copiar `web/.env.example` como `web/.env`.
2. Completar credenciales locales (DB, JWT, Google OAuth, Mercado Pago, SMTP).

> Nota: `web/.env` real no se publica para proteger llaves y secretos.

## 3) Instalar dependencias

En terminal, desde `web`:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 4) Ejecutar proyecto

En dos terminales:

```bash
# Terminal 1
cd web/backend
npm run dev
```

```bash
# Terminal 2
cd web/frontend
npm run dev
```

Frontend: `http://localhost:5173`  
Backend healthcheck: `http://localhost:3001/api/health`

## Recursos para revision

- Documentacion tecnica en `web/README.md`.
- Scripts SQL en `web/database` y `base de datos`.
- Imagenes de eventos de ejemplo en `web/uploads/event-images`.
