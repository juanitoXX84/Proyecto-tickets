-- =============================================================================
-- Tablas de compra (OPCIONAL) — Ticket Rivals
-- =============================================================================
-- Úsalo SOLO si tu dump principal NO incluye ya `ordenes`, `pagos` y `boletos`
-- con columnas compatibles. Si esas tablas existen, revisa columnas y FKs manualmente.
--
-- Orden sugerido:
--   1) Dump principal + usuarios + eventos + categorías
--   2) database/schema_updates.sql (ordenes.idevento)
--   3) Este archivo (si faltan tablas)
--   4) database/stored_procedures.sql
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `ordenes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idusuario` int(11) NOT NULL,
  `idevento` int(11) DEFAULT NULL,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` varchar(32) NOT NULL DEFAULT 'pendiente',
  `fecha_creacion` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ordenes_usuario` (`idusuario`),
  KEY `idx_ordenes_evento` (`idevento`),
  CONSTRAINT `ordenes_ibfk_usuario` FOREIGN KEY (`idusuario`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ordenes_ibfk_evento` FOREIGN KEY (`idevento`) REFERENCES `eventos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pagos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idorden` int(11) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `estado` varchar(32) NOT NULL DEFAULT 'pendiente',
  `fecha` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pagos_orden` (`idorden`),
  CONSTRAINT `pagos_ibfk_orden` FOREIGN KEY (`idorden`) REFERENCES `ordenes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `boletos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idorden` int(11) DEFAULT NULL,
  `idusuario` int(11) NOT NULL,
  `idevento` int(11) NOT NULL,
  `estado` varchar(32) NOT NULL DEFAULT 'reservado',
  `codigo` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_boletos_codigo` (`codigo`),
  KEY `idx_boletos_usuario` (`idusuario`),
  KEY `idx_boletos_evento` (`idevento`),
  CONSTRAINT `boletos_ibfk_usuario` FOREIGN KEY (`idusuario`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `boletos_ibfk_evento` FOREIGN KEY (`idevento`) REFERENCES `eventos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `boletos_ibfk_orden` FOREIGN KEY (`idorden`) REFERENCES `ordenes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
