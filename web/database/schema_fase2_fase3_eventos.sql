-- Ticket Rivals — Fase 2 (moderación, destacados) y Fase 3 (cancelación)
-- Ejecutar una vez después de schema_eventos_organizador.sql (y dumps previos).
-- Convenciones:
--   estado_moderacion: borrador | pendiente | aprobado | rechazado
--   Catálogo público: activo=1 AND estado_moderacion='aprobado' AND cancelado_at IS NULL
--   destacado: 1 = prioridad en Home / hero

SET NAMES utf8mb4;

ALTER TABLE `eventos`
  ADD COLUMN `estado_moderacion` varchar(24) NOT NULL DEFAULT 'aprobado'
    COMMENT 'borrador|pendiente|aprobado|rechazado' AFTER `activo`,
  ADD COLUMN `moderacion_motivo` text DEFAULT NULL COMMENT 'Motivo si rechazado' AFTER `estado_moderacion`,
  ADD COLUMN `destacado` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1=destacado en inicio' AFTER `moderacion_motivo`,
  ADD COLUMN `cancelado_at` datetime DEFAULT NULL COMMENT 'Fase 3: evento cancelado' AFTER `destacado`,
  ADD COLUMN `motivo_cancelacion` varchar(512) DEFAULT NULL AFTER `cancelado_at`,
  ADD KEY `idx_eventos_catalogo` (`activo`, `estado_moderacion`, `cancelado_at`, `destacado`);

-- Eventos ya publicados siguen visibles; borradores marcados como borrador.
UPDATE `eventos` SET `estado_moderacion` = 'borrador' WHERE `activo` = 0;
UPDATE `eventos` SET `estado_moderacion` = 'aprobado' WHERE `activo` = 1;
