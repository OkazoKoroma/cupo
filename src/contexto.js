// contexto.js: cuánto de su ventana de contexto lleva el chat de Claude Code en el que estás trabajando.
// Claude Code guarda cada chat en un archivo en tu computador (~/.claude/projects/<proyecto>/<chat>.jsonl),
// con una línea por mensaje. Cada respuesta de Claude anota cuántos tokens tenía la conversación: con el último
// de esos números se sabe cuánto contexto lleva el chat. No usa internet ni gasta cuota.
// Ese formato no es oficial: si Claude Code lo cambia, esto deja de mostrarse (no rompe nada más).
// Sin Electron: se puede probar con node.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Se muestran los chats que cambiaron hace menos de esto.
const MAXIMO_INACTIVO_MS = 3 * 60 * 60 * 1000;
// Cuántos chats se muestran como máximo.
const MAXIMO_DE_CHATS = 5;
// Cuánto del final del archivo se lee (los archivos pueden pesar decenas de MB). Si ahí no hay ninguna respuesta, se lee más.
const TROZOS_A_LEER = [2 * 1024 * 1024, 16 * 1024 * 1024];

const TAMANO_NORMAL = 200000;
const TAMANO_GRANDE = 1000000;

// La carpeta donde Claude Code guarda los chats (respeta CLAUDE_CONFIG_DIR si alguien la cambió).
function carpetaDeChats() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

// Los archivos de los chats usados hace poco, del más reciente al más antiguo: [{ archivo, modificado }, ...].
function chatsRecientes(carpeta = carpetaDeChats(), ahora = Date.now(), maximo = MAXIMO_DE_CHATS) {
  const lista = [];
  let proyectos;
  try {
    proyectos = fs.readdirSync(carpeta, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch (error) {
    return []; // no hay Claude Code en este computador
  }
  for (const proyecto of proyectos) {
    const dir = path.join(carpeta, proyecto.name);
    let archivos;
    try {
      archivos = fs.readdirSync(dir).filter((nombre) => nombre.endsWith('.jsonl'));
    } catch (error) {
      continue;
    }
    for (const nombre of archivos) {
      try {
        const archivo = path.join(dir, nombre);
        const modificado = fs.statSync(archivo).mtimeMs;
        if (ahora - modificado <= MAXIMO_INACTIVO_MS) lista.push({ archivo, modificado });
      } catch (error) {
        // el archivo desapareció mientras se miraba: se ignora
      }
    }
  }
  return lista.sort((a, b) => b.modificado - a.modificado).slice(0, maximo);
}

// Lee los últimos "bytes" del archivo y devuelve sus líneas completas, ya convertidas (las que no se entienden se saltan).
function ultimasLineas(archivo, bytes) {
  const descriptor = fs.openSync(archivo, 'r');
  try {
    const tamano = fs.fstatSync(descriptor).size;
    const desde = Math.max(0, tamano - bytes);
    const buffer = Buffer.alloc(tamano - desde);
    fs.readSync(descriptor, buffer, 0, buffer.length, desde);
    const lineas = buffer.toString('utf8').split('\n');
    if (desde > 0) lineas.shift(); // la primera quedó cortada
    const resultado = [];
    for (const linea of lineas) {
      if (!linea.trim()) continue;
      try {
        resultado.push(JSON.parse(linea));
      } catch (error) {
        // línea a medio escribir: se ignora
      }
    }
    return { entradas: resultado, completo: desde === 0 };
  } finally {
    fs.closeSync(descriptor);
  }
}

// Los tokens que tenía la conversación en una respuesta de Claude.
function tokensDe(uso) {
  const n = (valor) => (Number.isFinite(valor) ? valor : 0);
  return n(uso.input_tokens) + n(uso.cache_creation_input_tokens) + n(uso.cache_read_input_tokens) + n(uso.output_tokens);
}

// ¿Este modelo trae 1 millón de tokens de contexto? Los de la familia 5 sí; si no se sabe, 200 mil.
function esModeloGrande(modelo) {
  return typeof modelo === 'string' && (/\[1m\]/i.test(modelo) || /claude-(opus|sonnet|fable)-5/i.test(modelo));
}

// Saca de las entradas del final de un chat lo que hace falta. Devuelve null si no hay ninguna respuesta.
function interpretar(entradas) {
  let titulo = null;
  let carpetaDeTrabajo = null;
  let ultima = null;      // la última respuesta de Claude con su uso
  let compactado = null;  // un "compactado" posterior a esa respuesta
  let mayorVisto = 0;     // el mayor contexto visto (si pasa de 200 mil, la ventana es de 1 millón)
  for (const entrada of entradas) {
    if (entrada.type === 'custom-title' && entrada.customTitle) titulo = entrada.customTitle;
    else if (entrada.type === 'agent-name' && entrada.agentName && !titulo) titulo = entrada.agentName;
    if (entrada.cwd) carpetaDeTrabajo = entrada.cwd;
    if (entrada.type === 'system' && entrada.subtype === 'compact_boundary') {
      compactado = entrada;
      const antes = entrada.compactMetadata && entrada.compactMetadata.preTokens;
      if (Number.isFinite(antes)) mayorVisto = Math.max(mayorVisto, antes);
    }
    const mensaje = entrada.message;
    if (entrada.type === 'assistant' && !entrada.isSidechain && mensaje && mensaje.usage && mensaje.model !== '<synthetic>') {
      ultima = entrada;
      compactado = null;
      mayorVisto = Math.max(mayorVisto, tokensDe(mensaje.usage));
    }
  }
  if (!ultima && !compactado) return null;
  // Justo después de compactar todavía no hay respuesta nueva: el contexto quedó casi vacío.
  const despues = compactado && compactado.compactMetadata && compactado.compactMetadata.postTokens;
  const tokens = compactado ? (Number.isFinite(despues) ? despues : 0) : tokensDe(ultima.message.usage);
  return {
    tokens,
    modelo: ultima ? ultima.message.model : null,
    mayorVisto,
    titulo: titulo || (carpetaDeTrabajo ? path.basename(carpetaDeTrabajo) : null),
    sesion: (ultima || compactado).sessionId || null,
  };
}

// El tamaño de la ventana de contexto: 'auto' (según el modelo), '200k' o '1m'.
function tamanoDeVentana(eleccion, datos) {
  if (eleccion === '200k') return TAMANO_NORMAL;
  if (eleccion === '1m') return TAMANO_GRANDE;
  return esModeloGrande(datos.modelo) || datos.mayorVisto > TAMANO_NORMAL ? TAMANO_GRANDE : TAMANO_NORMAL;
}

// El chat más reciente: { archivo, modificado } o null si no hay ninguno reciente.
function chatMasReciente(carpeta, ahora) {
  return chatsRecientes(carpeta, ahora, 1)[0] || null;
}

// Lo que se muestra de un chat: { sesion, titulo, tokens, tamano, porcentaje, modificado } o null si no se entiende.
// "tamano" es la elección del ajuste ('auto', '200k' o '1m').
// Lo leído se recuerda mientras el archivo no cambie (así revisar cada pocos segundos no relee nada).
const leidos = new Map(); // archivo → { modificado, datos }
function leerChat(chat, tamano) {
  let guardado = leidos.get(chat.archivo);
  if (!guardado || guardado.modificado !== chat.modificado) {
    guardado = { modificado: chat.modificado, datos: leerDatos(chat.archivo) };
    leidos.set(chat.archivo, guardado);
  }
  const datos = guardado.datos;
  if (!datos) return null;
  const total = tamanoDeVentana(tamano, datos);
  return {
    sesion: datos.sesion || path.basename(chat.archivo, '.jsonl'),
    titulo: datos.titulo,
    tokens: datos.tokens,
    tamano: total,
    porcentaje: Math.min(100, Math.round((datos.tokens / total) * 1000) / 10),
    modificado: chat.modificado,
  };
}

function leerDatos(archivo) {
  let datos = null;
  for (const bytes of TROZOS_A_LEER) {
    const { entradas, completo } = ultimasLineas(archivo, bytes);
    datos = interpretar(entradas);
    if (datos || completo) break;
  }
  return datos;
}

// Los chats usados en las últimas horas (hasta MAXIMO_DE_CHATS), del más reciente al más antiguo.
function leerChats({ tamano = 'auto', carpeta, ahora } = {}) {
  const lista = [];
  for (const chat of chatsRecientes(carpeta, ahora)) {
    try {
      const datos = leerChat(chat, tamano);
      if (datos) lista.push(datos);
    } catch (error) {
      // un archivo que no se pudo leer (por ejemplo, a medio escribir): se salta
    }
  }
  return lista;
}

// El chat más reciente (o null).
function leerContexto({ tamano = 'auto', carpeta, ahora } = {}) {
  const chat = chatMasReciente(carpeta, ahora);
  return chat ? leerChat(chat, tamano) : null;
}

// Cuándo avisar: al pasar el umbral, y de nuevo cada 10 puntos más (70, 80, 90...) para recordarlo.
// Cuando el chat baja del umbral (por ejemplo al compactar), se vuelve a empezar.
// "estado" = { sesion, avisadoHasta } y se modifica aquí. Devuelve true si toca avisar.
function tocaAvisar(estado, contexto, umbral) {
  if (estado.sesion !== contexto.sesion) {
    estado.sesion = contexto.sesion;
    estado.avisadoHasta = null;
  }
  if (contexto.porcentaje < umbral) {
    estado.avisadoHasta = null;
    return false;
  }
  const escalon = umbral + Math.floor((contexto.porcentaje - umbral) / 10) * 10;
  if (estado.avisadoHasta !== null && escalon <= estado.avisadoHasta) return false;
  estado.avisadoHasta = escalon;
  return true;
}

module.exports = { leerChats, leerContexto, chatsRecientes, chatMasReciente, interpretar, tamanoDeVentana, tocaAvisar, carpetaDeChats };
