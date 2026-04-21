-- Ticket Rivals — Fase 4: Mercado Pago (preferencias, pagos, comisiones, reembolsos)
--
-- Orden recomendado:
--   1) Si tu tabla `ordenes` NO tiene `idevento`, ejecuta primero database/schema_updates.sql
--      (la app y los reportes lo necesitan).
--   2) Luego este archivo.
--
-- Si MySQL avisa columna o índice duplicado, omite solo esa línea.

SET NAMES utf8mb4;

-- Columnas al final de la tabla (no usamos AFTER … para no fallar si falta idevento u otro campo).
ALTER TABLE `ordenes`
  ADD COLUMN `idzona` int(11) DEFAULT NULL COMMENT 'evento_zonas.id; NULL si evento sin zonas',
  ADD COLUMN `cantidad_boletos` int(11) NOT NULL DEFAULT 1,
  ADD COLUMN `mp_preference_id` varchar(64) DEFAULT NULL,
  ADD KEY `idx_ordenes_mp_preference` (`mp_preference_id`);

ALTER TABLE `pagos`
  ADD COLUMN `mp_payment_id` varchar(64) DEFAULT NULL,
  ADD COLUMN `mp_status_detail` varchar(128) DEFAULT NULL,
  ADD COLUMN `comision_plataforma` decimal(12,2) DEFAULT NULL COMMENT 'Estimado interno al aprobar',
  ADD COLUMN `reembolsado_at` datetime DEFAULT NULL,
  ADD UNIQUE KEY `uk_pagos_mp_payment_id` (`mp_payment_id`);
