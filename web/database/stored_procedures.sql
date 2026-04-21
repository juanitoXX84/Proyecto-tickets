-- =============================================================================
-- Ticket Rivals — procedimientos almacenados OPCIONALES (MySQL / MariaDB)
-- =============================================================================
-- Ejecuta DESPUÉS de tu dump principal y de schema_updates.sql (columna ordenes.idevento).
--
-- IMPORTANTE: Los nombres de columnas (total, fecha_creacion, codigo, etc.) son
-- convención típica académica. Si tu ticket_rivals.sql usa otros nombres, cámbialos
-- aquí antes de ejecutar (o crea las columnas faltantes con ALTER TABLE).
--
-- Delimiter en phpMyAdmin: a veces basta pegar bloque a bloque; en cliente CLI usa DELIMITER.
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_disponibilidad_evento;
DROP PROCEDURE IF EXISTS sp_listar_compras_usuario;
DROP PROCEDURE IF EXISTS sp_listar_boletos_usuario;
DROP PROCEDURE IF EXISTS sp_confirmar_pago_y_emitir_boletos;

DELIMITER $$

-- Devuelve filas: capacidad, boletosvendidos, disponibles (según eventos.boletosvendidos)
CREATE PROCEDURE sp_disponibilidad_evento(IN p_idevento INT)
BEGIN
  SELECT
    e.id AS idevento,
    e.capacidad,
    COALESCE(e.boletosvendidos, 0) AS boletosvendidos,
    GREATEST(0, e.capacidad - COALESCE(e.boletosvendidos, 0)) AS disponibles
  FROM eventos e
  WHERE e.id = p_idevento AND e.activo = 1;
END$$

-- Historial de órdenes de un usuario (para "Mis compras" cuando exista la API)
-- Ajusta: o.total / o.fecha_creacion / o.estado si tus columnas se llaman distinto.
CREATE PROCEDURE sp_listar_compras_usuario(IN p_idusuario INT)
BEGIN
  SELECT
    o.id AS idorden,
    o.idevento,
    e.titulo AS evento_titulo,
    e.fecha AS evento_fecha,
    o.total,
    o.estado,
    o.fecha_creacion
  FROM ordenes o
  LEFT JOIN eventos e ON e.id = o.idevento
  WHERE o.idusuario = p_idusuario
  ORDER BY o.id DESC;
END$$

-- Boletos de un usuario (alineado con GET /api/user/purchases → boletos)
CREATE PROCEDURE sp_listar_boletos_usuario(IN p_idusuario INT)
BEGIN
  SELECT
    b.id AS idboleto,
    b.idorden,
    b.idevento,
    b.estado,
    b.codigo,
    e.titulo AS evento_titulo,
    e.fecha AS evento_fecha
  FROM boletos b
  LEFT JOIN eventos e ON e.id = b.idevento
  WHERE b.idusuario = p_idusuario
  ORDER BY b.id DESC;
END$$

-- Transacción de ejemplo: pago aprobado → boletos en estado pagado/activo → actualiza vendidos
-- Parámetros:
--   p_idorden     : orden ya creada (con idevento e idusuario coherentes)
--   p_monto       : monto del pago (debe coincidir con negocio; aquí solo se registra)
--   p_cantidad    : cuántos boletos emitir (debe coincidir con lo reservado/vendido en tu flujo)
--
-- Tablas mínimas asumidas (adapta nombres):
--   pagos (idorden, monto, estado, ...)
--   boletos (idorden, idusuario, idevento, estado, codigo opcional)
--   ordenes (id, idusuario, idevento, total, estado, ...)
--   eventos (id, boletosvendidos, capacidad, activo)
CREATE PROCEDURE sp_confirmar_pago_y_emitir_boletos(
  IN p_idorden INT,
  IN p_monto DECIMAL(12,2),
  IN p_cantidad INT
)
BEGIN
  DECLARE v_idevento INT;
  DECLARE v_idusuario INT;
  DECLARE v_cap INT;
  DECLARE v_vend INT;
  DECLARE v_disp INT;
  DECLARE i INT DEFAULT 0;

  IF p_cantidad IS NULL OR p_cantidad < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cantidad inválida';
  END IF;

  START TRANSACTION;

  SELECT o.idevento, o.idusuario
    INTO v_idevento, v_idusuario
  FROM ordenes o
  WHERE o.id = p_idorden
  FOR UPDATE;

  IF v_idevento IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'orden no encontrada';
  END IF;

  SELECT e.capacidad, COALESCE(e.boletosvendidos, 0)
    INTO v_cap, v_vend
  FROM eventos e
  WHERE e.id = v_idevento AND e.activo = 1
  FOR UPDATE;

  IF v_cap IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'evento no disponible';
  END IF;

  SET v_disp = v_cap - v_vend;
  IF v_disp < p_cantidad THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sin cupo suficiente';
  END IF;

  -- Registro de pago (ajusta columnas extra si las tienes: idtransaccion_mp, etc.)
  INSERT INTO pagos (idorden, monto, estado)
  VALUES (p_idorden, p_monto, 'aprobado');

  -- Emite boletos (codigo único simple; sustituye por UUID en app si prefieres)
  WHILE i < p_cantidad DO
    INSERT INTO boletos (idorden, idusuario, idevento, estado, codigo)
    VALUES (
      p_idorden,
      v_idusuario,
      v_idevento,
      'pagado',
      CONCAT('TR-', p_idorden, '-', i + 1, '-', UNIX_TIMESTAMP())
    );
    SET i = i + 1;
  END WHILE;

  UPDATE eventos
  SET boletosvendidos = COALESCE(boletosvendidos, 0) + p_cantidad
  WHERE id = v_idevento;

  UPDATE ordenes
  SET estado = 'pagada'
  WHERE id = p_idorden;

  COMMIT;
END$$

DELIMITER ;

-- =============================================================================
-- Si al ejecutar ves errores ER_BAD_FIELD_ERROR, revisa en tu esquema:
--   ordenes:  total, estado, fecha_creacion, idevento, idusuario
--   pagos:    idorden, monto, estado
--   boletos:  idorden, idusuario, idevento, estado, codigo
-- y crea o renombra columnas para que coincidan, o edita este archivo.
-- =============================================================================
