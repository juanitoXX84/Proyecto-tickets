-- Rol `pruebas`: misma app que comprador (`usuario`), con extras de servidor (pago demo sin cargo).
-- Si `usuarios.rol` es VARCHAR, no necesitas este archivo.
-- Si es ENUM, amplía la lista para poder guardar 'pruebas' (ajusta DEFAULT si tu instalación difiere).

SET NAMES utf8mb4;

ALTER TABLE `usuarios`
  MODIFY COLUMN `rol` ENUM('admin','organizador','usuario','pruebas') NOT NULL DEFAULT 'usuario';
