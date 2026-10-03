// actualizaciones.js: revisa en GitHub si hay una versión nueva de Headroom y la instala con un clic.
//
// Pregunta a la página pública del proyecto cuál es la última versión publicada (sin enviar ningún dato tuyo)
// y la compara con la instalada. Con la app instalada, "Actualizar" la descarga, cierra la app, la instala y la vuelve
// a abrir (con electron-updater; tus datos no se tocan). Si eso no se puede, se abre la página de descarga.

const { app, net, shell } = require('electron');

// El repositorio en GitHub (todavía con el nombre anterior de la app). Si se renombra a 'headroom', GitHub redirige
// las consultas al nombre nuevo, así que esto sigue funcionando; por eso se aceptan enlaces con los dos nombres.
const REPOSITORIO = 'OkazoKoroma/cupo';
const PAGINAS_VALIDAS = ['https://github.com/OkazoKoroma/cupo/', 'https://github.com/OkazoKoroma/headroom/'];
const DIRECCION = `https://api.github.com/repos/${REPOSITORIO}/releases/latest`;
const PAGINA_DEL_PROYECTO = `https://github.com/${REPOSITORIO}/`;

// Compara dos versiones "1.2.3". Devuelve un número positivo si "a" es más nueva que "b", negativo si es más vieja, y 0 si son iguales.
function compararVersiones(a, b) {
  const partesA = String(a).split('.').map(Number);
  const partesB = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diferencia = (partesA[i] || 0) - (partesB[i] || 0);
    if (diferencia !== 0) return diferencia;
  }
  return 0;
}

// Pregunta por la última versión publicada. Devuelve { version, url } o null si no se pudo saber (sin internet, etc.).
async function ultimaVersion() {
  try {
    const respuesta = await net.fetch(DIRECCION, {
      headers: { 'User-Agent': 'Headroom', Accept: 'application/vnd.github+json' },
    });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const version = String(datos.tag_name || '').replace(/^v/, '');
    const url = String(datos.html_url || '');
    // Solo se acepta una versión con forma "1.2.3" y un enlace a la página del proyecto (nunca a otro sitio).
    if (!/^\d+\.\d+\.\d+$/.test(version) || !PAGINAS_VALIDAS.some((pagina) => url.startsWith(pagina))) return null;
    return { version, url };
  } catch (error) {
    return null;
  }
}

// ----- Actualizar con un clic -----

// Lo que el menú necesita saber: la versión nueva (o null), si se está descargando y cuánto lleva (%).
const estado = { versionNueva: null, descargando: false, progreso: 0 };
let alCambiar = () => {};
let actualizador = null;

// La app pasa aquí la función que vuelve a armar el menú cuando cambia el estado.
function alCambiarElEstado(funcion) {
  alCambiar = funcion;
}

function prepararActualizador() {
  if (!app.isPackaged || actualizador) return actualizador; // sin instalar (desarrollo) no hay actualizador
  try {
    actualizador = require('electron-updater').autoUpdater;
  } catch (error) {
    console.error('No se pudo cargar el actualizador:', error.message);
    return null;
  }
  actualizador.autoDownload = false; // solo se descarga cuando tú lo pides
  actualizador.autoInstallOnAppQuit = false;
  actualizador.logger = null;
  actualizador.on('download-progress', (avance) => {
    estado.progreso = Math.round(avance.percent || 0);
    alCambiar();
  });
  // Descargada: se instala en silencio y la app se vuelve a abrir.
  actualizador.on('update-downloaded', () => setImmediate(() => actualizador.quitAndInstall(true, true)));
  actualizador.on('error', (error) => {
    console.error('Falló la actualización:', error && error.message);
    if (!estado.descargando) return;
    estado.descargando = false;
    alCambiar();
    if (estado.versionNueva) shell.openExternal(estado.versionNueva.url); // plan B: la página de descarga
  });
  return actualizador;
}

// Busca una versión más nueva que "instalada". Devuelve { version, url, conActualizador } o null.
// "conActualizador": se puede instalar con un clic (el actualizador encontró esa versión y su archivo latest.yml).
async function buscarVersionNueva(instalada) {
  const ultima = await ultimaVersion();
  if (!ultima || compararVersiones(ultima.version, instalada) <= 0) return null;
  let conActualizador = false;
  const instalador = prepararActualizador();
  if (instalador) {
    try {
      const resultado = await instalador.checkForUpdates();
      conActualizador = Boolean(resultado && resultado.updateInfo && resultado.updateInfo.version === ultima.version);
    } catch (error) {
      conActualizador = false;
    }
  }
  estado.versionNueva = { ...ultima, conActualizador };
  alCambiar();
  return estado.versionNueva;
}

// "Actualizar": descarga e instala (o, si no se puede con un clic, abre la página de descarga).
function actualizarAhora() {
  const nueva = estado.versionNueva;
  if (!nueva || estado.descargando) return;
  const instalador = prepararActualizador();
  if (!instalador || !nueva.conActualizador) {
    shell.openExternal(nueva.url);
    return;
  }
  estado.descargando = true;
  estado.progreso = 0;
  alCambiar();
  instalador.downloadUpdate().catch(() => { /* lo maneja el evento "error" */ });
}

module.exports = { ultimaVersion, compararVersiones, PAGINA_DEL_PROYECTO, estado, alCambiarElEstado, buscarVersionNueva, actualizarAhora };
