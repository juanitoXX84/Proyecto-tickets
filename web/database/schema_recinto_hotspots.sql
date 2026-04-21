-- Ticket Rivals — Hotspots de zonas sobre plano del recinto (porcentajes 0–100)
-- Ejecutar tras schema_fase5_recintos.sql y schema_eventos_organizador.sql.
-- Si una columna ya existe, omite esa línea.

SET NAMES utf8mb4;

ALTER TABLE `recintos`
  ADD COLUMN `url_plano` varchar(512) DEFAULT NULL COMMENT 'URL imagen del plano/asientos para hotspots';

ALTER TABLE `recinto_plantilla_zonas`
  ADD COLUMN `pos_x` decimal(5,2) DEFAULT NULL COMMENT 'Hotspot horizontal % sobre url_plano',
  ADD COLUMN `pos_y` decimal(5,2) DEFAULT NULL COMMENT 'Hotspot vertical % sobre url_plano';

ALTER TABLE `evento_zonas`
  ADD COLUMN `pos_x` decimal(5,2) DEFAULT NULL COMMENT 'Hotspot horizontal % (clonado o manual)',
  ADD COLUMN `pos_y` decimal(5,2) DEFAULT NULL COMMENT 'Hotspot vertical % (clonado o manual)';
