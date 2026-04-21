-- Mapa de asientos numerados por zona (rejilla filas × columnas).
-- Ejecutar tras schema_eventos_organizador.sql y schema_zona_colores.sql.
-- Si una columna o tabla ya existe, omite solo esa parte.

SET NAMES utf8mb4;

ALTER TABLE `evento_zonas`
  ADD COLUMN `usa_mapa_asientos` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = venta por butaca numerada',
  ADD COLUMN `mapa_filas` smallint unsigned DEFAULT NULL COMMENT 'número de filas (ej. 8 → A–H)',
  ADD COLUMN `mapa_columnas` smallint unsigned DEFAULT NULL COMMENT 'asientos por fila (ej. 10)';

CREATE TABLE IF NOT EXISTS `evento_asientos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_zona` int(11) NOT NULL,
  `fila` varchar(8) NOT NULL,
  `columna` smallint unsigned NOT NULL,
  `estado` enum('available','held','sold') NOT NULL DEFAULT 'available',
  `id_orden_held` int(11) DEFAULT NULL COMMENT 'orden pendiente que reserva el asiento',
  `id_orden_compra` int(11) DEFAULT NULL COMMENT 'orden pagada que posee el asiento',
  `held_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_zona_fila_col` (`id_zona`, `fila`, `columna`),
  KEY `idx_zona_estado` (`id_zona`, `estado`),
  KEY `idx_held` (`id_orden_held`),
  KEY `idx_compra` (`id_orden_compra`),
  CONSTRAINT `fk_asiento_zona` FOREIGN KEY (`id_zona`) REFERENCES `evento_zonas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `ordenes`
  ADD COLUMN `seat_ids_json` text DEFAULT NULL COMMENT 'JSON array de evento_asientos.id';
