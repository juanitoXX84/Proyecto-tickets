function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ ok: false, error: 'La imagen supera el tamaño máximo (10 MB)' });
  }
  const status = err.status || err.statusCode || 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message || 'Error interno del servidor';
  res.status(status).json({ ok: false, error: message });
}

function notFound(req, res) {
  res.status(404).json({ ok: false, error: 'Recurso no encontrado' });
}

module.exports = { errorHandler, notFound };
