-- Colores del plano por zona (hex #RRGGBB, únicos dentro del mismo evento / plantilla).
-- Ejecutar tras schema_recinto_hotspots.sql. Si la columna ya existe, omite la línea correspondiente.

SET NAMES utf8mb4;

ALTER TABLE `recinto_plantilla_zonas`
  ADD COLUMN `color_plano` varchar(7) DEFAULT NULL COMMENT 'Hex #RRGGBB, único por plantilla';

ALTER TABLE `evento_zonas`
  ADD COLUMN `color_plano` varchar(7) DEFAULT NULL COMMENT 'Hex #RRGGBB, único por evento';
