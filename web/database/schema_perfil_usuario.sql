-- Ejecutar una vez después del dump principal.
-- Si MySQL indica columna duplicada, la tabla ya está actualizada.

-- DEFAULT 1: usuarios ya existentes al migrar quedan “listos”.
-- Registro nuevo con Google: el backend inserta perfil_completado = 0 explícitamente.
ALTER TABLE `usuarios`
  ADD COLUMN `perfil_completado` tinyint(1) NOT NULL DEFAULT 1
    COMMENT '0 = falta completar datos tras Google; 1 = listo'
    AFTER `pais`;
