// copia.js: la copia de seguridad. Guarda en un archivo todo lo que la app recuerda (ajustes, cuentas, límites e historial)
// y lo vuelve a leer, para pasar a otro computador o reinstalar Windows sin perder nada.
//
// IMPORTANTE: la copia no lleva contraseñas ni sesiones (la app nunca las guarda en sus datos): después de restaurar
// en otro computador hay que volver a entrar a cada cuenta.
//
// Este archivo no muestra cuadros ni toca la app: recibe datos y devuelve resultados (así se puede probar).

const { VALORES_INICIALES, CAMPOS_DE_CUENTA, MAXIMO_DE_CUENTAS } = require('./almacen');

const MARCA = 'headroom-copia';
const FORMATO = 1;
const TAMANO_MAXIMO = 20 * 1024 * 1024; // un archivo más grande que esto no es una copia de Headroom

// Arma el contenido del archivo de copia.
function crear(datos, version, ahora = new Date()) {
  return JSON.stringify({ app: MARCA, formato: FORMATO, version, fecha: ahora.toISOString(), datos }, null, 2);
}

// ¿Ese valor es del mismo tipo que el valor de siempre? (lo que por defecto es null puede ser cualquier cosa)
function mismoTipo(valor, porDefecto) {
  if (porDefecto === null) return true;
  if (Array.isArray(porDefecto)) return Array.isArray(valor);
  if (typeof porDefecto === 'object') return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
  return typeof valor === typeof porDefecto;
}

// Deja pasar solo lo que la app conoce y con el tipo correcto (nunca hay que fiarse de un archivo).
function limpiar(datos) {
  const limpio = {};
  for (const [clave, porDefecto] of Object.entries(VALORES_INICIALES)) {
    if (clave === 'cuentas' || !(clave in datos)) continue;
    if (mismoTipo(datos[clave], porDefecto)) limpio[clave] = datos[clave];
  }
  const vistas = new Set();
  limpio.cuentas = (Array.isArray(datos.cuentas) ? datos.cuentas : [])
    .filter((c) => c && typeof c === 'object' && /^c\d{1,3}$/.test(c.id) && !vistas.has(c.id) && vistas.add(c.id))
    .slice(0, MAXIMO_DE_CUENTAS)
    .map((c) => {
      // Cada cuenta usa siempre el mismo espacio de sesión, según su id
      const cuenta = { id: c.id, nombre: typeof c.nombre === 'string' ? c.nombre.slice(0, 20) : '', particion: c.id === 'c1' ? 'persist:claude' : `persist:claude-${c.id}` };
      if (c.ventana && typeof c.ventana === 'object') cuenta.ventana = c.ventana;
      for (const [campo, porDefecto] of Object.entries(CAMPOS_DE_CUENTA)) {
        if (campo in c && mismoTipo(c[campo], porDefecto)) cuenta[campo] = c[campo];
      }
      return cuenta;
    });
  return limpio;
}

// Lee el texto de un archivo de copia. Devuelve { ok: true, datos, fecha, version } o { ok: false }.
function leer(texto) {
  if (typeof texto !== 'string' || texto.length > TAMANO_MAXIMO) return { ok: false };
  let archivo;
  try {
    archivo = JSON.parse(texto.replace(/^﻿/, ''));
  } catch (error) {
    return { ok: false };
  }
  if (!archivo || archivo.app !== MARCA || !archivo.datos || typeof archivo.datos !== 'object') return { ok: false };
  const datos = limpiar(archivo.datos);
  if (datos.cuentas.length === 0) return { ok: false };
  return { ok: true, datos, fecha: typeof archivo.fecha === 'string' ? archivo.fecha : null, version: typeof archivo.version === 'string' ? archivo.version : null };
}

module.exports = { crear, leer, TAMANO_MAXIMO };
