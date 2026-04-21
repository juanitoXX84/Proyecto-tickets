-- Ticket Rivals - Estabilizacion de compatibilidad de esquema
-- Objetivo: hacer el backend tolerante a instalaciones mixtas sin romper datos existentes.
-- Seguro para ejecutar mas de una vez (idempotente en lo posible).

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 1) ordenes.idevento + indice (si faltan)
-- ---------------------------------------------------------------------------
SET @has_ordenes := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'ordenes'
);

SET @has_ordenes_idevento := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'ordenes' AND column_name = 'idevento'
);

SET @sql := IF(
  @has_ordenes = 1 AND @has_ordenes_idevento = 0,
  'ALTER TABLE `ordenes` ADD COLUMN `idevento` int(11) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx_ordenes_idevento := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'ordenes' AND index_name = 'idx_ordenes_idevento'
);

SET @sql := IF(
  @has_ordenes = 1 AND @has_idx_ordenes_idevento = 0,
  'ALTER TABLE `ordenes` ADD KEY `idx_ordenes_idevento` (`idevento`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK opcional: solo si existe eventos.id y no hay una FK de ordenes.idevento -> eventos.id
SET @has_eventos := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'eventos'
);

SET @has_fk_ordenes_idevento := (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = @db
    AND table_name = 'ordenes'
    AND column_name = 'idevento'
    AND referenced_table_name = 'eventos'
    AND referenced_column_name = 'id'
);

SET @sql := IF(
  @has_ordenes = 1 AND @has_eventos = 1 AND @has_fk_ordenes_idevento = 0,
  'ALTER TABLE `ordenes` ADD CONSTRAINT `ordenes_ibfk_evento` FOREIGN KEY (`idevento`) REFERENCES `eventos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2) Columnas de fase MP en ordenes/pagos (si faltan)
-- ---------------------------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'ordenes' AND column_name = 'idzona'
);
SET @sql := IF(@has_ordenes = 1 AND @has_col = 0,
  'ALTER TABLE `ordenes` ADD COLUMN `idzona` int(11) DEFAULT NULL COMMENT ''evento_zonas.id; NULL si evento sin zonas''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'ordenes' AND column_name = 'cantidad_boletos'
);
SET @sql := IF(@has_ordenes = 1 AND @has_col = 0,
  'ALTER TABLE `ordenes` ADD COLUMN `cantidad_boletos` int(11) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'ordenes' AND column_name = 'mp_preference_id'
);
SET @sql := IF(@has_ordenes = 1 AND @has_col = 0,
  'ALTER TABLE `ordenes` ADD COLUMN `mp_preference_id` varchar(64) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'ordenes' AND index_name = 'idx_ordenes_mp_preference'
);
SET @sql := IF(@has_ordenes = 1 AND @has_idx = 0,
  'ALTER TABLE `ordenes` ADD KEY `idx_ordenes_mp_preference` (`mp_preference_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_pagos := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'pagos'
);

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'pagos' AND column_name = 'mp_payment_id'
);
SET @sql := IF(@has_pagos = 1 AND @has_col = 0,
  'ALTER TABLE `pagos` ADD COLUMN `mp_payment_id` varchar(64) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'pagos' AND column_name = 'mp_status_detail'
);
SET @sql := IF(@has_pagos = 1 AND @has_col = 0,
  'ALTER TABLE `pagos` ADD COLUMN `mp_status_detail` varchar(128) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'pagos' AND column_name = 'comision_plataforma'
);
SET @sql := IF(@has_pagos = 1 AND @has_col = 0,
  'ALTER TABLE `pagos` ADD COLUMN `comision_plataforma` decimal(12,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'pagos' AND column_name = 'reembolsado_at'
);
SET @sql := IF(@has_pagos = 1 AND @has_col = 0,
  'ALTER TABLE `pagos` ADD COLUMN `reembolsado_at` datetime DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_uk := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'pagos' AND index_name = 'uk_pagos_mp_payment_id'
);
SET @sql := IF(@has_pagos = 1 AND @has_uk = 0,
  'ALTER TABLE `pagos` ADD UNIQUE KEY `uk_pagos_mp_payment_id` (`mp_payment_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3) Backfill: completar ordenes.idevento desde idzona cuando aplique
-- ---------------------------------------------------------------------------
SET @has_evento_zonas := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'evento_zonas'
);

SET @sql := IF(
  @has_ordenes = 1 AND @has_evento_zonas = 1,
  'UPDATE ordenes o
   INNER JOIN evento_zonas z ON z.id = o.idzona
   SET o.idevento = z.idevento
   WHERE o.idevento IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4) Normalizar cantidad_boletos para filas antiguas
-- ---------------------------------------------------------------------------
SET @sql := IF(
  @has_ordenes = 1,
  'UPDATE ordenes SET cantidad_boletos = 1 WHERE cantidad_boletos IS NULL OR cantidad_boletos < 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'schema_stability_compat.sql ejecutado correctamente' AS status;
