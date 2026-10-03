// i18n.js: los textos de la pantalla del widget, en el idioma elegido.
//
// La app principal manda el diccionario completo del idioma activo (ver src/idiomas.js). Aquí se guarda y se usa de
// dos maneras:
//   - Los textos fijos del HTML llevan un atributo con la clave: data-i18n="clave" (el texto del elemento),
//     data-i18n-title="clave" (su ayuda al dejar el mouse encima) y data-i18n-aria="clave" (para lectores de pantalla).
//   - Los textos que arma el código usan t('clave', { valores }).

let textosActuales = {};
let localeActual = 'es-CL'; // para escribir números (12,5 o 12.5) y nombres de días

// Un texto en el idioma activo. Los trozos {así} se reemplazan con los valores de "valores".
// Si la clave no existe se muestra la clave, para que el error se note.
function t(clave, valores) {
  const texto = textosActuales[clave] ?? clave;
  if (!valores) return texto;
  return texto.replace(/\{(\w+)\}/g, (trozo, nombre) => (nombre in valores ? String(valores[nombre]) : trozo));
}

// ¿Existe un texto con esta clave? (Se usa para los nombres de productos, que solo se traducen si los conocemos.)
function existeTexto(clave) {
  return clave in textosActuales;
}

// Escribe en la página todos los textos fijos que llevan clave.
function aplicarTextosFijos() {
  for (const elemento of document.querySelectorAll('[data-i18n]')) {
    elemento.textContent = t(elemento.dataset.i18n);
  }
  for (const elemento of document.querySelectorAll('[data-i18n-title]')) {
    elemento.title = t(elemento.dataset.i18nTitle);
  }
  for (const elemento of document.querySelectorAll('[data-i18n-aria]')) {
    elemento.setAttribute('aria-label', t(elemento.dataset.i18nAria));
  }
  document.title = t('app.nombre');
}

// Recibe el idioma de la app principal ({ idioma, locale, textos }) y lo aplica a los textos fijos.
function definirIdioma(datos) {
  textosActuales = datos.textos;
  localeActual = datos.locale;
  document.documentElement.lang = datos.idioma;
  aplicarTextosFijos();
}
