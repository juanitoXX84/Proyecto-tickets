-- Ticket Rivals — Reseñas y calificaciones de eventos
-- Ejecutar después de existir tablas `eventos` y `usuarios`.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `evento_resenas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idevento` int(11) NOT NULL,
  `idusuario` int(11) NOT NULL,
  `estrellas` tinyint(4) NOT NULL COMMENT '1–5',
  `comentario` text DEFAULT NULL,
  `oculto` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = moderado / no visible en público',
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_resena_evento_usuario` (`idevento`, `idusuario`),
  KEY `idx_resenas_evento` (`idevento`),
  KEY `idx_resenas_oculto` (`oculto`),
  CONSTRAINT `evento_resenas_ibfk_evento` FOREIGN KEY (`idevento`) REFERENCES `eventos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `evento_resenas_ibfk_usuario` FOREIGN KEY (`idusuario`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
