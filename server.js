const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const USUARIOS_PREDEFINIDOS = [
  'Georgina',
  'Sofia',
	'Pablo P.',
'Pablo G.',
'Joaquín',
'Gonzalo',
'Gustavo',
'Joan',
'Daniel',
];

const DATA_PATH = path.join(__dirname, 'mensajes.json');

let conversaciones = {
  todos: []
};

let usuariosConectados = {};
let ultimaActividad = {};

if (fs.existsSync(DATA_PATH)) {
  try {
    conversaciones = JSON.parse(
      fs.readFileSync(DATA_PATH, 'utf8')
    );
  } catch {
    conversaciones = { todos: [] };
  }
}

function saveData() {
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(conversaciones, null, 2)
  );
}

function uid() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2);
}

function getConversationId(a, b) {
  return [a, b].sort().join('__');
}

const uploadsDir = path.join(
  __dirname,
  'public',
  'uploads'
);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },

  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + '-' + file.originalname
    );
  }
});

const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/usuarios', (req, res) => {
  res.json(USUARIOS_PREDEFINIDOS);
});

app.post(
  '/api/upload',
  upload.single('archivo'),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: 'Sin archivo'
      });
    }

    res.json({
      url: `/uploads/${req.file.filename}`,
      nombre: req.file.originalname,
      tipo: req.file.mimetype
    });
  }
);

io.on('connection', (socket) => {

  socket.on('unirse', (nombre) => {

    const yaExiste = Object.values(
      usuariosConectados
    ).includes(nombre);

    if (yaExiste) {
      socket.emit(
        'login_error',
        'Ese usuario ya está conectado'
      );
      return;
    }

    socket.nombre = nombre;

    usuariosConectados[socket.id] = nombre;

    ultimaActividad[nombre] =
      new Date().toISOString();

    socket.emit(
      'historial',
      conversaciones.todos || []
    );

    socket.emit(
      'conversaciones',
      conversaciones
    );

    io.emit(
      'usuarios',
      Object.values(usuariosConectados)
    );

    io.emit(
      'actividad',
      ultimaActividad
    );
  });

  socket.on('mensaje', ({ texto }) => {

    if (!texto?.trim()) return;

    const msg = {
      id: uid(),
      tipo: 'mensaje',
      nombre: socket.nombre,
      texto,
      timestamp: new Date().toISOString()
    };

    conversaciones.todos.push(msg);

    saveData();

    io.emit('mensaje', msg);
  });

  socket.on(
    'mensaje_privado',
    ({ para, texto }) => {

      if (!texto?.trim()) return;

      const convId = getConversationId(
        socket.nombre,
        para
      );

      if (!conversaciones[convId]) {
        conversaciones[convId] = [];
      }

      const msg = {
        id: uid(),
        tipo: 'privado',
        de: socket.nombre,
        para,
        texto,
        timestamp: new Date().toISOString(),
        eliminado: false
      };

      conversaciones[convId].push(msg);

      saveData();

      const destino = Object.entries(
        usuariosConectados
      ).find(([id, n]) => n === para);

      if (destino) {
        io.to(destino[0])
          .emit('mensaje_privado', msg);
      }

      socket.emit('mensaje_privado', msg);
    }
  );

  socket.on(
    'eliminar_mensaje',
    ({ conversacion, id }) => {

      if (!conversaciones[conversacion]) return;

      conversaciones[conversacion] =
        conversaciones[conversacion].map(m => {

          if (m.id === id) {
            return {
              ...m,
              texto: 'Mensaje eliminado',
              eliminado: true
            };
          }

          return m;
        });

      saveData();

      io.emit(
        'mensaje_eliminado',
        { conversacion, id }
      );
    }
  );

  socket.on('escribiendo', () => {

    socket.broadcast.emit(
      'escribiendo',
      socket.nombre
    );
  });

  socket.on('disconnect', () => {

    if (!socket.nombre) return;

    ultimaActividad[socket.nombre] =
      new Date().toISOString();

    delete usuariosConectados[socket.id];

    io.emit(
      'usuarios',
      Object.values(usuariosConectados)
    );

    io.emit(
      'actividad',
      ultimaActividad
    );
  });
});

server.listen(PORT, () => {
  console.log(`Servidor iniciado ${PORT}`);
});