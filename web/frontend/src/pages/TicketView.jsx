import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../services/api.js';
import styles from './TicketView.module.css';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function TicketView() {
  const { codigo } = useParams();
  const [boleto, setBoleto] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBoleto(null);
    if (!codigo || String(codigo).trim() === '') {
      setLoading(false);
      setError('Enlace de boleto inválido.');
      return () => {
        cancelled = true;
      };
    }
    const pathCode = encodeURIComponent(String(codigo).trim());
    (async () => {
      try {
        const data = await apiFetch(`/api/tickets/by-code/${pathCode}`);
        if (!cancelled) setBoleto(data.boleto || null);
      } catch (e) {
        if (!cancelled) setError(e.message || 'No se pudo cargar el boleto');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [codigo]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.spinner} />
        Cargando boleto…
      </div>
    );
  }

  if (error || !boleto) {
    return (
      <div className={styles.root}>
        <h1 className={styles.title}>Boleto</h1>
        <p className={styles.lead}>No encontramos datos para este código.</p>
        <div className={styles.error}>{error || 'Código inválido o boleto inexistente.'}</div>
        <p className={styles.footer}>
          <Link to="/" className={styles.link}>
            ← Volver al inicio
          </Link>
        </p>
      </div>
    );
  }

  const ev = boleto.event || {};

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Tu boleto</h1>
      <p className={styles.lead}>Datos del acceso (lectura). Presenta este código en el evento.</p>

      <div className={styles.card} role="group" aria-label="Datos del boleto">
        <div className={styles.field}>
          <p className={styles.label}>Evento</p>
          <p className={styles.value}>{ev.titulo || '—'}</p>
        </div>
        <div className={styles.field}>
          <p className={styles.label}>Fecha</p>
          <p className={styles.value}>{formatWhen(ev.fecha)}</p>
        </div>
        {ev.ubicacion ? (
          <div className={styles.field}>
            <p className={styles.label}>Ubicación</p>
            <p className={styles.value}>{ev.ubicacion}</p>
          </div>
        ) : null}
        {boleto.zonaNombre ? (
          <div className={styles.field}>
            <p className={styles.label}>Zona / tipo</p>
            <p className={styles.value}>{boleto.zonaNombre}</p>
          </div>
        ) : null}
        {boleto.seatLabel ? (
          <div className={styles.field}>
            <p className={styles.label}>Asiento</p>
            <p className={styles.value}>{boleto.seatLabel}</p>
          </div>
        ) : null}
        <div className={styles.field}>
          <p className={styles.label}>Código del boleto</p>
          <p className={`${styles.value} font-mono text-base`}>{boleto.codigo}</p>
        </div>
        <div className={styles.field}>
          <p className={styles.label}>Estado del boleto</p>
          <p className={styles.value}>{boleto.boletoEstado || '—'}</p>
        </div>
        {boleto.ordenEstado ? (
          <div className={styles.field}>
            <p className={styles.label}>Orden</p>
            <p className={styles.value}>
              #{boleto.ordenId} · {boleto.ordenEstado}
            </p>
          </div>
        ) : null}
        {ev.instruccionesCanje ? (
          <div className={styles.field}>
            <p className={styles.label}>Instrucciones</p>
            <p className={`${styles.value} font-normal text-zinc-700`}>{ev.instruccionesCanje}</p>
          </div>
        ) : null}
      </div>

      <p className={styles.footer}>
        <Link to={ev.id != null ? `/eventos/${ev.id}` : '/'} className={styles.link}>
          {ev.id != null ? '← Ver ficha del evento' : '← Volver al inicio'}
        </Link>
      </p>
    </div>
  );
}
