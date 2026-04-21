const fs = require('fs');
const path = require('path');
const multer = require('multer');

const destDir = path.join(__dirname, '../../../uploads/event-images');
fs.mkdirSync(destDir, { recursive: true });

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Extensión solo según MIME declarado (no según el nombre del archivo del cliente). */
const mimeToExt = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, destDir),
  filename: (_req, file, cb) => {
    const ext = mimeToExt[file.mimetype] || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (allowed.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  const err = new Error('Solo se permiten imágenes JPEG, PNG, WebP o GIF');
  err.status = 400;
  cb(err);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = { uploadEventImage: upload.single('imagen') };
