-- Ejecutar después del dump principal ticket_rivals.sql
-- También ejecuta database/schema_perfil_usuario.sql (perfil_completado / flujo Google).
-- Enlaza cada orden con un evento (una compra = un evento) para reportes del organizador y Mercado Pago.

ALTER TABLE `ordenes`
  ADD COLUMN `idevento` int(11) NULL DEFAULT NULL AFTER `idusuario`,
  ADD KEY `idx_ordenes_idevento` (`idevento`);

ALTER TABLE `ordenes`
  ADD CONSTRAINT `ordenes_ibfk_evento` FOREIGN KEY (`idevento`) REFERENCES `eventos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
