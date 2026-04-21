-- Ticket Rivals — Fase 0 y 1: panel admin, cuentas activas, auditoría de acceso
-- Idempotente: seguro ejecutar varias veces (omite columnas/índices que ya existan).
-- Ejecutar en phpMyAdmin o mysql CLI sobre la base del proyecto.

SET NAMES utf8mb4;

-- Convenciones:
--   usuarios.activo: 1 = puede iniciar sesión; 0 = suspendido (borrado lógico).
--   usuarios.ultimo_login_metodo: 'password' | 'google' (último acceso exitoso).
--   roles válidos en la app: admin | organizador | usuario | pruebas

SET @db := DATABASE();

SET @has_usuarios := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'usuarios'
);

-- ---------------------------------------------------------------------------
-- usuarios: columnas e índice (solo si faltan)
-- ---------------------------------------------------------------------------
SET @has_activo := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'usuarios' AND column_name = 'activo'
);
SET @sql := IF(
  @has_usuarios = 1 AND @has_activo = 0,
  'ALTER TABLE `usuarios` ADD COLUMN `activo` tinyint(1) NOT NULL DEFAULT 1 COMMENT ''1=activo 0=suspendido'' AFTER `rol`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ultimo_acceso := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'usuarios' AND column_name = 'ultimo_acceso_at'
);
SET @sql := IF(
  @has_usuarios = 1 AND @has_ultimo_acceso = 0,
  'ALTER TABLE `usuarios` ADD COLUMN `ultimo_acceso_at` datetime DEFAULT NULL COMMENT ''Último login exitoso'' AFTER `activo`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ultimo_metodo := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'usuarios' AND column_name = 'ultimo_login_metodo'
);
SET @sql := IF(
  @has_usuarios = 1 AND @has_ultimo_metodo = 0,
  'ALTER TABLE `usuarios` ADD COLUMN `ultimo_login_metodo` varchar(16) DEFAULT NULL COMMENT ''password | google'' AFTER `ultimo_acceso_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx_rol_activo := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'usuarios' AND index_name = 'idx_usuarios_rol_activo'
);
SET @sql := IF(
  @has_usuarios = 1 AND @has_idx_rol_activo = 0,
  'ALTER TABLE `usuarios` ADD KEY `idx_usuarios_rol_activo` (`rol`, `activo`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Auditoría admin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_usuario_auditoria` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_user_id` int(11) NOT NULL,
  `target_user_id` int(11) NOT NULL,
  `accion` varchar(48) NOT NULL,
  `detalle` varchar(512) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_target` (`target_user_id`),
  KEY `idx_audit_admin` (`admin_user_id`),
  CONSTRAINT `fk_audit_admin` FOREIGN KEY (`admin_user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_audit_target` FOREIGN KEY (`target_user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'schema_admin_fase0_fase1.sql ejecutado (sin duplicar columnas)' AS status;
