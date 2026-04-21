-- Ticket Rivals — extensión profesional de eventos para el panel organizador
-- Ejecutar una vez después del dump principal (y de schema_updates.sql si aplica).
-- Si algún ADD COLUMN falla por duplicado, ignora esa línea.

SET NAMES utf8mb4;

ALTER TABLE `eventos`
  ADD COLUMN `fecha_fin` datetime DEFAULT NULL COMMENT 'Fin del evento',
  ADD COLUMN `recinto` varchar(255) DEFAULT NULL COMMENT 'Nombre del recinto / sala',
  ADD COLUMN `direccion` varchar(512) DEFAULT NULL COMMENT 'Dirección física',
  ADD COLUMN `url_mapa` varchar(512) DEFAULT NULL COMMENT 'Enlace Google Maps u otro',
  ADD COLUMN `venta_inicio` datetime DEFAULT NULL COMMENT 'Inicio de venta pública',
  ADD COLUMN `venta_fin` datetime DEFAULT NULL COMMENT 'Fin de venta (ej. antes del evento)',
  ADD COLUMN `limite_boletos_por_transaccion` int(11) DEFAULT 6 COMMENT 'Máx. boletos por compra (evento)',
  ADD COLUMN `generar_qr_email` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Enviar QR por correo al pagar (futuro)',
  ADD COLUMN `instrucciones_canje` text DEFAULT NULL COMMENT 'Texto para el asistente en la entrada';

CREATE TABLE IF NOT EXISTS `evento_zonas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idevento` int(11) NOT NULL,
  `nombre_seccion` varchar(120) NOT NULL,
  `descripcion_zona` text DEFAULT NULL,
  `precio` decimal(12,2) NOT NULL,
  `capacidad` int(11) NOT NULL,
  `boletos_vendidos` int(11) NOT NULL DEFAULT 0,
  `limite_por_transaccion` int(11) DEFAULT NULL COMMENT 'NULL = usar límite del evento',
  `orden` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_evento_zonas_idevento` (`idevento`),
  CONSTRAINT `evento_zonas_ibfk_evento` FOREIGN KEY (`idevento`) REFERENCES `eventos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
