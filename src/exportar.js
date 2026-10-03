// exportar.js: convierte el historial de uso diario en un archivo CSV que se abre en Excel.
//
// Se adapta al idioma elegido (ver idiomas.js). En español, para el Excel de Chile: las columnas se separan con
// punto y coma (;) y los decimales llevan coma (12,5). En inglés: comas (,) y decimales con punto (12.5).
// El archivo empieza con una marca especial (BOM) para que Excel lea bien las tildes y la "ñ".

const fs = require('fs');
const { t, locale } = require('./idiomas');

// Número según el idioma (12,5 o 12.5), con un decimal como máximo.
function numero(valor) {
  return valor.toLocaleString(locale(), { maximumFractionDigits: 1 });
}

// Arma el texto del CSV.
//   historial  → lista de { dia: '2026-10-02', uso: 8, limite: 14 } (el límite puede faltar en días antiguos)
//   limiteBase → límite diario general, que se usa en los días que no guardaron su propio límite
function construirCsv(historial, limiteBase) {
  const filas = [[t('csv.fecha'), t('csv.uso'), t('csv.limite'), t('csv.supero')]];

  const ordenado = [...historial].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  for (const entrada of ordenado) {
    const limite = typeof entrada.limite === 'number' ? entrada.limite : limiteBase;
    filas.push([
      entrada.dia,
      numero(entrada.uso),
      numero(limite),
      entrada.uso >= limite ? t('csv.si') : t('csv.no'),
    ]);
  }

  // ﻿ = marca para que Excel entienda que el archivo está en UTF-8; \r\n = fin de línea de Windows
  return '﻿' + filas.map((fila) => fila.join(t('meta.csvSeparador'))).join('\r\n') + '\r\n';
}

// Guarda el historial en el archivo indicado. Devuelve cuántos días se guardaron.
function guardarCsv(rutaDelArchivo, historial, limiteBase) {
  fs.writeFileSync(rutaDelArchivo, construirCsv(historial, limiteBase), 'utf8');
  return historial.length;
}

module.exports = { construirCsv, guardarCsv };
