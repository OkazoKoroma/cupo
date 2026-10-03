// rutas.js: encuentra dónde están los archivos de la carpeta "assets" (imágenes e íconos).
//
// Cuando la app corre desde la carpeta del proyecto, están en ../assets.
// Cuando está instalada (empaquetada), electron-builder los deja en la carpeta "resources" de la app.
// Las notificaciones de Windows necesitan un archivo real (no uno guardado dentro del paquete),
// por eso en la versión instalada los assets se copian aparte (ver "extraResources" en package.json).

const path = require('path');
const { app } = require('electron');

function rutaDeAsset(nombre) {
  const carpeta = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', 'assets');
  return path.join(carpeta, nombre);
}

module.exports = { rutaDeAsset };
