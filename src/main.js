// main.js: es el "arranque" de la app. Electron ejecuta este archivo primero.
// Aquí se crean la ventana del widget y el ícono de la bandeja del sistema.

const path = require('path');
const { app, BrowserWindow, Tray, Menu, screen, nativeImage, ipcMain, dialog } = require('electron');
const almacen = require('./almacen');
const sesion = require('./sesion');
const uso = require('./uso');
const { ErrorUso } = uso;
const idiomas = require('./idiomas');
const { t } = idiomas;
const calculo = require('./calculo');
const alertas = require('./alertas');
const ajustes = require('./ajustes');
const exportar = require('./exportar');
const { rutaDeAsset } = require('./rutas');

// Modo de prueba: se activa abriendo la app con "--prueba" (ver "Abrir widget (modo prueba).bat").
// En este modo el uso es INVENTADO (lo controlas desde el menú de la bandeja) y se guarda
// en un archivo aparte, así que no toca tu historial real. Sirve para probar las alertas.
const MODO_PRUEBA = process.argv.includes('--prueba');
if (MODO_PRUEBA) almacen.usarArchivo('datos-prueba.json');

// Identificador con el que Windows reconoce a esta app (para mostrar sus notificaciones con su nombre).
// En la versión instalada debe ser igual al "appId" de package.json; en la de desarrollo da igual.
app.setAppUserModelId(app.isPackaged ? 'cl.widget-uso-claude' : 'Cupo');

// La ventana es un poco más grande que la tarjeta (un margen transparente alrededor) para que quepa
// la sombra suave que la hace "flotar".
const MARGEN = 8;

// Medidas de la tarjeta (sin el margen) en cada vista, en píxeles.
const MEDIDAS_DE_VISTA = {
  'normal-vertical': { ancho: 300, alto: 130 },    // las tres barras, una bajo la otra
  'normal-horizontal': { ancho: 540, alto: 92 },   // las tres barras, lado a lado
  compacto: { ancho: 300, alto: 44 },              // una sola línea con la barra de Hoy
  completo: { ancho: 640, alto: 92 + 8 + 250 },    // las barras arriba y, abajo, el historial, el desglose y la proyección juntos
  cuentas: { ancho: 600, alto: 0 },                // todas las cuentas a la vez, una fila por cuenta (el alto depende de cuántas haya)
};

// Tamaño del widget (se elige en Ajustes, o con Ctrl + rueda del mouse): todas las medidas de la ventana
// se multiplican por la escala. 1 = tamaño normal (100%). La pantalla del widget se amplía igual con "zoom".
let escalaActual = 1;
const px = (valor) => Math.round(valor * escalaActual);
// El ancho de la ventana: el de la vista, o el que pide el panel abierto si es más ancho (Ajustes lo es).
const anchoDeVista = () => px(medidasDeVista().ancho + 2 * MARGEN);
const ancho = () => px(Math.max(medidasDeVista().ancho + 2 * MARGEN, expansion.anchoPanel));
const margen = () => px(MARGEN);

// Los íconos de la tarjeta despliegan un panel (historial, desglose, proyección o ajustes) que hace
// crecer la ventana. Lo que crece es el alto del panel más la separación con la tarjeta.
// Cada panel pide su propio alto (Ajustes es más alto que los demás); aquí solo se revisa que sea razonable.
// (PANEL_SEPARACION debe coincidir con --separacion en widget.css.)
const PANEL_ALTO_NORMAL = 196;
const PANEL_ALTO_MINIMO = 120;
const PANEL_ALTO_MAXIMO = 700;
const PANEL_SEPARACION = 8;

// Todas las horas se muestran en la zona horaria de tu computador.
const ZONA_HORARIA = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Nunca se consulta más seguido que esto (para no molestar a claude.ai).
// El intervalo normal lo eliges tú en Ajustes (por defecto 15 minutos).
const MINIMO_ENTRE_CONSULTAS_MS = 5 * 60 * 1000;

// Guardamos estas cosas en variables para usarlas desde varias funciones.
let ventana = null;
let bandeja = null;

// Cuánto ha crecido la ventana por el panel desplegable, y hacia dónde (arriba o abajo).
// "extra" es lo que creció (ya multiplicado por la escala) y "alto" es el alto del panel en píxeles sin escalar.
// "anchoPanel" es el ancho que pidió el panel abierto (0 = el panel no pide más ancho que la vista) y "anclaDerecha"
// dice si, al ensancharse, la ventana crece hacia la izquierda (quedando quieto su borde derecho).
const expansion = { extra: 0, alto: 0, anchoPanel: 0, anclaDerecha: false, haciaArriba: true };

// La vista actual: modo ('normal', 'compacto', 'completo' o 'cuentas') y orientación ('vertical' u 'horizontal', para el modo normal).
// Se lee de los ajustes al arrancar y se mantiene al día aquí.
let vistaActual = { modo: 'normal', orientacion: 'vertical' };

function claveDeVista(vista = vistaActual) {
  return vista.modo === 'normal' ? 'normal-' + vista.orientacion : vista.modo;
}

// La vista completa muestra, entre la tarjeta y los paneles, una fila por cada cuenta (si hay más de una).
// (Estas medidas deben coincidir con #resumen-cuentas en widget.css.)
const RESUMEN_SEPARACION = 8;
const RESUMEN_RELLENO = 16;
const RESUMEN_FILA = 22;
let totalDeCuentas = 1; // cuántas cuentas hay (se actualiza al agregar o eliminar)
let verTodasLasCuentas = true; // ajuste: en la vista normal y la compacta, mostrar todas las cuentas a la vez (si hay más de una)

// Cuando se muestran todas las cuentas a la vez, la tarjeta de siempre se reemplaza por una lista (una fila o un bloque por cuenta).
// Estas medidas deben coincidir con widget.css (body.todas).
const LISTA_CABECERA = 24; // el título con sus botones
const LISTA_BLOQUE = 84;   // una cuenta con sus tres barras una bajo la otra (vista normal vertical)

function todasALaVez(vista = vistaActual) {
  if (vista.modo === 'cuentas') return true;
  if (vista.modo === 'completo') return false;
  return totalDeCuentas >= 2 && verTodasLasCuentas;
}

function altoDelResumen() {
  return totalDeCuentas >= 2 ? RESUMEN_SEPARACION + RESUMEN_RELLENO + RESUMEN_FILA * totalDeCuentas : 0;
}

// Lo que el usuario estiró la ventana de cada vista (en píxeles sin escala), por vista: { ancho, alto }.
// Se guarda en los datos de la app ("tamanos"). La ventana nunca es más chica que la medida base de su vista.
let tamanosGuardados = {};
const claveDeTamano = (vista = vistaActual) => claveDeVista(vista) + (todasALaVez(vista) ? '-todas' : '');

// ¿Se puede estirar esa vista a lo alto? Solo a lo ancho en la compacta y en las listas de cuentas (su alto depende de las cuentas).
const permiteAlto = (vista = vistaActual) => vista.modo !== 'compacto' && !todasALaVez(vista);

function extrasDeVista(vista = vistaActual) {
  const guardado = tamanosGuardados[claveDeTamano(vista)] || {};
  return {
    ancho: Math.max(0, Math.round(guardado.ancho || 0)),
    alto: permiteAlto(vista) ? Math.max(0, Math.round(guardado.alto || 0)) : 0,
  };
}

// Las medidas de una vista, con lo que el usuario la estiró.
function medidasDeVista(vista = vistaActual) {
  const base = medidasBase(vista);
  const extras = extrasDeVista(vista);
  return { ancho: base.ancho + extras.ancho, alto: base.alto + extras.alto };
}

// Las medidas de una vista sin estirar.
function medidasBase(vista = vistaActual) {
  const base = MEDIDAS_DE_VISTA[claveDeVista(vista)];
  if (vista.modo === 'completo') return { ...base, alto: base.alto + altoDelResumen() };
  if (todasALaVez(vista)) {
    const cabecera = RESUMEN_RELLENO + LISTA_CABECERA;
    if (vista.modo === 'compacto') return { ancho: 300, alto: cabecera + RESUMEN_FILA * totalDeCuentas };
    if (vista.modo === 'normal' && vista.orientacion === 'vertical') return { ancho: 300, alto: cabecera + LISTA_BLOQUE * totalDeCuentas };
    return { ancho: 600, alto: cabecera + RESUMEN_FILA * totalDeCuentas }; // horizontal y la vista "Cuentas": una fila por cuenta
  }
  return base;
}

// Alto de la ventana sin el panel desplegable, según la vista.
function altoBase() {
  return px(medidasDeVista().alto + 2 * MARGEN);
}

// Estado de la lectura del uso (general).
let horaActualizada = null; // hora de la última lectura buena (para el texto de la bandeja)
let ultimaConsulta = 0;     // momento (en ms) de la última consulta, para respetar el mínimo
let consultando = false;    // true mientras hay una consulta en curso
let formatoAvisado = false; // true si ya se avisó que claude.ai cambió su página (se avisa una sola vez)
let temporizadorUso = null; // temporizador de la próxima consulta automática
const pendientesDeLeer = new Set(); // cuentas que iniciaron sesión mientras había otra consulta en curso

// Lo último leído de cada cuenta, por su id:
//   uso           → último dato leído bien: { semana, hoy, limiteDiario, reinicioTexto, ... } (null si aún no hay)
//   error         → clave del mensaje corto si la última lectura falló (ej. 'error.formato'), o null si salió bien
//   inicioSemana / reinicioSemana → cuándo empezó y cuándo se reinicia la cuota semanal actual
//   inicioHoyMs   → desde cuándo se mide el uso de hoy (para las proyecciones)
//   fallosDeFormato → cuántas lecturas seguidas han fallado porque claude.ai entregó datos distintos
const lecturas = new Map();
function lecturaDe(id) {
  if (!lecturas.has(id)) {
    lecturas.set(id, { uso: null, error: null, inicioSemana: null, reinicioSemana: null, inicioHoyMs: null, fallosDeFormato: 0 });
  }
  return lecturas.get(id);
}

// La cuenta que se muestra en la tarjeta, y el nombre con que se la muestra
// (la primera cuenta no tiene nombre hasta que le pongas uno).
const cuentaActivaId = () => almacen.leer().cuentaActiva;
const nombreDeCuenta = (cuenta) => cuenta.nombre || t('cuentas.principal');
// En los avisos y archivos el nombre solo se usa si hay más de una cuenta (si no, sobra).
const nombreSiHayVarias = (cuenta) => (totalDeCuentas > 1 ? nombreDeCuenta(cuenta) : undefined);
const hayAlgunaConectada = () => almacen.leer().cuentas.some((c) => sesion.estadoDe(c.id) === 'conectado');

// Solo para el modo de prueba: el uso semanal inventado y cuántos días "adelantamos" el reloj.
// "reinicio" es la hora en que se reiniciaría la cuota semanal; null = en 3 días.
// "sesion" es el uso inventado de la sesión de 5 horas y "reinicioSesion" la hora en que terminaría.
const HORAS = 60 * 60 * 1000;
const simulacion = {
  semana: 20,
  diasAdelantados: 0,
  horasAdelantadas: 0,
  fallaFormato: false,
  reinicio: null,
  sesion: 30,
  reinicioSesion: new Date(Date.now() + 3 * HORAS),
};

// Calcula dónde poner la ventana al abrir.
// - Si hay una posición guardada Y ese lugar todavía cae dentro de algún monitor conectado, la usa.
// - Si no (primera vez, o el monitor ya no está), la pone en la esquina inferior derecha del monitor principal.
function calcularPosicionInicial() {
  const guardada = almacen.leer().posicion;

  if (guardada) {
    const cabeEnAlgunMonitor = screen.getAllDisplays().some((monitor) => {
      const area = monitor.workArea;
      // El margen transparente de la ventana puede quedar un poco fuera de la pantalla sin problema.
      return (
        guardada.x >= area.x - margen() &&
        guardada.y >= area.y - margen() &&
        guardada.x + ancho() <= area.x + area.width + margen() &&
        guardada.y + altoBase() <= area.y + area.height + margen()
      );
    });
    if (cabeEnAlgunMonitor) return guardada;
  }

  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - ancho() - 12,
    y: area.y + area.height - altoBase() - 12,
  };
}

// Hace crecer la ventana para el panel desplegable (abierto = true, con el alto y el ancho que pide ese panel)
// o la devuelve a su tamaño (abierto = false). Hay tres casos:
//   - Abrir desde cero: crece hacia ARRIBA, dejando la tarjeta donde está; si arriba no hay espacio en
//     la pantalla, crece hacia ABAJO. Si no cabe en ninguna dirección, la ventana se corre lo justo.
//   - Cambiar a un panel de otro tamaño (con uno ya abierto): se ajusta en el mismo lugar. Si el nuevo
//     no cabe, responde { noCabe: true } y no cambia nada (la pantalla cierra y vuelve a abrir).
//   - Cerrar: la ventana vuelve a su tamaño.
// Si el panel es más ancho que la vista (Ajustes), la ventana también se ensancha: queda quieto el borde
// (izquierdo o derecho) más cercano al borde de la pantalla.
// Devuelve hacia dónde creció, para que la pantalla ponga el panel del lado correcto.
function ajustarVentanaAlPanel(abierto, altoPanel, anchoPanel) {
  const altoPedido = Number.isFinite(altoPanel) ? altoPanel : PANEL_ALTO_NORMAL;
  const actual = ventana.getBounds();
  const area = screen.getDisplayMatching(actual).workArea;
  // El panel nunca puede ser más alto que lo que cabe en tu pantalla (con el widget grande, o en pantallas chicas).
  const maximoQueCabe = Math.floor((area.height - altoBase()) / escalaActual) - PANEL_SEPARACION;
  const alto = Math.max(PANEL_ALTO_MINIMO, Math.min(Math.round(altoPedido), PANEL_ALTO_MAXIMO, maximoQueCabe));
  const extra = abierto ? px(alto + PANEL_SEPARACION) : 0;
  // El ancho que pide el panel (incluye los márgenes), sin pasar del ancho de la pantalla.
  const anchoPedido = abierto && Number.isFinite(anchoPanel)
    ? Math.min(Math.round(anchoPanel), Math.floor(area.width / escalaActual))
    : 0;
  if (extra === expansion.extra && anchoPedido === expansion.anchoPanel) {
    return { haciaArriba: expansion.haciaArriba, alto };
  }

  const limiteSuperior = area.y - margen();
  const limiteInferior = area.y + area.height + margen();
  let y = actual.y;

  if (expansion.extra === 0) {
    // ABRIR desde cero: ¿cabe arriba? ¿cabe abajo?
    expansion.anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;
    const nuevoAlto = actual.height + extra;
    const cabeArriba = actual.y - extra >= limiteSuperior;
    const cabeAbajo = actual.y + nuevoAlto <= limiteInferior;
    if (cabeArriba) {
      expansion.haciaArriba = true;
      y = actual.y - extra;
    } else if (cabeAbajo) {
      expansion.haciaArriba = false;
    } else {
      // No cabe en ninguna dirección: se elige el lado con más espacio y la ventana se corre lo justo para que quepa.
      const espacioArriba = actual.y - area.y;
      const espacioAbajo = area.y + area.height - (actual.y + actual.height);
      expansion.haciaArriba = espacioArriba >= espacioAbajo;
      const yDeseada = expansion.haciaArriba ? actual.y - extra : actual.y;
      y = Math.max(limiteSuperior, Math.min(yDeseada, limiteInferior - nuevoAlto));
    }
  } else if (extra === 0) {
    // CERRAR: si había crecido hacia arriba, la ventana vuelve a bajar a su lugar.
    if (expansion.haciaArriba) y = actual.y + expansion.extra;
  } else {
    // CAMBIAR de panel con otro abierto (distinto tamaño): se ajusta en el mismo lugar y en la misma dirección.
    const diferencia = extra - expansion.extra;
    if (expansion.haciaArriba) {
      if (diferencia > 0 && actual.y - diferencia < limiteSuperior) return { haciaArriba: true, noCabe: true, alto };
      y = actual.y - diferencia;
    } else if (diferencia > 0 && actual.y + actual.height + diferencia > limiteInferior) {
      return { haciaArriba: false, noCabe: true, alto };
    }
  }

  expansion.extra = extra;
  expansion.alto = abierto ? alto : 0;
  expansion.anchoPanel = anchoPedido;
  const anchoNuevo = ancho();
  // Si cambió el ancho, queda quieto el borde izquierdo o el derecho (el que está más cerca del borde de la pantalla).
  const xDeseada = expansion.anclaDerecha ? actual.x + actual.width - anchoNuevo : actual.x;
  const x = Math.max(area.x - margen(), Math.min(xDeseada, area.x + area.width + margen() - anchoNuevo));
  ventana.setBounds({ x, y, width: anchoNuevo, height: altoBase() + extra });
  return { haciaArriba: expansion.haciaArriba, alto };
}

// Lo que las pantallas necesitan para escribir sus textos: el idioma activo, su "locale" y todos los textos.
function datosDeIdioma() {
  return { idioma: idiomas.idioma(), locale: idiomas.locale(), textos: idiomas.textos() };
}

function enviarIdioma() {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('idioma', datosDeIdioma());
}

// Vuelve a escribir los textos que dependen del idioma (nombres de días, "viernes 04:00"...) con los datos ya leídos.
function refrescarTextosDeFechas() {
  for (const [id, lectura] of lecturas) {
    const uso = lectura.uso;
    if (!uso) continue;
    uso.reinicioTexto = textoDeReinicio(uso.reinicio);
    if (uso.sesion5h) {
      uso.sesion5h.reinicioTexto = textoDeHora(redondearAlMinuto(uso.sesion5h.reinicio));
    }
    uso.proyeccion = calcularProyecciones(id);
  }
}

// El texto que se ve al dejar el mouse sobre el ícono de la bandeja.
function actualizarTooltip() {
  if (!bandeja) return;
  bandeja.setToolTip(horaActualizada ? t('tray.actualizado', { hora: horaActualizada }) : t('app.nombre'));
}

// Cambia el idioma de toda la app al instante: el menú, el tooltip, las pantallas y los textos con fechas.
function cambiarIdioma(elegido) {
  idiomas.fijar(elegido);
  refrescarTextosDeFechas();
  if (bandeja) construirMenu();
  actualizarTooltip();
  enviarIdioma();
  enviarUso();
}

// La apariencia que se manda a las pantallas: tema, transparencia, vista y orientación.
function aparienciaActual() {
  const config = almacen.leer();
  return {
    tema: config.tema,
    opacidad: config.opacidad,
    modo: vistaActual.modo,
    orientacion: vistaActual.orientacion,
    escala: Math.round(escalaActual * 100),
    todas: todasALaVez(),             // true = en vez de la tarjeta se ve la lista con todas las cuentas
    extra: extrasDeVista(),           // cuánto estiraste la ventana de esta vista (la pantalla estira su contenido igual)
    redimensionando: Boolean(redimension), // true mientras estás arrastrando un borde
    altoPanel: expansion.alto || null, // alto del panel abierto (puede achicarse si ya no cabe en la pantalla)
  };
}

// Avisa a la pantalla del widget que la apariencia cambió.
function enviarApariencia() {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('apariencia', aparienciaActual());
}

// Cambia el tamaño del widget (porcentaje: 100 = normal). El widget no se corre de lugar: queda quieto el
// borde que está más cerca del borde de la pantalla (el de la izquierda o el de la derecha, y el de arriba
// o el de abajo; con un panel abierto se sigue la dirección del panel). Después se revisa que no se salga de la pantalla.
function aplicarEscala(porcentaje) {
  const nueva = porcentaje / 100;
  if (nueva === escalaActual) return;

  const actual = ventana.getBounds();
  const area = screen.getDisplayMatching(actual).workArea;
  const anclaAbajo = expansion.extra > 0
    ? expansion.haciaArriba
    : actual.y + actual.height / 2 > area.y + area.height / 2;
  const anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;

  escalaActual = nueva;
  almacen.guardar({ escala: porcentaje });

  // Si hay un panel abierto, se recalcula con la escala nueva (y se achica si ya no cabe en la pantalla).
  if (expansion.alto > 0) {
    const maximoQueCabe = Math.floor((area.height - altoBase()) / escalaActual) - PANEL_SEPARACION;
    expansion.alto = Math.max(PANEL_ALTO_MINIMO, Math.min(expansion.alto, maximoQueCabe));
    expansion.extra = px(expansion.alto + PANEL_SEPARACION);
  }

  const anchoNuevo = ancho();
  const altoNuevo = altoBase() + expansion.extra;
  const dentro = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));
  const x = dentro(
    anclaDerecha ? actual.x + actual.width - anchoNuevo : actual.x,
    area.x - margen(), area.x + area.width + margen() - anchoNuevo
  );
  const y = dentro(
    anclaAbajo ? actual.y + actual.height - altoNuevo : actual.y,
    area.y - margen(), area.y + area.height + margen() - altoNuevo
  );

  ventana.webContents.setZoomFactor(nueva);
  ventana.setBounds({ x, y, width: anchoNuevo, height: altoNuevo });
  enviarApariencia();
  if (bandeja) construirMenu();
}

// Cambia la vista del widget (normal, compacto o completo) y/o su orientación (vertical u horizontal).
//
// La tarjeta NO se mueve de lugar: queda quieto el borde donde está anclado el widget (el de arriba o el de abajo,
// y el de la izquierda o el de la derecha, según en qué mitad de la pantalla esté).
//   - Si solo cambia el ALTO (compacto <-> normal vertical): la tarjeta se anima como un despliegue. La ventana se
//     agranda ANTES de que la tarjeta crezca y se achica DESPUÉS de que la tarjeta termina de encogerse.
//   - Si cambia el ANCHO (horizontal, completo...): el contenido se desvanece un instante, la ventana cambia de
//     tamaño en ese momento, y el contenido vuelve a aparecer.
// Si había un panel desplegado, primero se cierra.
const DURACION_FUNDIDO_MS = 140;    // el contenido se desvanece un instante al cambiar de vista (ver widget.js)
const DURACION_TARJETA_MS = 300;    // lo que tarda la tarjeta en cambiar de alto (ver widget.css)
const DURACION_CIERRE_PANEL_MS = 480; // lo que tarda en cerrarse un panel desplegado (animación + ventana)
let cambiandoDeVista = false;       // evita que un segundo clic interrumpa la animación en curso

function cambiarVista(pedida) {
  const destino = {
    modo: pedida.modo || vistaActual.modo,
    orientacion: pedida.orientacion || vistaActual.orientacion,
  };
  if (destino.modo === vistaActual.modo && destino.orientacion === vistaActual.orientacion) return;
  if (cambiandoDeVista) return;
  cambiandoDeVista = true;

  const anchoAntes = ancho();
  const anchoDespues = px(Math.max(medidasDeVista(destino).ancho + 2 * MARGEN, expansion.anchoPanel));
  const mismoAncho = anchoDespues === anchoAntes;

  // Con un panel desplegado y un cambio de ancho (o con un panel ancho, como Ajustes): se cierra el panel y se vuelve a intentar.
  if (expansion.extra > 0 && (!mismoAncho || expansion.anchoPanel > 0)) {
    ventana.webContents.send('cerrar-panel');
    setTimeout(() => { cambiandoDeVista = false; cambiarVista(destino); }, DURACION_CIERRE_PANEL_MS);
    return;
  }

  vistaActual = destino;
  almacen.guardar({ modo: destino.modo, orientacion: destino.orientacion });
  if (bandeja) construirMenu();

  const actual = ventana.getBounds();
  const area = screen.getDisplayMatching(actual).workArea;
  const nuevoAlto = altoBase() + expansion.extra;

  // ¿Qué bordes quedan quietos? Con un panel abierto, el mismo en que creció el panel; si no, según la mitad de la pantalla.
  const anclaAbajo = expansion.extra > 0
    ? expansion.haciaArriba
    : actual.y + actual.height / 2 > area.y + area.height / 2;
  const anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;
  const dentro = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));
  const x = dentro(
    anclaDerecha ? actual.x + actual.width - anchoDespues : actual.x,
    area.x - margen(), area.x + area.width + margen() - anchoDespues
  );
  const y = dentro(
    anclaAbajo ? actual.y + actual.height - nuevoAlto : actual.y,
    area.y - margen(), area.y + area.height + margen() - nuevoAlto
  );
  const cambiarTamano = () => {
    if (!ventana.isDestroyed()) ventana.setBounds({ x, y, width: anchoDespues, height: nuevoAlto });
  };

  // 1. La pantalla acomoda la tarjeta contra el borde que queda quieto (todavía no se nota nada).
  if (!ventana.isDestroyed()) ventana.webContents.send('ancla', anclaAbajo);

  let duracionTotal;
  if (!mismoAncho) {
    // Cambia el ancho: el contenido se desvanece, y a mitad del desvanecido la ventana cambia de tamaño.
    enviarApariencia();
    setTimeout(cambiarTamano, DURACION_FUNDIDO_MS + 20);
    duracionTotal = DURACION_FUNDIDO_MS + 400;
  } else if (nuevoAlto < actual.height) {
    // Achicar: primero la tarjeta se encoge dentro de la ventana grande, y al final se achica la ventana.
    setTimeout(enviarApariencia, 50);
    setTimeout(cambiarTamano, 50 + DURACION_FUNDIDO_MS + DURACION_TARJETA_MS + 80);
    duracionTotal = 50 + DURACION_FUNDIDO_MS + DURACION_TARJETA_MS + 200;
  } else {
    // Agrandar: primero crece la ventana (la tarjeta sigue chica) y después la tarjeta se despliega.
    setTimeout(cambiarTamano, 50);
    setTimeout(enviarApariencia, 110);
    duracionTotal = 50 + DURACION_FUNDIDO_MS + DURACION_TARJETA_MS + 200;
  }
  setTimeout(() => { cambiandoDeVista = false; }, duracionTotal);
}

// Si cambia la cantidad de cuentas (o el ajuste de verlas todas a la vez), la ventana cambia de tamaño.
// Queda quieto el borde de la pantalla más cercano (el de arriba o el de abajo, el izquierdo o el derecho; con un panel
// abierto, el mismo lado hacia donde creció el panel).
function reajustarLaVentana() {
  if (!ventana || ventana.isDestroyed()) return;
  const actual = ventana.getBounds();
  const anchoNuevo = ancho();
  const altoNuevo = altoBase() + expansion.extra;
  if (anchoNuevo === actual.width && altoNuevo === actual.height) return;
  const area = screen.getDisplayMatching(actual).workArea;
  const anclaAbajo = expansion.extra > 0 ? expansion.haciaArriba : actual.y + actual.height / 2 > area.y + area.height / 2;
  const anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;
  const dentro = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));
  const x = dentro(anclaDerecha ? actual.x + actual.width - anchoNuevo : actual.x, area.x - margen(), area.x + area.width + margen() - anchoNuevo);
  const y = dentro(anclaAbajo ? actual.y + actual.height - altoNuevo : actual.y, area.y - margen(), area.y + area.height + margen() - altoNuevo);
  ventana.setBounds({ x, y, width: anchoNuevo, height: altoNuevo });
  enviarApariencia();
}

// ----- Estirar la ventana arrastrando sus bordes -----
// Los bordes (y esquinas) de la pantalla avisan cuándo empieza y termina el arrastre; mientras tanto, aquí se mira
// dónde está el mouse y se va cambiando el tamaño. Queda quieto el borde contrario al que arrastras.
let redimension = null; // { borde, inicio, cursor, area, clave, temporizador } mientras se arrastra

function empezarRedimension(borde) {
  if (redimension || !ventana || ventana.isDestroyed() || expansion.extra > 0) return; // con un panel desplegado no se estira
  if (typeof borde !== 'string' || !/^(n|s|e|w|ne|nw|se|sw)$/.test(borde)) return;
  const inicio = ventana.getBounds();
  redimension = {
    borde,
    inicio,
    cursor: screen.getCursorScreenPoint(),
    area: screen.getDisplayMatching(inicio).workArea,
    clave: claveDeTamano(),
    temporizador: setInterval(moverRedimension, 16),
  };
}

function moverRedimension() {
  if (!redimension || !ventana || ventana.isDestroyed()) return terminarRedimension();
  const { borde, inicio, cursor, area, clave } = redimension;
  const punto = screen.getCursorScreenPoint();
  const dx = punto.x - cursor.x;
  const dy = punto.y - cursor.y;
  const base = medidasBase();
  const minAncho = px(base.ancho + 2 * MARGEN);
  const minAlto = px(base.alto + 2 * MARGEN);
  const maxAncho = area.width + 2 * margen();
  const maxAlto = area.height + 2 * margen();
  const entre = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));

  let { x, y, width, height } = inicio;
  if (borde.includes('e')) width = entre(inicio.width + dx, minAncho, maxAncho);
  if (borde.includes('w')) {
    width = entre(inicio.width - dx, minAncho, maxAncho);
    x = inicio.x + inicio.width - width;
  }
  if (permiteAlto()) {
    if (borde.includes('s')) height = entre(inicio.height + dy, minAlto, maxAlto);
    if (borde.includes('n')) {
      height = entre(inicio.height - dy, minAlto, maxAlto);
      y = inicio.y + inicio.height - height;
    }
  }

  tamanosGuardados[clave] = {
    ancho: Math.round((width - minAncho) / escalaActual),
    alto: Math.round((height - minAlto) / escalaActual),
  };
  ventana.setBounds({ x, y, width, height });
  enviarApariencia();
}

function terminarRedimension() {
  if (!redimension) return;
  clearInterval(redimension.temporizador);
  redimension = null;
  almacen.guardar({ tamanos: tamanosGuardados });
  enviarApariencia();
}

// Vuelve la ventana de la vista actual a su tamaño de siempre.
function restablecerTamano() {
  if (redimension || expansion.extra > 0) return;
  delete tamanosGuardados[claveDeTamano()];
  almacen.guardar({ tamanos: tamanosGuardados });
  reajustarLaVentana();
  enviarApariencia();
}

// Crea la ventana del widget.
function crearVentana() {
  const posicion = calcularPosicionInicial();

  ventana = new BrowserWindow({
    width: ancho(),
    height: altoBase(),
    x: posicion.x,
    y: posicion.y,
    frame: false,        // sin bordes ni barra de título
    transparent: true,   // permite las esquinas redondeadas (las dibuja el CSS)
    resizable: false,    // el tamaño es fijo
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,   // no aparece en la barra de tareas; se controla desde la bandeja
    hasShadow: false,
    alwaysOnTop: almacen.leer().siempreEncima,
    title: t('app.nombre'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // puente seguro hacia la pantalla
    },
  });

  ventana.setMenuBarVisibility(false);
  // Cada vez que la pantalla del widget termina de cargar, se le aplica el tamaño elegido (zoom).
  ventana.webContents.on('did-finish-load', () => ventana.webContents.setZoomFactor(escalaActual));
  ventana.loadFile(path.join(__dirname, 'ventanas', 'widget.html'));

  // Cada vez que se mueve la ventana, guardamos su posición.
  // Esperamos 400 ms desde el último movimiento para no escribir el archivo cientos de veces mientras arrastras.
  let temporizador = null;
  ventana.on('move', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (!ventana || ventana.isDestroyed()) return;
      const [x, y] = ventana.getPosition();
      // Se guarda donde estaría la ventana SIN el panel abierto (si creció hacia arriba, su borde de arriba subió).
      const yBase = expansion.haciaArriba ? y + expansion.extra : y;
      almacen.guardar({ posicion: { x, y: yBase } });
    }, 400);
  });
}

// Muestra la ventana si está oculta, y la oculta si está visible.
function mostrarOcultar() {
  if (ventana.isVisible()) {
    ventana.hide();
  } else {
    ventana.show();
  }
}

// Activa o desactiva "siempre encima" y lo recuerda para la próxima vez.
function cambiarSiempreEncima(activar) {
  ventana.setAlwaysOnTop(activar);
  almacen.guardar({ siempreEncima: activar });
}

// Pide al widget que despliegue uno de sus paneles: 'historial', 'desglose', 'proyeccion' o 'ajustes'.
// Si el widget estaba oculto, lo muestra.
function pedirPanel(nombre) {
  if (!ventana.isVisible()) ventana.show();
  ventana.webContents.send('abrir-panel', nombre);
}

// Los ajustes tal como los muestra el panel de Ajustes.
function ajustesActuales() {
  const config = almacen.leer();
  const cuenta = almacen.cuentaActiva();
  return {
    limiteDiario: cuenta.limiteDiario,   // los límites son de la cuenta que se muestra
    umbralAviso: cuenta.umbralAviso,
    nombreDeCuenta: nombreSiHayVarias(cuenta) || null,
    todasLasCuentas: verTodasLasCuentas,
    intervaloMin: config.intervaloMin,
    limitesPorDia: cuenta.limitesPorDia,
    alertasSesion: config.alertasSesion,
    umbralSesion: config.umbralSesion,
    siempreEncima: config.siempreEncima,
    arrancarConWindows: ajustes.arrancaConWindows(),
    tema: config.tema,
    opacidad: config.opacidad,
    modo: vistaActual.modo,
    orientacion: vistaActual.orientacion,
    idioma: config.idioma,
    escala: Math.round(escalaActual * 100),
    opcionesIntervalo: ajustes.OPCIONES_INTERVALO,
  };
}

// Revisa y guarda los ajustes nuevos, y los aplica AL INSTANTE (sin reiniciar la app).
function guardarAjustes(datos) {
  const revision = ajustes.validar(datos);
  if (!revision.ok) return revision;
  const nuevos = revision.valores;
  const idiomaAntes = almacen.leer().idioma;

  const cuenta = almacen.cuentaActiva();
  almacen.guardarCuenta(cuenta.id, {
    limiteDiario: nuevos.limiteDiario,
    umbralAviso: nuevos.umbralAviso,
    limitesPorDia: nuevos.limitesPorDia,
  });
  almacen.guardar({
    todasLasCuentas: nuevos.todasLasCuentas,
    intervaloMin: nuevos.intervaloMin,
    alertasSesion: nuevos.alertasSesion,
    umbralSesion: nuevos.umbralSesion,
    siempreEncima: nuevos.siempreEncima,
    tema: nuevos.tema,
    idioma: nuevos.idioma,
    opacidad: nuevos.opacidad,
  });

  // Idioma: se aplica al instante en todo (menú, tooltip, pantallas y avisos).
  if (nuevos.idioma !== idiomaAntes) cambiarIdioma(nuevos.idioma);

  // Tamaño del widget: se aplica al instante (el widget queda quieto en su borde más cercano de la pantalla).
  if (nuevos.escala !== Math.round(escalaActual * 100)) aplicarEscala(nuevos.escala);

  // Ver todas las cuentas a la vez: cambia el tamaño de la ventana (en la vista normal y en la compacta).
  if (nuevos.todasLasCuentas !== verTodasLasCuentas) {
    verTodasLasCuentas = nuevos.todasLasCuentas;
    reajustarLaVentana();
  }

  // Apariencia: tema y transparencia al instante; la vista y la orientación cambian el tamaño de la ventana.
  if (nuevos.modo !== vistaActual.modo || nuevos.orientacion !== vistaActual.orientacion) {
    cambiarVista({ modo: nuevos.modo, orientacion: nuevos.orientacion }); // también avisa a las pantallas
  } else {
    enviarApariencia();
  }

  // Siempre encima: se aplica a la ventana y se actualiza la casilla del menú de la bandeja.
  ventana.setAlwaysOnTop(nuevos.siempreEncima);

  // Arrancar con Windows: solo se toca si cambió.
  if (nuevos.arrancarConWindows !== ajustes.arrancaConWindows()) {
    ajustes.cambiarArranqueConWindows(nuevos.arrancarConWindows);
  }

  // Intervalo: la próxima consulta se reprograma con el valor nuevo.
  programarProximaConsulta();

  // Límite y aviso: se recalcula con el último dato, para que la barra y las alertas
  // reflejen el nuevo límite de inmediato (sin esperar a la próxima consulta).
  const lectura = lecturaDe(cuenta.id);
  if (lectura.uso) {
    const recalculado = registrarLectura(almacen.cuenta(cuenta.id), lectura.uso.semana, lectura.inicioSemana);
    lectura.uso.hoy = recalculado.hoy;
    lectura.uso.limiteDiario = recalculado.limiteDiario;
    lectura.inicioHoyMs = recalculado.inicioMs;
    lectura.uso.proyeccion = calcularProyecciones(cuenta.id);
    enviarUso();
  }
  if (bandeja) construirMenu();

  return { ok: true };
}

// Datos para el gráfico: el uso de cada uno de los últimos 7 días (null si ese día no hay registro).
function datosDelHistorial() {
  const config = almacen.cuentaActiva();
  const porDia = new Map(config.historial.map((entrada) => [entrada.dia, entrada]));

  // El límite de un día: el que quedó guardado con su registro; si no hay registro, el que le corresponde a ese día.
  const limiteDeEseDia = (dia) => calculo.limitesDelDia({
    limiteBase: config.limiteDiario,
    umbralBase: config.umbralAviso,
    limitesPorDia: config.limitesPorDia,
    ahora: new Date(`${dia}T15:00:00Z`), // mediodía en Chile: así la zona horaria no cambia el día
  }).limite;

  const dias = calculo.ultimosDias(fechaActual(), 7).map((dia) => {
    const registro = porDia.get(dia);
    return {
      dia,
      uso: registro ? registro.uso : null,
      limite: registro && typeof registro.limite === 'number' ? registro.limite : limiteDeEseDia(dia),
    };
  });
  return { dias, limiteDiario: config.limiteDiario, hoy: calculo.diaLocal(fechaActual()) };
}

// Guarda el historial en un archivo CSV que se abre en Excel. Pregunta dónde guardarlo (cuadro "Guardar como").
// Devuelve { ok: true, ruta, cantidad }, { ok: false, cancelado: true } o { ok: false, error }.
// "ventanaPadre" es la ventana desde la que se pidió: el cuadro queda pegado a ella, así aparece al frente.
async function exportarHistorial(ventanaPadre) {
  const config = almacen.cuentaActiva();
  if (config.historial.length === 0) {
    return { ok: false, error: t('exportar.vacio') };
  }

  // Con varias cuentas, el nombre de la cuenta va en el nombre del archivo (sin símbolos que Windows no acepte).
  const nombreDeLaCuenta = nombreSiHayVarias(config);
  const sufijo = nombreDeLaCuenta ? '-' + nombreDeLaCuenta.replace(/[^\p{L}\p{N}_-]+/gu, '_') : '';
  const nombreSugerido = t('exportar.nombreArchivo', { fecha: calculo.diaLocal(fechaActual()) + sufijo });
  const opciones = {
    title: t('exportar.titulo'),
    defaultPath: path.join(app.getPath('documents'), nombreSugerido),
    filters: [{ name: t('exportar.filtro'), extensions: ['csv'] }],
  };
  const hayPadre = ventanaPadre && !ventanaPadre.isDestroyed() && ventanaPadre.isVisible();
  const eleccion = hayPadre
    ? await dialog.showSaveDialog(ventanaPadre, opciones)
    : await dialog.showSaveDialog(opciones);
  if (eleccion.canceled || !eleccion.filePath) return { ok: false, cancelado: true };

  try {
    const cantidad = exportar.guardarCsv(eleccion.filePath, config.historial, config.limiteDiario);
    alertas.enviarExportado(cantidad, eleccion.filePath);
    return { ok: true, ruta: eleccion.filePath, cantidad };
  } catch (error) {
    return { ok: false, error: t('exportar.error', { mensaje: error.message }) };
  }
}

// Crea el ícono junto al reloj y su menú (clic derecho).
function crearBandeja() {
  const icono = nativeImage.createFromPath(rutaDeAsset('icono.ico'));
  bandeja = new Tray(icono);
  actualizarTooltip();
  construirMenu();

  // Un clic normal sobre el ícono también muestra u oculta el widget.
  bandeja.on('click', mostrarOcultar);
}

// Arma el menú del ícono. Se vuelve a armar cuando cambia la sesión,
// para que "Cerrar sesión" solo esté activo cuando hay una sesión abierta.
function construirMenu() {
  const config = almacen.leer();
  const activa = almacen.cuentaActiva();
  const hayConexion = hayAlgunaConectada();
  const activaConectada = sesion.estadoDe(activa.id) === 'conectado';

  const menu = Menu.buildFromTemplate([
    { label: t('tray.actualizar'), enabled: hayConexion, click: () => actualizarUso() },
    { label: t('tray.mostrarOcultar'), click: mostrarOcultar },
    {
      label: t('tray.siempreEncima'),
      type: 'checkbox',
      checked: almacen.leer().siempreEncima,
      click: (item) => cambiarSiempreEncima(item.checked),
    },
    {
      label: t('tray.cuenta'),
      submenu: [
        ...config.cuentas.map((cuenta) => ({
          label: nombreDeCuenta(cuenta),
          type: 'radio',
          checked: cuenta.id === activa.id,
          click: () => activarCuenta(cuenta.id),
        })),
        { type: 'separator' },
        { label: t('tray.cuentasAdministrar'), click: () => pedirPanel('cuentas') },
      ],
    },
    { label: t('tray.historial'), click: () => pedirPanel('historial') },
    { label: t('tray.desglose'), click: () => pedirPanel('desglose') },
    { label: t('tray.proyeccion'), click: () => pedirPanel('proyeccion') },
    {
      label: t('tray.vista'),
      submenu: [
        { label: t('tray.vista.normal'), type: 'radio', checked: vistaActual.modo === 'normal', click: () => cambiarVista({ modo: 'normal' }) },
        { label: t('tray.vista.compacto'), type: 'radio', checked: vistaActual.modo === 'compacto', click: () => cambiarVista({ modo: 'compacto' }) },
        { label: t('tray.vista.completo'), type: 'radio', checked: vistaActual.modo === 'completo', click: () => cambiarVista({ modo: 'completo' }) },
        { label: t('tray.vista.cuentas'), type: 'radio', checked: vistaActual.modo === 'cuentas', click: () => cambiarVista({ modo: 'cuentas' }) },
        { type: 'separator' },
        { label: t('tray.disposicion.vertical'), type: 'radio', checked: vistaActual.orientacion === 'vertical', click: () => cambiarVista({ orientacion: 'vertical' }) },
        { label: t('tray.disposicion.horizontal'), type: 'radio', checked: vistaActual.orientacion === 'horizontal', click: () => cambiarVista({ orientacion: 'horizontal' }) },
      ],
    },
    { label: t('tray.exportar'), click: () => exportarHistorial(ventana) },
    { label: t('tray.ajustes'), click: () => pedirPanel('ajustes') },
    {
      label: config.cuentas.length > 1 ? t('tray.cerrarSesionDe', { nombre: nombreDeCuenta(activa) }) : t('tray.cerrarSesion'),
      enabled: activaConectada,
      click: () => sesion.cerrarSesion(activa.id),
    },
    ...(MODO_PRUEBA ? [menuDePrueba()] : []),
    { type: 'separator' },
    { label: t('tray.salir'), click: () => app.quit() },
  ]);
  bandeja.setContextMenu(menu);
}

// Submenú que solo existe en el modo de prueba: permite inventar consumo.
function menuDePrueba() {
  const accion = (texto, nombre) => ({ label: texto, enabled: hayAlgunaConectada(), click: () => accionDePrueba(nombre) });
  return {
    label: 'PRUEBA (datos inventados)',
    submenu: [
      accion('Sumar 2% de uso', 'sumar-2'),
      accion('Sumar 5% de uso', 'sumar-5'),
      accion('Sesión 5 h: sumar 25%', 'sesion-sumar-25'),
      accion('Sesión 5 h: simular reinicio', 'sesion-reiniciar'),
      accion('Simular reinicio semanal', 'reiniciar-semana'),
      accion('Simular que pasó un día', 'nuevo-dia'),
      accion('Simular que pasaron 4 horas', 'pasan-horas-4'),
      accion('Simular error de formato (activar / desactivar)', 'formato-alternar'),
      accion('Borrar datos de prueba', 'borrar'),
    ],
  };
}

// Ejecuta una acción del menú de prueba y vuelve a calcular todo con el nuevo valor inventado.
async function accionDePrueba(nombre) {
  if (!MODO_PRUEBA) return;

  if (nombre.startsWith('sumar-')) {
    simulacion.semana += Number(nombre.slice('sumar-'.length));
  } else if (nombre.startsWith('sesion-sumar-')) {
    simulacion.sesion += Number(nombre.slice('sesion-sumar-'.length));
  } else if (nombre === 'sesion-reiniciar') {
    // Empieza una sesión nueva: poco uso y una hora de reinicio nueva, 5 horas más adelante.
    simulacion.sesion = 5;
    simulacion.reinicioSesion = new Date(Date.now() + 5 * HORAS);
  } else if (nombre === 'reiniciar-semana') {
    simulacion.semana = 1;
    // La semana nueva empieza justo ahora: su hora de reinicio queda dentro de 7 días.
    simulacion.reinicio = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  } else if (nombre === 'nuevo-dia') {
    simulacion.diasAdelantados += 1;
  } else if (nombre === 'formato-alternar') {
    simulacion.fallaFormato = !simulacion.fallaFormato;
  } else if (nombre.startsWith('pasan-horas-')) {
    simulacion.horasAdelantadas += Number(nombre.slice('pasan-horas-'.length));
  } else if (nombre === 'borrar') {
    simulacion.semana = 20;
    simulacion.diasAdelantados = 0;
    simulacion.horasAdelantadas = 0;
    simulacion.fallaFormato = false;
    simulacion.reinicio = null;
    simulacion.sesion = 30;
    simulacion.reinicioSesion = new Date(Date.now() + 3 * HORAS);
    for (const cuenta of almacen.leer().cuentas) almacen.guardarCuenta(cuenta.id, { diario: null, historial: [], estadoSesion: null });
  }
  await actualizarUso();
}

// Lectura inventada del uso, con la misma forma que la real (ver uso.js).
function lecturaSimulada(indiceDeCuenta = 0) {
  // Para probar el aviso de "claude.ai cambió su formato": la lectura falla como fallaría de verdad.
  if (simulacion.fallaFormato) throw new ErrorUso('formato', 'Formato inventado para la prueba');
  return {
    semana: Math.min(100, simulacion.semana + indiceDeCuenta * 8),
    reinicio: simulacion.reinicio || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    sesion5h: { porcentaje: Math.min(100, simulacion.sesion + indiceDeCuenta * 15), reinicio: simulacion.reinicioSesion },
    plan: indiceDeCuenta === 0 ? { clave: 'pro', multiplo: null } : { clave: 'max', multiplo: 5 }, // inventado, para ver cómo se muestra
    desglose: [
      { clave: 'cowork', nombre: 'Cowork', porcentaje: 45 },
      { clave: 'claude_code', nombre: 'Claude Code', porcentaje: 40 },
      { clave: 'chat', nombre: 'Chats', porcentaje: 10 },
      { clave: 'other', nombre: 'Otros', porcentaje: 5 },
    ],
  };
}

// La fecha y hora "de ahora". En el modo de prueba se puede adelantar (días y horas) para simular el paso del tiempo.
function fechaActual() {
  return new Date(Date.now() + simulacion.diasAdelantados * 24 * HORAS + simulacion.horasAdelantadas * HORAS);
}

// Convierte una proyección (ver calculo.js) en algo simple de enviar a la pantalla, con las horas ya escritas
// en hora de Chile. "esSemanal" decide si la hora de "cuando" lleva el día de la semana.
function proyeccionParaLaPantalla(proyeccion, esSemanal) {
  const resultado = { tipo: proyeccion.tipo };
  if (proyeccion.cuando) {
    resultado.cuandoTexto = esSemanal
      ? textoDeReinicio(proyeccion.cuando)
      : textoDeHora(redondearAlMinuto(proyeccion.cuando));
  }
  if (proyeccion.finDelDia !== undefined) resultado.fin = proyeccion.finDelDia;
  if (proyeccion.finDeSemana !== undefined) resultado.fin = proyeccion.finDeSemana;
  return resultado;
}

// Calcula "a este ritmo..." para hoy y para la semana, con los últimos datos leídos.
function calcularProyecciones(id) {
  const ahora = fechaActual();
  const lectura = lecturaDe(id);
  const diaria = calculo.proyeccionDiaria({
    hoy: lectura.uso.hoy, limite: lectura.uso.limiteDiario, inicioMs: lectura.inicioHoyMs, ahora,
  });
  const semanal = calculo.proyeccionSemanal({
    semana: lectura.uso.semana, inicioSemana: lectura.inicioSemana, reinicio: lectura.reinicioSemana, ahora,
  });
  return {
    diaria: proyeccionParaLaPantalla(diaria, false),
    semanal: proyeccionParaLaPantalla(semanal, true),
  };
}

// Calcula el uso de hoy con la lectura semanal nueva, lo guarda y envía las alertas que correspondan.
// "cuenta" son los datos guardados de esa cuenta (sus límites, su historial...).
function registrarLectura(cuenta, semana, inicioSemana) {
  const ahora = fechaActual();
  // El límite y el aviso previo de HOY (pueden ser distintos según el día de la semana).
  const { limite, umbral } = calculo.limitesDelDia({
    limiteBase: cuenta.limiteDiario,
    umbralBase: cuenta.umbralAviso,
    limitesPorDia: cuenta.limitesPorDia,
    ahora,
  });
  const resultado = calculo.procesarLectura({
    estado: cuenta.diario,
    historial: cuenta.historial,
    semana,
    inicioSemana,
    ahora,
    limite,
    umbralAviso: umbral,
  });

  // Guardamos PRIMERO (así las alertas quedan marcadas como enviadas aunque algo falle después).
  almacen.guardarCuenta(cuenta.id, { diario: resultado.estado, historial: resultado.historial });
  for (const tipo of resultado.alertas) {
    alertas.enviar(tipo, resultado.hoy, limite, nombreSiHayVarias(cuenta));
  }
  return { hoy: resultado.hoy, limiteDiario: limite, inicioMs: resultado.estado.inicioMs };
}

// Revisa la sesión de 5 horas y envía las alertas que correspondan (si las tienes activadas en Ajustes).
function registrarSesion(cuenta, sesion5h) {
  const config = almacen.leer();
  if (!config.alertasSesion) return;

  const resultado = calculo.procesarSesion({
    estado: cuenta.estadoSesion,
    sesion5h,
    umbral: config.umbralSesion,
    ahora: fechaActual(),
  });

  // Igual que con el límite diario: se guarda PRIMERO, y después se avisa.
  almacen.guardarCuenta(cuenta.id, { estadoSesion: resultado.estado });
  const porcentaje = sesion5h ? sesion5h.porcentaje : null;
  const reinicioTexto = sesion5h ? textoDeHora(redondearAlMinuto(sesion5h.reinicio)) : null;
  for (const tipo of resultado.alertas) {
    alertas.enviarSesion(tipo, porcentaje, reinicioTexto, nombreSiHayVarias(cuenta));
  }
}

// Se llama cada vez que cambia el estado de la sesión de una cuenta:
// avisa a la pantalla del widget (si es la cuenta que se muestra) y actualiza el menú de la bandeja.
function alCambiarSesion(id, estado) {
  if (ventana && !ventana.isDestroyed() && id === cuentaActivaId()) {
    ventana.webContents.send('estado-sesion', estado);
  }
  if (bandeja) construirMenu();

  if (estado === 'conectado') {
    // Acabas de entrar: leemos el uso de esa cuenta de inmediato.
    actualizarUso({ solo: id });
  } else {
    // Sin sesión no hay nada que consultar: olvidamos los datos de esa cuenta.
    lecturas.delete(id);
    programarProximaConsulta();
  }
  enviarUso();
}

// Convierte la fecha de reinicio a texto en hora de Chile. Ejemplo: "viernes 04:00".
function textoDeReinicio(fecha) {
  fecha = redondearAlMinuto(fecha);
  const dia = fecha.toLocaleDateString(idiomas.locale(), { weekday: 'long', timeZone: ZONA_HORARIA });
  return `${dia} ${textoDeHora(fecha)}`;
}

// claude.ai a veces entrega la hora con fracciones de segundo (ej. 06:59:59.9):
// redondeamos al minuto más cercano para mostrar 04:00 y no 03:59.
function redondearAlMinuto(fecha) {
  return new Date(Math.round(fecha.getTime() / 60000) * 60000);
}

// Convierte una fecha a "HH:MM" en hora de Chile. Ejemplo: "14:40".
function textoDeHora(fecha) {
  // "h23" = reloj de 24 horas (04:00, 14:40), igual en todos los idiomas
  return fecha.toLocaleTimeString(idiomas.locale(), {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA_HORARIA,
  });
}

// Traduce un error de lectura a la clave de un mensaje corto que cabe en el widget (ver idiomas/es.js).
function claveDeError(error) {
  if (error.tipo === 'sin-internet') return 'error.sinConexion';
  if (error.tipo === 'formato') return 'error.formato';
  return 'error.generico';
}

// Lo que la pantalla del widget necesita para dibujarse.
// El nombre del plan para mostrar: "Pro", "Max 5x"... ("Gratis" / "Free" se traduce).
function textoDePlan(plan) {
  if (!plan) return null;
  if (plan.clave === 'free') return t('plan.free');
  if (plan.clave === 'max') return plan.multiplo ? `Max ${plan.multiplo}x` : 'Max';
  return { pro: 'Pro', team: 'Team', enterprise: 'Enterprise' }[plan.clave] || null;
}

// Un resumen de cada cuenta (para la lista de cuentas y para la vista completa).
function resumenDeCuentas() {
  return almacen.leer().cuentas.map((cuenta) => {
    const { uso: datos, error } = lecturaDe(cuenta.id);
    return {
      id: cuenta.id,
      nombre: nombreDeCuenta(cuenta),
      estado: sesion.estadoDe(cuenta.id),
      error: error ? t(error) : null,
      plan: datos ? textoDePlan(datos.plan) : null,
      uso: datos && {
        hoy: datos.hoy,
        limiteDiario: datos.limiteDiario,
        semana: datos.semana,
        sesion5h: datos.sesion5h && { porcentaje: datos.sesion5h.porcentaje },
      },
    };
  });
}

// Lo que la pantalla necesita: el dato de la cuenta que se muestra y el resumen de todas.
function datosParaLaPantalla() {
  const activa = cuentaActivaId();
  const { uso: datos, error } = lecturaDe(activa);
  return { uso: datos, error: error ? t(error) : null, prueba: MODO_PRUEBA, activa, cuentas: resumenDeCuentas() };
}

// Manda a la pantalla del widget el último dato (o el último error).
function enviarUso() {
  if (ventana && !ventana.isDestroyed()) {
    ventana.webContents.send('datos-uso', datosParaLaPantalla());
  }
}

// Lee el uso de UNA cuenta, lo guarda y lo deja listo para mostrar. Si falla, el error queda anotado en esa cuenta.
async function leerCuenta(cuenta, indice) {
  const lectura = lecturaDe(cuenta.id);
  try {
    const resultado = MODO_PRUEBA ? lecturaSimulada(indice) : await uso.leerUso(cuenta.particion);
    const ahora = textoDeHora(new Date());
    // La semana empezó 7 días antes de su hora de reinicio.
    lectura.reinicioSemana = resultado.reinicio;
    lectura.inicioSemana = new Date(resultado.reinicio.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hoy = registrarLectura(almacen.cuenta(cuenta.id), resultado.semana, lectura.inicioSemana);
    lectura.inicioHoyMs = hoy.inicioMs;
    registrarSesion(almacen.cuenta(cuenta.id), resultado.sesion5h);
    lectura.uso = {
      semana: resultado.semana,
      hoy: hoy.hoy,                   // % usado hoy
      limiteDiario: hoy.limiteDiario, // límite diario en %
      reinicio: resultado.reinicio,   // fecha del reinicio semanal (con ella se escribe el texto en el idioma elegido)
      reinicioTexto: textoDeReinicio(resultado.reinicio),
      // Sesión de 5 horas (puede ser null si claude.ai no la entregó)
      sesion5h: resultado.sesion5h && {
        porcentaje: resultado.sesion5h.porcentaje,
        reinicio: resultado.sesion5h.reinicio,
        reinicioTexto: textoDeHora(redondearAlMinuto(resultado.sesion5h.reinicio)),
      },
      desglose: resultado.desglose, // reparto de la semana por producto (puede ser null)
      plan: resultado.plan,         // { clave, multiplo } del plan de esta cuenta (puede ser null)
      actualizado: ahora,
    };
    lectura.uso.proyeccion = calcularProyecciones(cuenta.id); // "a este ritmo..." de hoy y de la semana
    lectura.error = null;
    lectura.fallosDeFormato = 0; // una lectura buena borra la cuenta de fallos
    formatoAvisado = false;
    console.log(`Lectura ${ahora} [${nombreDeCuenta(cuenta)}]: semana ${resultado.semana}%, hoy ${hoy.hoy}%`);
    horaActualizada = ahora;
    actualizarTooltip();
  } catch (error) {
    // Cualquier fallo se muestra en el widget, pero la app sigue funcionando.
    console.error(`No se pudo leer el uso [${nombreDeCuenta(cuenta)}]:`, error.message);
    lectura.error = claveDeError(error);
    if (error.tipo === 'sesion') sesion.marcarExpirada(cuenta.id);

    // Si claude.ai entrega datos que no entendemos 3 veces seguidas (unos 15 minutos), probablemente
    // cambió su página: se avisa con una notificación, UNA sola vez (no cada 5 minutos).
    if (error.tipo === 'formato') {
      lectura.fallosDeFormato += 1;
      if (lectura.fallosDeFormato === 3 && !formatoAvisado) {
        formatoAvisado = true;
        alertas.enviarProblemaDeFormato();
      }
    }
  }
  enviarUso();
}

// Consulta el uso de todas las cuentas con sesión (una tras otra) y lo muestra. Se puede llamar a mano (menú "Actualizar")
// o desde el temporizador. Con { solo: id } se lee únicamente esa cuenta (por ejemplo, justo después de iniciar sesión).
async function actualizarUso({ solo } = {}) {
  if (consultando) {
    if (solo) pendientesDeLeer.add(solo); // se lee apenas termine la consulta en curso
    return;
  }
  const cuentas = almacen.leer().cuentas.filter((c) => sesion.estadoDe(c.id) === 'conectado' && (!solo || c.id === solo));
  if (cuentas.length === 0) return;

  // Respetamos el mínimo entre consultas: si fue hace poco, no volvemos a preguntar.
  // (En el modo de prueba no hay consulta real, así que no hace falta esperar.)
  // Se dan 2 segundos de margen, porque el temporizador puede despertar unos milisegundos antes
  // de tiempo (con el intervalo en 5 minutos, igual al mínimo, eso dejaba la app sin actualizar).
  if (!solo && !MODO_PRUEBA && Date.now() - ultimaConsulta < MINIMO_ENTRE_CONSULTAS_MS - 2000) {
    // Aunque no consultemos ahora, la próxima consulta automática tiene que seguir programada.
    programarProximaConsulta();
    return;
  }

  consultando = true;
  if (!solo) ultimaConsulta = Date.now();
  clearTimeout(temporizadorUso);

  try {
    const todas = almacen.leer().cuentas;
    for (const cuenta of cuentas) await leerCuenta(cuenta, todas.findIndex((c) => c.id === cuenta.id));
  } finally {
    consultando = false;
    enviarUso();
    programarProximaConsulta();
    for (const id of [...pendientesDeLeer]) {
      pendientesDeLeer.delete(id);
      actualizarUso({ solo: id });
    }
  }
}

// Programa la próxima consulta automática: pasado el intervalo de Ajustes desde la última consulta,
// o a los 5 minutos si la última falló (para recuperarse pronto).
// También se llama al cambiar el intervalo en Ajustes, para que se aplique sin reiniciar.
function programarProximaConsulta() {
  clearTimeout(temporizadorUso);
  if (!hayAlgunaConectada()) return;

  const hayError = almacen.leer().cuentas.some((c) => lecturaDe(c.id).error);
  const espera = hayError ? MINIMO_ENTRE_CONSULTAS_MS : almacen.leer().intervaloMin * 60 * 1000;
  const yaPasado = Date.now() - ultimaConsulta;
  const faltan = Math.max(1000, espera - yaPasado);
  temporizadorUso = setTimeout(() => actualizarUso(), faltan);
  console.log(`Próxima consulta en ${Math.round(faltan / 60000)} min`);
}

// ----- Cuentas -----

// El título de la ventana de inicio de sesión (con varias cuentas dice de cuál es).
function tituloDeInicioDeSesion(cuenta) {
  return totalDeCuentas > 1 ? t('login.tituloCuenta', { nombre: nombreDeCuenta(cuenta) }) : t('login.titulo');
}

// Avisa a la pantalla y al menú que algo de las cuentas cambió.
function avisarCambioDeCuentas() {
  if (bandeja) construirMenu();
  enviarUso();
}

// Pasa a mostrar otra cuenta en la tarjeta.
function activarCuenta(id) {
  const config = almacen.leer();
  if (id === config.cuentaActiva || !config.cuentas.some((c) => c.id === id)) return;
  almacen.guardar({ cuentaActiva: id });
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('estado-sesion', sesion.estadoDe(id));
  avisarCambioDeCuentas();
}

const NOMBRE_MAXIMO = 20;
const limpiarNombre = (nombre) => String(nombre ?? '').trim().slice(0, NOMBRE_MAXIMO);

// Agrega una cuenta nueva, la muestra y abre la ventana para que inicies sesión en ella.
async function agregarCuenta(nombre) {
  nombre = limpiarNombre(nombre);
  if (!nombre) return { ok: false, error: t('cuentas.err.nombre') };
  const nueva = almacen.agregarCuenta(nombre);
  if (!nueva) return { ok: false, error: t('cuentas.err.maximo', { n: almacen.MAXIMO_DE_CUENTAS }) };
  await sesion.registrar(nueva, MODO_PRUEBA);
  totalDeCuentas = almacen.leer().cuentas.length;
  reajustarLaVentana();
  activarCuenta(nueva.id);
  if (sesion.estadoDe(nueva.id) === 'conectado') actualizarUso({ solo: nueva.id }); // (solo pasa en el modo de prueba)
  if (!MODO_PRUEBA) sesion.abrirLogin(nueva.id, tituloDeInicioDeSesion(nueva));
  return { ok: true };
}

function renombrarCuenta(id, nombre) {
  nombre = limpiarNombre(nombre);
  if (!nombre) return { ok: false, error: t('cuentas.err.nombre') };
  if (!almacen.cuenta(id)) return { ok: false };
  almacen.guardarCuenta(id, { nombre });
  avisarCambioDeCuentas();
  return { ok: true };
}

// Elimina una cuenta (con su historial, sus límites y su sesión). Siempre queda al menos una.
async function eliminarCuenta(id) {
  const config = almacen.leer();
  if (config.cuentas.length <= 1 || !config.cuentas.some((c) => c.id === id)) return { ok: false };
  await sesion.olvidar(id);
  almacen.quitarCuenta(id);
  lecturas.delete(id);
  totalDeCuentas = almacen.leer().cuentas.length;
  if (id === config.cuentaActiva && ventana && !ventana.isDestroyed()) {
    ventana.webContents.send('estado-sesion', sesion.estadoDe(cuentaActivaId()));
  }
  reajustarLaVentana();
  avisarCambioDeCuentas();
  programarProximaConsulta();
  return { ok: true };
}

// Evitamos que se abran dos widgets a la vez si se ejecuta la app dos veces.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Cuando Electron termina de prepararse, creamos la ventana y el ícono.
  app.whenReady().then(async () => {
    // La pantalla del widget puede preguntar el estado y pedir abrir el inicio de sesión.
    ipcMain.handle('obtener-estado', () => sesion.estadoDe(cuentaActivaId()));
    ipcMain.on('iniciar-sesion', () => sesion.abrirLogin(cuentaActivaId(), tituloDeInicioDeSesion(almacen.cuentaActiva())));
    // Cuentas: cambiar la que se muestra, agregar, renombrar, eliminar y entrar / salir de cada una.
    const esId = (id) => typeof id === 'string' && almacen.cuenta(id);
    ipcMain.on('cuentas-activar', (evento, id) => { if (esId(id)) activarCuenta(id); });
    ipcMain.handle('cuentas-agregar', (evento, nombre) => agregarCuenta(nombre));
    ipcMain.handle('cuentas-renombrar', (evento, id, nombre) => renombrarCuenta(id, nombre));
    ipcMain.handle('cuentas-eliminar', (evento, id) => (esId(id) ? eliminarCuenta(id) : { ok: false }));
    ipcMain.on('cuentas-cerrar-sesion', (evento, id) => { if (esId(id)) sesion.cerrarSesion(id); });
    ipcMain.on('cuentas-iniciar-sesion', (evento, id) => { if (esId(id)) sesion.abrirLogin(id, tituloDeInicioDeSesion(almacen.cuenta(id))); });
    ipcMain.handle('obtener-uso', () => datosParaLaPantalla());
    ipcMain.handle('obtener-apariencia', () => aparienciaActual());
    ipcMain.handle('obtener-idioma', () => datosDeIdioma());
    ipcMain.on('alternar-modo', (evento, modo) => {
      if (modo !== 'compacto' && modo !== 'completo' && modo !== 'cuentas') return;
      cambiarVista({ modo: vistaActual.modo === modo ? 'normal' : modo }); // pulsar el mismo botón otra vez vuelve a la vista normal
    });
    ipcMain.on('fijar-escala', (evento, porcentaje) => {
      if (!Number.isFinite(porcentaje)) return;
      aplicarEscala(Math.max(ajustes.ESCALA_MINIMA, Math.min(Math.round(porcentaje), ajustes.ESCALA_MAXIMA)));
    });
    ipcMain.on('redimensionar-inicio', (evento, borde) => empezarRedimension(borde));
    ipcMain.on('redimensionar-fin', () => terminarRedimension());
    ipcMain.on('restablecer-tamano', () => restablecerTamano());
    ipcMain.on('alternar-orientacion', () => {
      // La orientación solo se nota en la vista normal; en las otras no hay nada que cambiar.
      if (vistaActual.modo !== 'normal') return;
      cambiarVista({ orientacion: vistaActual.orientacion === 'vertical' ? 'horizontal' : 'vertical' });
    });
    ipcMain.on('cambiar-escala', (evento, paso) => {
      if (!Number.isFinite(paso) || Math.abs(paso) > 50) return;
      const nueva = Math.round(escalaActual * 100 + paso);
      aplicarEscala(Math.max(ajustes.ESCALA_MINIMA, Math.min(nueva, ajustes.ESCALA_MAXIMA)));
    });
    ipcMain.handle('exportar-historial', (evento) => exportarHistorial(BrowserWindow.fromWebContents(evento.sender)));
    ipcMain.handle('ajustar-ventana', (evento, abierto, alto, anchoPanel) => ajustarVentanaAlPanel(Boolean(abierto), alto, anchoPanel));
    ipcMain.handle('obtener-ajustes', () => ajustesActuales());
    ipcMain.handle('guardar-ajustes', (evento, datos) => guardarAjustes(datos));
    ipcMain.handle('obtener-historial', () => datosDelHistorial());
    if (MODO_PRUEBA) ipcMain.handle('prueba', (evento, nombre) => accionDePrueba(nombre));

    // Primero averiguamos si ya hay sesión guardada, luego mostramos todo.
    const cuentasGuardadas = almacen.leer().cuentas;
    totalDeCuentas = cuentasGuardadas.length;
    verTodasLasCuentas = almacen.leer().todasLasCuentas !== false;
    tamanosGuardados = almacen.leer().tamanos || {};
    await sesion.iniciar(cuentasGuardadas, alCambiarSesion, MODO_PRUEBA);
    idiomas.fijar(almacen.leer().idioma); // el idioma guardado, antes de crear el menú y las pantallas

    // El tamaño de la ventana depende de la vista y de la orientación guardadas.
    const guardadaVista = almacen.leer();
    vistaActual = {
      modo: ajustes.OPCIONES_MODO.includes(guardadaVista.modo) ? guardadaVista.modo : 'normal',
      orientacion: ajustes.OPCIONES_ORIENTACION.includes(guardadaVista.orientacion) ? guardadaVista.orientacion : 'vertical',
    };
    const guardada = almacen.leer().escala;   // y del tamaño elegido (en %)
    escalaActual = Math.max(ajustes.ESCALA_MINIMA, Math.min(guardada, ajustes.ESCALA_MAXIMA)) / 100;
    crearVentana();
    crearBandeja();

    // Si ya había sesión guardada de otras veces, leemos el uso al arrancar.
    actualizarUso();
  });
}

// Aunque la ventana esté oculta, la app sigue viva en la bandeja.
// Solo se cierra del todo con "Salir".
app.on('window-all-closed', () => {
  app.quit();
});
