/** Cupo libre en una fila de `evento_zonas` (API pública). */
export function disponiblesEnZona(z) {
  const cap = Number(z?.capacidad);
  const vend = Number(z?.boletos_vendidos ?? 0);
  if (!Number.isFinite(cap) || cap < 0) return 0;
  return Math.max(0, Math.floor(cap - vend));
}

/** Agregado del evento cuando no hay zonas en la respuesta (listados o legado). */
export function disponiblesEventoAgregado(evento) {
  const cap = Number(evento?.capacidad);
  const vend = Number(evento?.boletosvendidos ?? 0);
  if (!Number.isFinite(cap) || cap < 0) return 0;
  return Math.max(0, Math.floor(cap - vend));
}

export function totalDisponiblesZonas(zonas) {
  if (!Array.isArray(zonas) || zonas.length === 0) return 0;
  return zonas.reduce((sum, z) => sum + disponiblesEnZona(z), 0);
}

/** Listado home: si el API envía `zonas`, suma por zona; si no, usa capacidad global. */
export function disponiblesParaListado(ev) {
  const zonas = ev?.zonas;
  if (Array.isArray(zonas) && zonas.length > 0) {
    return totalDisponiblesZonas(zonas);
  }
  return disponiblesEventoAgregado(ev);
}

export function eventoSinCupoListado(ev) {
  return disponiblesParaListado(ev) <= 0;
}
