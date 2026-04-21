-- URL de imagen del plano de zonas/asientos guardada en el propio evento (sin catálogo de recintos).
-- Ejecutar una vez si aún no existe la columna.

SET NAMES utf8mb4;

ALTER TABLE `eventos`
  ADD COLUMN `url_plano` varchar(512) DEFAULT NULL COMMENT 'Imagen del plano para pins de zonas (HTTP(S) o /uploads/...)';
