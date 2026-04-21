-- Recuperación de contraseña: código por correo (válido 15 minutos, un código activo por usuario).
-- Ejecutar una vez. Si la tabla ya existe, MySQL avisará y puedes ignorarlo.

CREATE TABLE IF NOT EXISTS `password_reset_codes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `code_hash` CHAR(64) NOT NULL COMMENT 'HMAC-SHA256 hex del código de 6 dígitos',
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user` (`user_id`),
  KEY `idx_expires_at` (`expires_at`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
