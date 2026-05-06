const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const USUARIOS_PREDEFINIDOS = [
  'Daniel', 'Georgina', 'Gonzalo', 'Gustavo',
  'Joan', 'Joaquín', 'Pablo G.', 'Pablo P.', 'Sofía'
];
const historialPath = path.join(__dirname, 'mensajes.json');

let historialMensajes = [];

if (fs.existsSync(historialPath)) {

  try {

    historialMensajes = JSON.parse(
      fs.readFileSync(historialPath, 'utf8')
    );

  } catch {

    historialMensajes = [];
  }
}
const MAX_HISTORIAL = 200;
let usuariosConectados = {};
let privados = {};

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 40);

    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/usuarios', (req, res) => {
  res.json(USUARIOS_PREDEFINIDOS);
});

app.post('/api/upload', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sin archivo' });

  res.json({
    url: `/uploads/${req.file.filename}`,
    nombre: req.file.originalname,
    tipo: req.file.mimetype,
    esImagen: req.file.mimetype.startsWith('image/'),
    tamaño: req.file.size
  });
});

io.on('connection', (socket) => {

 socket.on('unirse', (nombre) => {

  // Evitar duplicados
  const yaExiste = Object.values(usuariosConectados)
  .includes(nombre);

if (yaExiste) {

  socket.emit(
    'login_error',
    'Ese usuario ya está conectado'
  );

  return;
}

  socket.nombre = nombre;

  usuariosConectados[socket.id] = nombre;

  socket.emit('historial', historialMensajes);

  io.emit('usuarios',
    Object.values(usuariosConectados));

  const msg = mensajeSistema(
    `${nombre} se conectó`
  );

  guardar(msg);

  io.emit('mensaje', msg);
});

  // =====================
  // MENSAJE GRUPAL
  // =====================

  socket.on('mensaje', (data) => {
    if (!socket.nombre) return;

    const msg = {
      id: uid(),
      tipo: 'mensaje',
      nombre: socket.nombre,
      texto: (data.texto || '').trim().substring(0, 2000),
      archivo: data.archivo || null,
      timestamp: new Date().toISOString()
    };

    guardar(msg);

    io.emit('mensaje', msg);
  });

  // =====================
  // MENSAJE PRIVADO
  // =====================

  socket.on('mensaje_privado', (data) => {

    const destino = Object.entries(usuariosConectados)
      .find(([id, nombre]) => nombre === data.para);

    if (!destino) return;

    const [socketId] = destino;

    const msg = {
      id: uid(),
      tipo: 'privado',
      de: socket.nombre,
      para: data.para,
      texto: data.texto,
      timestamp: new Date().toISOString()
    };

    io.to(socketId).emit('mensaje_privado', msg);
    socket.emit('mensaje_privado', msg);
  });

  // =====================
  // ESCRIBIENDO
  // =====================

  socket.on('escribiendo', (para) => {

    if (para === 'todos') {
      socket.broadcast.emit('escribiendo', socket.nombre);
      return;
    }

    const destino = Object.entries(usuariosConectados)
      .find(([id, nombre]) => nombre === para);

    if (!destino) return;

    io.to(destino[0]).emit('escribiendo', socket.nombre);
  });

  socket.on('disconnect', () => {

    if (socket.nombre) {

      delete usuariosConectados[socket.id];

      io.emit('usuarios', Object.values(usuariosConectados));

      const msg = mensajeSistema(`${socket.nombre} se desconectó`);

      guardar(msg);

      io.emit('mensaje', msg);
    }
  });
});

function mensajeSistema(texto) {
  return {
    id: uid(),
    tipo: 'sistema',
    texto,
    timestamp: new Date().toISOString()
  };
}

function guardar(msg) {

  // NO guardar mensajes de sistema
  if (msg.tipo === 'sistema') return;

  historialMensajes.push(msg);

  if (historialMensajes.length > MAX_HISTORIAL) {

    historialMensajes.shift();
  }

  fs.writeFileSync(
    historialPath,
    JSON.stringify(historialMensajes, null, 2)
  );
}

function uid() {
  return Date.now().toString(36) +
    Math.random().toString(36).substr(2, 6);
}

server.listen(PORT, '0.0.0.0', () => {

  const interfaces = require('os').networkInterfaces();

  let localIP = 'TU-IP-LOCAL';

  Object.values(interfaces).flat().forEach(i => {
    if (i.family === 'IPv4' && !i.internal) {
      localIP = i.address;
    }
  });

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       CLS CHAT — SERVIDOR       ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Local:  http://localhost:${PORT}        ║`);
  console.log(`║  Red:    http://${localIP}:${PORT}   ║`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║  Compartí la URL de Red con todos    ║');
  console.log('╚══════════════════════════════════════╝\n');

});