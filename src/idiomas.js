// idiomas.js: el idioma de la app y sus textos.
//
// Los textos de cada idioma están en la carpeta "idiomas" (es.js, en.js, pt.js, fr.js, de.js). Aquí se elige el idioma activo y se
// entrega cada texto con t('clave', { valores }). Si a un idioma le falta un texto, se usa el del español
// (y si tampoco existe, se muestra la clave, para que el error se note).
//
// Para agregar un idioma: crear su archivo en "idiomas" (copiando es.js) y anotarlo en IDIOMAS aquí abajo.

const { app } = require('electron');

const IDIOMAS = {
  es: require('./idiomas/es'),
  en: require('./idiomas/en'),
  pt: require('./idiomas/pt'),
  fr: require('./idiomas/fr'),
  de: require('./idiomas/de'),
};

// Los valores que se pueden elegir en Ajustes: cada idioma disponible, o "auto" (el idioma de Windows).
const OPCIONES_IDIOMA = [...Object.keys(IDIOMAS), 'auto'];

let idiomaActual = 'es';

// Convierte lo elegido en Ajustes en un idioma disponible. "auto" mira el idioma de Windows
// (si no es uno de los disponibles, se usa inglés).
function resolver(elegido) {
  if (elegido === 'auto') {
    const deWindows = String(app.getLocale() || '').slice(0, 2).toLowerCase();
    return IDIOMAS[deWindows] ? deWindows : 'en';
  }
  return IDIOMAS[elegido] ? elegido : 'es';
}

function fijar(elegido) {
  idiomaActual = resolver(elegido);
}

function idioma() {
  return idiomaActual;
}

// Un texto en el idioma activo. Los trozos {así} se reemplazan con los valores de "valores".
function t(clave, valores) {
  const texto = IDIOMAS[idiomaActual][clave] ?? IDIOMAS.es[clave] ?? clave;
  if (!valores) return texto;
  return texto.replace(/\{(\w+)\}/g, (trozo, nombre) => (nombre in valores ? String(valores[nombre]) : trozo));
}

// El diccionario completo del idioma activo (con el español de respaldo). Se manda a las pantallas del widget.
function textos() {
  return { ...IDIOMAS.es, ...IDIOMAS[idiomaActual] };
}

// Para escribir números y fechas: "es-CL" (12,5) o "en-US" (12.5).
function locale() {
  return t('meta.locale');
}

module.exports = { IDIOMAS, OPCIONES_IDIOMA, fijar, idioma, resolver, t, textos, locale };
