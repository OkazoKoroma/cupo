// actualizaciones.js: revisa en GitHub si hay una versión nueva de Cupo.
//
// Pregunta a la página pública del proyecto cuál es la última versión publicada (sin enviar ningún dato tuyo)
// y la compara con la instalada. Si hay una más nueva, la app te avisa con un enlace para descargarla.

const { net } = require('electron');

const REPOSITORIO = 'OkazoKoroma/cupo';
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
      headers: { 'User-Agent': 'Cupo', Accept: 'application/vnd.github+json' },
    });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const version = String(datos.tag_name || '').replace(/^v/, '');
    const url = String(datos.html_url || '');
    // Solo se acepta una versión con forma "1.2.3" y un enlace a la página del proyecto (nunca a otro sitio).
    if (!/^\d+\.\d+\.\d+$/.test(version) || !url.startsWith(PAGINA_DEL_PROYECTO)) return null;
    return { version, url };
  } catch (error) {
    return null;
  }
}

module.exports = { ultimaVersion, compararVersiones, PAGINA_DEL_PROYECTO };
