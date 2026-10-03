// sesion.js: maneja el inicio de sesión en claude.ai, de una o de varias cuentas.
//
// Cómo funciona:
// - Se abre una ventana con la página normal de claude.ai. Tú entras como siempre.
// - Electron guarda la sesión en una "partición persistente": un espacio propio de la app
//   que Windows conserva entre usos. Así no tienes que entrar cada vez que abres el widget.
// - Cada cuenta tiene su PROPIA partición, así sus sesiones nunca se mezclan.
// - Esta app NUNCA lee ni guarda tu contraseña, ni copia cookies o tokens a archivos.
//   Solo pregunta "¿existe la cookie de sesión?" (sí/no); no mira su contenido.
//
// Estados posibles de cada cuenta:
//   'sin-sesion' → nunca se ha entrado (o se cerró la sesión)
//   'conectado'  → hay sesión activa
//   'expirada'   → había sesión y desapareció (venció o claude.ai la cerró)

const { BrowserWindow, session } = require('electron');
const almacen = require('./almacen');

const URL_LOGIN = 'https://claude.ai/login';
const NOMBRE_COOKIE = 'sessionKey'; // cookie con la que claude.ai marca una sesión iniciada

// Una entrada por cuenta: { particion, estado, ventanaLogin, alEscuchar }
const cuentas = new Map();
let avisarCambio = () => {}; // función que se llama cuando el estado de una cuenta cambia: (id, estado)

// La "sesión" de Electron de una cuenta (aquí viven las cookies de claude.ai de esa cuenta).
function obtenerSesion(id) {
  return session.fromPartition(cuentas.get(id).particion);
}

// Pregunta si existe la cookie de sesión. Solo devuelve sí/no.
async function haySesion(id) {
  const cookies = await obtenerSesion(id).cookies.get({
    url: 'https://claude.ai',
    name: NOMBRE_COOKIE,
  });
  return cookies.length > 0;
}

// Cambia el estado y avisa al resto de la app, solo si realmente cambió.
function cambiarEstado(id, nuevo) {
  const cuenta = cuentas.get(id);
  if (!cuenta || nuevo === cuenta.estado) return;
  cuenta.estado = nuevo;
  avisarCambio(id, nuevo);
}

// Se llama cada vez que cambia una cookie de claude.ai de esa cuenta.
// Así nos enteramos al instante de que entraste, o de que la sesión venció.
function alCambiarCookie(id, cookie, causa, eliminada) {
  if (cookie.name !== NOMBRE_COOKIE || !cookie.domain.includes('claude.ai')) return;
  const cuenta = cuentas.get(id);
  if (!cuenta) return;

  if (!eliminada) {
    // Se creó la cookie de sesión: el inicio de sesión funcionó.
    almacen.guardarCuenta(id, { habiaSesion: true });
    cambiarEstado(id, 'conectado');
    if (cuenta.ventanaLogin && !cuenta.ventanaLogin.isDestroyed()) cuenta.ventanaLogin.close();
    return;
  }

  // Cuando una cookie se reemplaza por otra nueva, Electron avisa de una "eliminación"
  // con causa 'overwrite'. Eso no es un cierre de sesión, así que se ignora.
  if (causa === 'overwrite') return;

  if (causa === 'expired' || causa === 'expired-overwrite' || causa === 'evicted') {
    cambiarEstado(id, 'expirada');
  } else {
    // Cierre de sesión (desde el widget o desde la página de claude.ai).
    almacen.guardarCuenta(id, { habiaSesion: false });
    cambiarEstado(id, 'sin-sesion');
  }
}

// Empieza a manejar la sesión de una cuenta: revisa si ya hay sesión guardada de otras veces y escucha los cambios.
// Devuelve el estado en que queda. En el modo de prueba ("simulada") la cuenta se da por conectada sin mirar cookies.
async function registrar(cuenta, simulada = false) {
  const entrada = { particion: cuenta.particion, estado: 'sin-sesion', ventanaLogin: null, alEscuchar: null };
  cuentas.set(cuenta.id, entrada);
  entrada.alEscuchar = (evento, cookie, causa, eliminada) => alCambiarCookie(cuenta.id, cookie, causa, eliminada);
  obtenerSesion(cuenta.id).cookies.on('changed', entrada.alEscuchar);

  if (simulada || await haySesion(cuenta.id)) {
    entrada.estado = 'conectado';
  } else if (cuenta.habiaSesion) {
    // Antes había sesión y ya no está: venció mientras la app estaba cerrada.
    entrada.estado = 'expirada';
  }
  return entrada.estado;
}

// Arranque: registra todas las cuentas guardadas.
// "alCambiar" es la función que recibirá (id, nuevoEstado) cada vez que el estado de una cuenta cambie.
async function iniciar(listaDeCuentas, alCambiar, simulada = false) {
  avisarCambio = alCambiar;
  for (const cuenta of listaDeCuentas) await registrar(cuenta, simulada);
}

function estadoDe(id) {
  const cuenta = cuentas.get(id);
  return cuenta ? cuenta.estado : 'sin-sesion';
}

// Se usa cuando claude.ai rechaza la sesión aunque la cookie siga ahí (por ejemplo, venció en el servidor).
function marcarExpirada(id) {
  if (estadoDe(id) !== 'conectado') return;
  almacen.guardarCuenta(id, { habiaSesion: true });
  cambiarEstado(id, 'expirada');
}

// Abre la ventana con la página de inicio de sesión de claude.ai, para esa cuenta.
function abrirLogin(id, titulo) {
  const cuenta = cuentas.get(id);
  if (!cuenta) return;

  // Si ya está abierta, solo la traemos al frente.
  if (cuenta.ventanaLogin && !cuenta.ventanaLogin.isDestroyed()) {
    cuenta.ventanaLogin.focus();
    return;
  }

  const ventanaLogin = new BrowserWindow({
    width: 520,
    height: 760,
    title: titulo,
    autoHideMenuBar: true,
    webPreferences: {
      partition: cuenta.particion, // usa el espacio donde se guarda la sesión de esta cuenta
      nodeIntegration: false,      // la página web NO puede tocar tu computador
      contextIsolation: true,
      sandbox: true,
    },
  });
  cuenta.ventanaLogin = ventanaLogin;
  ventanaLogin.setMenuBarVisibility(false);

  // Algunos métodos de entrada (como Google) abren una ventana emergente.
  // Permitimos solo direcciones seguras (https).
  ventanaLogin.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://')) return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
  });

  ventanaLogin.on('closed', () => {
    if (cuenta.ventanaLogin === ventanaLogin) cuenta.ventanaLogin = null;
  });

  ventanaLogin.loadURL(URL_LOGIN);
}

// Cierra la sesión de una cuenta: borra lo guardado en su espacio de claude.ai y vuelve a "sin sesión".
// (Sus límites y su historial se conservan; así puedes entrar con otra cuenta de Claude en el mismo lugar.)
async function cerrarSesion(id) {
  if (!cuentas.has(id)) return;
  almacen.guardarCuenta(id, { habiaSesion: false });
  await obtenerSesion(id).clearStorageData();
  cambiarEstado(id, 'sin-sesion');
}

// Deja de manejar una cuenta que se elimina: borra su sesión y cierra su ventana de inicio de sesión.
async function olvidar(id) {
  const cuenta = cuentas.get(id);
  if (!cuenta) return;
  if (cuenta.ventanaLogin && !cuenta.ventanaLogin.isDestroyed()) cuenta.ventanaLogin.destroy();
  const sesionDeElectron = obtenerSesion(id);
  sesionDeElectron.cookies.removeListener('changed', cuenta.alEscuchar);
  cuentas.delete(id);
  await sesionDeElectron.clearStorageData();
}

module.exports = { registrar, iniciar, estadoDe, marcarExpirada, abrirLogin, cerrarSesion, olvidar };
