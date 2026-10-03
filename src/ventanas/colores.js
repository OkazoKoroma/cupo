// colores.js: funciones que comparten las pantallas del widget,
// para que los colores y el formato de números sean siempre los mismos.

const VERDE = '#3fbf72';
const AMARILLO = '#f2b84b';
const ROJO = '#ec5a5f';

// Número según el idioma: coma para los decimales en español (12,5) y punto en inglés (12.5);
// sin decimales si es entero (9). "localeActual" viene de i18n.js.
function formatear(numero) {
  return numero.toLocaleString(localeActual, { maximumFractionDigits: 1 });
}

// Colores de las barras de Semana y Sesión de 5 horas (según qué tan llenas están, de 0 a 1):
// verde bajo el 70%, amarillo entre 70% y 90%, rojo sobre el 90%.
function colorSemanal(proporcion) {
  if (proporcion < 0.7) return VERDE;
  if (proporcion <= 0.9) return AMARILLO;
  return ROJO;
}

// Colores de la barra de Hoy (proporción del límite diario, de 0 a 1 o más):
// verde bajo el 70% del límite, amarillo entre 70% y 100%, rojo al llegar al límite o pasarlo
// (igual que la alerta "Llegaste a tu límite", que sale al alcanzarlo).
function colorDiario(proporcion) {
  if (proporcion < 0.7) return VERDE;
  if (proporcion < 1) return AMARILLO;
  return ROJO;
}
