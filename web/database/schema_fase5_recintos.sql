-- Ticket Rivals — Fase 5: recintos, plantilla de zonas y vínculo en eventos
-- Ejecutar tras schema_eventos_organizador.sql (tabla evento_zonas).
-- Si un ADD COLUMN o CREATE falla por duplicado, omite esa parte.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `recintos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(200) NOT NULL,
  `ubicacion_resumen` varchar(255) DEFAULT NULL COMMENT 'Ciudad, zona o alias corto',
  `direccion` varchar(512) DEFAULT NULL,
  `url_mapa` varchar(512) DEFAULT NULL COMMENT 'Enlace Google Maps del recinto',
  `aforo_maximo` int(11) NOT NULL DEFAULT 0 COMMENT '0 = no validar tope; >0 = suma zonas del evento no puede excederlo',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_recintos_activo` (`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recinto_plantilla_zonas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idrecinto` int(11) NOT NULL,
  `nombre_seccion` varchar(120) NOT NULL,
  `descripcion_zona` text DEFAULT NULL,
  `precio_sugerido` decimal(12,2) NOT NULL DEFAULT 0.00,
  `capacidad` int(11) NOT NULL,
  `limite_por_transaccion` int(11) DEFAULT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_plantilla_recinto` (`idrecinto`),
  CONSTRAINT `fk_plantilla_recinto` FOREIGN KEY (`idrecinto`) REFERENCES `recintos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `eventos`
  ADD COLUMN `idrecinto` int(11) DEFAULT NULL COMMENT 'Recinto del catálogo (opcional)',
  ADD KEY `idx_eventos_idrecinto` (`idrecinto`);

ALTER TABLE `eventos`
  ADD CONSTRAINT `fk_eventos_recinto` FOREIGN KEY (`idrecinto`) REFERENCES `recintos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
