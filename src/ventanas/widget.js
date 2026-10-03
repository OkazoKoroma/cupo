// widget.js: dibuja el widget (barras, números animados y paneles desplegables).
// Los datos de uso los lee y calcula la app principal (uso.js y calculo.js) y los manda hasta aquí.
// (Las funciones formatear, colorSemanal, colorDiario y las constantes de colores están en colores.js.)

// Si Windows tiene activada la opción de reducir animaciones, no animamos los números.
const REDUCIR_ANIMACIONES = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- Barras y textos -----

// Llena una barra. "porcentaje" va de 0 a 100 (o null para dejarla vacía).
// "colorDe" es la función que elige el color según qué tan llena está.
function pintarBarra(idRelleno, porcentaje, colorDe = colorSemanal) {
  const relleno = document.getElementById(idRelleno);
  const real = porcentaje === null ? 0 : Math.max(0, porcentaje);
  const color = colorDe(real / 100);
  // El color se elige con el valor real (puede pasar del 100%: ahí la barra se pone roja),
  // pero la barra nunca se dibuja más ancha que su caja.
  relleno.style.width = `${Math.min(real, 100)}%`;
  relleno.style.setProperty('--c', color);
  // Una barra en rojo late suavemente para llamar la atención.
  relleno.classList.toggle('critico', color === ROJO && porcentaje !== null);
}

// Escribe el texto pequeño de un medidor; "esAviso" lo pinta en amarillo (para errores).
function escribirDetalle(id, texto, esAviso = false) {
  const elemento = document.getElementById(id);
  delete elemento.dataset.reinicio; // ya no es un "Reinicio: ..." (no se actualiza solo)
  elemento.textContent = texto;
  elemento.classList.toggle('aviso', esAviso);
}

// ----- Reinicio: como cuenta regresiva ("en 2 h 15 min") o como hora ("15:06"), según Ajustes -----

let formatoReinicio = 'relativo'; // lo manda la app con la apariencia

// Cuánto falta para una fecha, en palabras cortas: "en 45 min", "en 2 h 15 min", "en 3 d 4 h".
function textoQueFalta(fechaMs) {
  const minutos = Math.round((fechaMs - Date.now()) / 60000);
  if (minutos <= 0) return t('tiempo.ahora');
  if (minutos < 60) return t('tiempo.min', { m: minutos });
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto ? t('tiempo.horasMin', { h: horas, m: resto }) : t('tiempo.horas', { h: horas });
  const dias = Math.floor(horas / 24);
  const horasResto = horas % 24;
  return horasResto ? t('tiempo.diasHoras', { d: dias, h: horasResto }) : t('tiempo.dias', { d: dias });
}

// Vuelve a escribir un "Reinicio: ..." con lo que falta ahora (o la hora), y deja la otra forma al pasar el mouse.
function pintarReinicio(elemento) {
  const fechaMs = Number(elemento.dataset.reinicio);
  const hora = elemento.dataset.hora;
  const falta = textoQueFalta(fechaMs);
  const prefijo = document.createElement('span');
  prefijo.className = 'prefijo';
  prefijo.textContent = t('reinicio.prefijo');
  elemento.replaceChildren(prefijo, formatoReinicio === 'hora' ? hora : falta);
  elemento.title = formatoReinicio === 'hora' ? falta : hora;
}

// Escribe "Reinicio: ..." en un detalle. La palabra "Reinicio:" va en su propio trozo para poder esconderla
// en la vista horizontal, donde no hay espacio. "fecha" es cuándo se reinicia (para la cuenta regresiva).
function escribirReinicio(id, hora, fecha) {
  const elemento = document.getElementById(id);
  elemento.classList.remove('aviso');
  elemento.dataset.hora = hora;
  elemento.dataset.reinicio = String(fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime());
  pintarReinicio(elemento);
}

// La cuenta regresiva avanza sola: cada 30 segundos se vuelven a escribir todos los "Reinicio: ...".
function actualizarReinicios() {
  for (const elemento of document.querySelectorAll('[data-reinicio]')) pintarReinicio(elemento);
}
setInterval(actualizarReinicios, 30 * 1000);

// Muestra un número que "sube" (o baja) suavemente hasta su valor nuevo, en vez de saltar de golpe.
// "formato" convierte el número en el texto que se ve, ej. (v) => `${formatear(v)}%`.
const valoresMostrados = {}; // el último valor que se mostró en cada elemento
const cuadrosPendientes = {}; // la animación en curso de cada elemento

function animarNumero(id, destino, formato) {
  const elemento = document.getElementById(id);
  const desde = id in valoresMostrados ? valoresMostrados[id] : 0;
  cancelAnimationFrame(cuadrosPendientes[id]);
  valoresMostrados[id] = destino;

  if (REDUCIR_ANIMACIONES || desde === destino) {
    elemento.textContent = formato(destino);
    return;
  }

  const inicio = performance.now();
  const duracion = 700;
  const paso = (ahora) => {
    const avance = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - avance, 3); // frena al llegar
    elemento.textContent = formato(desde + (destino - desde) * suave);
    if (avance < 1) cuadrosPendientes[id] = requestAnimationFrame(paso);
  };
  cuadrosPendientes[id] = requestAnimationFrame(paso);
}

// ----- Límites extra por modelo (por ejemplo Fable, en el plan Max) -----

// Una barra por cada límite extra, debajo de Semana. Se crean con la misma forma que los otros medidores.
function dibujarLimitesExtra(extras) {
  const lista = extras || [];
  const contenedor = document.getElementById('extras');
  document.documentElement.style.setProperty('--n-extras', String(lista.length));
  document.documentElement.style.setProperty('--n-medidores', String(3 + lista.length));

  // Si cambió la cantidad o los nombres, se arman de nuevo; si no, solo se actualizan los valores (así los números se animan).
  const firma = lista.map((e) => e.nombre).join('|');
  if (contenedor.dataset.firma !== firma) {
    contenedor.dataset.firma = firma;
    contenedor.replaceChildren();
    lista.forEach((extra, i) => {
      const medidor = document.createElement('div');
      medidor.className = 'medidor';
      medidor.innerHTML = `
        <div class="medidor-texto">
          <span class="etiqueta-con-boton">
            <span class="etiqueta"></span>
            <span class="porcentaje" id="extra-${i}-porcentaje"></span>
          </span>
          <span class="detalle" id="extra-${i}-detalle"></span>
        </div>
        <div class="barra"><div class="barra-relleno" id="extra-${i}-relleno"></div></div>`;
      medidor.querySelector('.etiqueta').textContent = extra.nombre;
      contenedor.appendChild(medidor);
    });
  }
  lista.forEach((extra, i) => {
    pintarBarra(`extra-${i}-relleno`, extra.porcentaje);
    animarNumero(`extra-${i}-porcentaje`, extra.porcentaje, (v) => `${formatear(v)}%`);
    // Los límites por modelo muestran cuándo se reinician; el crédito extra, cuánto se gastó ("US$16 / US$50")
    if (extra.detalleTexto !== undefined) escribirDetalle(`extra-${i}-detalle`, extra.detalleTexto);
    else escribirReinicio(`extra-${i}-detalle`, extra.reinicioTexto, extra.reinicio);
  });
}

// ----- Datos de uso -----

let ultimosDatos = null; // lo último recibido: { uso, error, prueba, activa, cuentas }
let cuentaMostrada = null; // el id de la cuenta que se está mostrando (para enterarse cuando cambia)

// Dibuja las barras con el último dato recibido.
// "datos" tiene la forma { uso: {...} o null, error: 'mensaje' o null, prueba: true/false }
function mostrarUso(datos) {
  ultimosDatos = datos;
  const { uso, error, prueba } = datos;

  // Las cuentas: la pestañita, el panel y el resumen de la vista completa.
  panelCuentas.mostrar(datos);
  if (cuentaMostrada !== null && datos.activa !== cuentaMostrada && panelActual === 'ajustes') {
    panelAjustes.cargar(); // los límites de Ajustes son de la cuenta que se muestra: se cargan los de la nueva
  }
  cuentaMostrada = datos.activa;

  // En el modo de prueba el uso es inventado: una pestañita "PRUEBA" lo avisa para no confundirnos.
  document.body.classList.toggle('prueba', Boolean(prueba));

  dibujarLimitesExtra(error || !uso ? null : uso.limitesExtra);

  if (error || !uso) {
    // Con error (o mientras carga) las barras quedan vacías y se explica qué pasa.
    pintarBarra('relleno-hoy', null);
    escribirDetalle('hoy-detalle', '—');
    pintarBarra('relleno-semana', null);
    pintarBarra('relleno-sesion', null);
    escribirDetalle('semana-detalle', error ? `⚠ ${error}` : t('lectura.cargando'), Boolean(error));
    escribirDetalle('sesion-detalle', '');
    document.getElementById('semana-porcentaje').textContent = '';
    document.getElementById('sesion-porcentaje').textContent = '';
    delete valoresMostrados['hoy-detalle'];
    delete valoresMostrados['semana-porcentaje'];
    delete valoresMostrados['sesion-porcentaje'];
    refrescarPanel();
    return;
  }

  // Hoy: la barra se llena según qué parte del límite diario llevas usada.
  pintarBarra('relleno-hoy', (uso.hoy / uso.limiteDiario) * 100, colorDiario);
  document.getElementById('hoy-detalle').classList.remove('aviso');
  animarNumero('hoy-detalle', uso.hoy, (v) => t('hoy.de', { hoy: formatear(v), limite: formatear(uso.limiteDiario) }));

  // Semana: la barra, el porcentaje en número (junto a la etiqueta) y la hora de reinicio.
  pintarBarra('relleno-semana', uso.semana);
  animarNumero('semana-porcentaje', uso.semana, (v) => `${formatear(v)}%`);
  escribirReinicio('semana-detalle', uso.reinicioTexto, uso.reinicio);

  // Sesión de 5 horas (si claude.ai no la entrega, la barra queda vacía)
  if (uso.sesion5h) {
    pintarBarra('relleno-sesion', uso.sesion5h.porcentaje);
    animarNumero('sesion-porcentaje', uso.sesion5h.porcentaje, (v) => `${formatear(v)}%`);
    escribirReinicio('sesion-detalle', uso.sesion5h.reinicioTexto, uso.sesion5h.reinicio);
  } else {
    pintarBarra('relleno-sesion', null);
    document.getElementById('sesion-porcentaje').textContent = '';
    delete valoresMostrados['sesion-porcentaje'];
    escribirDetalle('sesion-detalle', t('sesion.sinActividad'));
  }

  refrescarPanel();
}

// ----- Panel desplegable -----
//
// Los íconos de "Hoy" despliegan un panel dentro de la misma ventana (historial, desglose, proyección
// o ajustes). Al abrirlo, la ventana crece (hacia arriba, o hacia abajo si no hay espacio) y al
// cerrarlo vuelve a su tamaño. Cada panel pide su propio alto: Ajustes es más alto que los demás.

// Las claves de los títulos (los textos están en los archivos de idiomas)
const TITULOS_DE_PANEL = {
  historial: 'panel.historial',
  desglose: 'panel.desglose',
  proyeccion: 'panel.proyeccion',
  ajustes: 'panel.ajustes',
  cuentas: 'panel.cuentas',
};
// Tamaño que pide cada panel, en píxeles: el alto, y el ancho solo si es más ancho que la vista (Ajustes lo es).
const TAMANOS_DE_PANEL = {
  historial: { alto: 222 },
  desglose: { alto: 196 },
  proyeccion: { alto: 196 },
  ajustes: { alto: 700, ancho: 720 },
  cuentas: { alto: 250 },
};
const DURACION_PANEL_MS = 340; // debe coincidir con --duracion-panel en widget.css

let panelActual = null;        // 'historial', 'desglose', 'proyeccion', 'ajustes', 'cuentas' o null (cerrado)
let altoDelPanel = TAMANOS_DE_PANEL.historial.alto; // alto con el que está dibujado el panel ahora
let anchoDelPanel = 0;         // ancho que pidió el panel abierto (0 = el de la vista)
let reabrirPanel = null;       // 'ajustes' o 'cuentas' si ese panel estaba abierto cuando se pidió cerrar el panel para cambiar de vista
let temporizadorCierre = null; // espera a que termine la animación antes de encoger la ventana

// En la vista completa los paneles (historial, desglose y proyección) están siempre a la vista.
const esCompleto = () => document.body.classList.contains('completo');

// Alto del lugar de los tres paneles en la vista completa (igual que en widget.css), y la separación entre la tarjeta y un panel.
const ALTO_PANELES_COMPLETO = 250;
const SEPARACION_PANEL = 8;

// Lo que creció la ventana en la vista completa para que quepa Ajustes: el panel de abajo crece lo mismo.
function ponerAltoExtraCompleto(alto) {
  document.documentElement.style.setProperty('--panel-extra', `${alto}px`);
}

// Ajustes y Cuentas, en la vista completa, ocupan el lugar de esos tres paneles.
const PANELES_EN_LUGAR = ['ajustes', 'cuentas'];

// ¿Hay que dibujar este panel ahora? Si está abierto, o si la vista completa lo muestra junto a los demás.
function panelVisible(nombre) {
  if (panelActual === nombre) return true;
  return esCompleto() && !PANELES_EN_LUGAR.includes(panelActual) && !PANELES_EN_LUGAR.includes(nombre);
}

const esperar = (milisegundos) => new Promise((resolver) => setTimeout(resolver, milisegundos));

// Guarda el alto del panel donde lo usa el CSS (--panel-alto).
function ponerAltoDelPanel(alto) {
  altoDelPanel = alto;
  document.documentElement.style.setProperty('--panel-alto', `${alto}px`);
}

// Le pide a la app que haga crecer la ventana para un panel de ese alto.
// Si ya había un panel abierto y el nuevo no cabe en la pantalla, se cierra la ventana y se vuelve a abrir
// (así la app puede elegir de nuevo hacia dónde crecer). Devuelve { haciaArriba }.
async function pedirTamanoDeVentana(alto, ancho) {
  let respuesta = await window.widget.ajustarVentana(true, alto, ancho);
  if (respuesta.noCabe) {
    await window.widget.ajustarVentana(false);
    respuesta = await window.widget.ajustarVentana(true, alto, ancho);
  }
  return respuesta;
}

async function abrirPanel(nombre) {
  if (panelActual === nombre) return cerrarPanel(); // pulsar el mismo ícono otra vez lo cierra

  // En la vista completa no hay nada que desplegar: los paneles ya están a la vista. Solo Ajustes y Cuentas se abren,
  // y ocupan el lugar de los tres paneles (sin cambiar el tamaño de la ventana).
  if (esCompleto()) {
    if (!PANELES_EN_LUGAR.includes(nombre)) return;
    panelActual = nombre;
    document.body.classList.add('ajustes-abierto');
    marcarIconoActivo();
    mostrarVistaDelPanel(nombre);
    // Si el panel necesita más alto que el lugar de los tres paneles (Ajustes sí), la ventana crece hacia abajo.
    const falta = TAMANOS_DE_PANEL[nombre].alto - ALTO_PANELES_COMPLETO - extraAlto;
    if (falta > 0) {
      const { alto } = await window.widget.ajustarVentana(true, falta - SEPARACION_PANEL, 0, true);
      if (panelActual === nombre) ponerAltoExtraCompleto(alto + SEPARACION_PANEL);
    } else {
      ponerAltoExtraCompleto(0);
      await window.widget.ajustarVentana(false);
    }
    return;
  }

  clearTimeout(temporizadorCierre);
  const { alto, ancho = 0 } = TAMANOS_DE_PANEL[nombre];
  const estabaCerrado = panelActual === null;
  panelActual = nombre;
  marcarIconoActivo();
  mostrarVistaDelPanel(nombre);

  if (estabaCerrado) {
    // 1. La ventana crece. 2. Recién entonces se anima el panel (así la animación se ve completa).
    const { haciaArriba, anclaDerecha, alto: altoReal } = await pedirTamanoDeVentana(alto, ancho);
    document.body.classList.toggle('ancla-derecha', Boolean(anclaDerecha)); // si la ventana se ensancha, la tarjeta queda en su lado
    ponerAltoDelPanel(altoReal);
    anchoDelPanel = ancho;
    document.body.classList.toggle('abajo', !haciaArriba);
    document.getElementById('panel').setAttribute('aria-hidden', 'false');
    despuesDelProximoCuadro(() => {
      if (panelActual !== null) document.body.classList.add('panel-abierto');
    });
  } else if (alto !== altoDelPanel || ancho !== anchoDelPanel) {
    // Se pasó a otro panel de distinto tamaño: la ventana y el panel cambian de tamaño en el mismo lugar.
    if (alto > altoDelPanel || ancho > anchoDelPanel) {
      const { haciaArriba, alto: altoReal } = await pedirTamanoDeVentana(alto, ancho); // primero crece la ventana...
      document.body.classList.toggle('abajo', !haciaArriba);
      ponerAltoDelPanel(altoReal);                                                     // ...y después el panel se agranda con animación
      anchoDelPanel = ancho;
    } else {
      ponerAltoDelPanel(alto);                                   // primero el panel se achica con animación...
      await esperar(DURACION_PANEL_MS + 40);
      if (panelActual !== null) {
        await window.widget.ajustarVentana(true, alto, ancho);   // ...y después se achica la ventana
        anchoDelPanel = ancho;
      }
    }
  }
}

// Cierra el panel. Devuelve una promesa que se cumple cuando la ventana ya volvió a su tamaño.
function cerrarPanel() {
  if (panelActual === null) return Promise.resolve();

  // En la vista completa solo hay que volver a mostrar los tres paneles.
  if (esCompleto()) {
    panelActual = null;
    document.body.classList.remove('ajustes-abierto');
    marcarIconoActivo();
    refrescarPanel();
    ponerAltoExtraCompleto(0);
    return window.widget.ajustarVentana(false);
  }

  panelActual = null;
  anchoDelPanel = 0;
  marcarIconoActivo();
  document.body.classList.remove('panel-abierto');
  document.getElementById('panel').setAttribute('aria-hidden', 'true');

  // Primero se anima el cierre y DESPUÉS se encoge la ventana (si no, se cortaría la animación).
  clearTimeout(temporizadorCierre);
  return new Promise((resolver) => {
    temporizadorCierre = setTimeout(async () => {
      if (panelActual === null) await window.widget.ajustarVentana(false);
      resolver();
    }, DURACION_PANEL_MS + 60);
  });
}

// Resalta (en naranja) el ícono cuyo panel está abierto.
function marcarIconoActivo() {
  for (const boton of document.querySelectorAll('[data-panel]')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.panel === panelActual));
  }
}

// Muestra la vista del panel pedida (y oculta las otras), con su título.
function mostrarVistaDelPanel(nombre) {
  document.getElementById('panel-titulo').textContent = t(TITULOS_DE_PANEL[nombre]);
  for (const clave of Object.keys(TITULOS_DE_PANEL)) {
    const vista = document.getElementById(`vista-${clave}`);
    vista.classList.remove('activa');
    if (clave === nombre) {
      void vista.offsetWidth; // fuerza al navegador a reiniciar la animación de entrada
      vista.classList.add('activa');
    }
  }
  // El formulario se rellena con los valores actuales cada vez que se abre (no cada vez que llegan datos,
  // para no borrar lo que estés escribiendo).
  if (nombre === 'ajustes') panelAjustes.cargar();
  refrescarPanel();
}

// Vuelve a dibujar el contenido del panel abierto (al abrirlo y cada vez que llegan datos nuevos).
function refrescarPanel() {
  if (panelVisible('historial')) dibujarHistorial();
  if (panelVisible('desglose')) dibujarDesglose();
  if (panelVisible('proyeccion')) dibujarProyeccion();
}

// Espera un par de cuadros para que el navegador registre el estado inicial y la transición se anime.
function despuesDelProximoCuadro(funcion) {
  requestAnimationFrame(() => requestAnimationFrame(funcion));
}

// --- Historial: una columna por cada uno de los últimos 7 días ---

const ALTO_BARRAS_BASE = 96;  // alto máximo de una columna, en píxeles
let extraAlto = 0;            // cuánto estiraste la ventana a lo alto (en la vista completa, el gráfico crece lo mismo)
const altoDeBarras = () => ALTO_BARRAS_BASE + (esCompleto() ? extraAlto : 0);
const ALTO_ETIQUETA_DIA = 18; // espacio que ocupa el nombre del día bajo cada columna

// Nombre corto del día de la semana a partir de "2026-10-02" → "vie".
function nombreDelDia(fechaTexto) {
  // Se usa mediodía en UTC para que la zona horaria no cambie el día.
  const fecha = new Date(`${fechaTexto}T12:00:00Z`);
  return fecha.toLocaleDateString(localeActual, { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
}

// Cuántos días muestra el historial: 7 o 30 (se recuerda en esta computadora).
let diasDelHistorial = 7;
try {
  if (localStorage.getItem('diasDelHistorial') === '30') diasDelHistorial = 30;
} catch (error) { /* sin almacenamiento: se queda en 7 */ }

function marcarDiasDelHistorial() {
  for (const boton of document.querySelectorAll('[data-dias]')) {
    boton.setAttribute('aria-pressed', String(Number(boton.dataset.dias) === diasDelHistorial));
  }
}

for (const boton of document.querySelectorAll('[data-dias]')) {
  boton.addEventListener('click', () => {
    diasDelHistorial = Number(boton.dataset.dias) === 30 ? 30 : 7;
    try { localStorage.setItem('diasDelHistorial', String(diasDelHistorial)); } catch (error) { /* no importa */ }
    marcarDiasDelHistorial();
    dibujarHistorial();
  });
}
marcarDiasDelHistorial();

async function dibujarHistorial() {
  const { dias, limiteDiario, hoy } = await window.widget.obtenerHistorial(diasDelHistorial);
  const ALTO_BARRAS = altoDeBarras();
  const largo = dias.length > 7;           // 30 días: columnas finas, sin el número encima, y solo algunas fechas
  document.querySelector('#vista-historial .grafico').classList.toggle('largo', largo);

  // Promedio de los días con registro
  const conDato = dias.filter((d) => d.uso !== null);
  const promedio = conDato.length ? conDato.reduce((suma, d) => suma + d.uso, 0) / conDato.length : null;
  document.getElementById('historial-promedio').textContent = promedio === null
    ? ''
    : t('historial.promedio', { valor: formatear(Math.round(promedio * 10) / 10) });
  if (!panelVisible('historial')) return; // se cerró (o cambió) mientras esperábamos los datos

  // Cada día trae su propio límite (puede cambiar de un día a otro si usas límites distintos por día).
  const limiteDe = (d) => (typeof d.limite === 'number' ? d.limite : limiteDiario);
  const limitesIguales = dias.every((d) => limiteDe(d) === limiteDe(dias[0]));

  // La columna más alta es la mayor entre los límites y el uso más alto, con un poco de aire.
  const usoMaximo = Math.max(0, ...dias.map((d) => d.uso || 0));
  const limiteMaximo = Math.max(...dias.map(limiteDe));
  const escala = Math.max(limiteMaximo, usoMaximo) * 1.12;

  // Si el límite es el mismo todos los días: una línea punteada continua.
  // Si cambia de un día a otro: una marca del límite en cada columna.
  const linea = document.getElementById('linea-limite');
  linea.style.display = limitesIguales ? 'block' : 'none';
  if (limitesIguales) {
    linea.style.bottom = `${ALTO_ETIQUETA_DIA + (limiteDe(dias[0]) / escala) * ALTO_BARRAS}px`;
  }

  const contenedor = document.getElementById('columnas');
  contenedor.innerHTML = '';
  const barras = [];

  dias.forEach((entrada, posicion) => {
    const { dia, uso } = entrada;
    const limite = limiteDe(entrada);
    const columna = document.createElement('div');
    columna.className = 'columna';

    const valor = document.createElement('span');
    valor.className = 'valor-dia';
    valor.textContent = uso === null ? '' : `${formatear(uso)}%`;

    const barra = document.createElement('div');
    barra.className = 'barra-dia';
    if (uso === null) {
      barra.classList.add('sin-dato');
    } else {
      barra.style.setProperty('--c', colorDiario(uso / limite));
      barra.style.transitionDelay = `${posicion * 60}ms`; // las columnas suben una tras otra
      barras.push({ barra, alto: (uso / escala) * ALTO_BARRAS });
    }

    const etiqueta = document.createElement('span');
    etiqueta.className = dia === hoy ? 'nombre-dia hoy' : 'nombre-dia';
    if (!largo) {
      etiqueta.textContent = dia === hoy ? t('historial.hoy') : nombreDelDia(dia);
    } else {
      // 30 días: solo el número del día, cada 5 días contando desde hoy (y "hoy" se marca con un punto)
      const desdeHoy = dias.length - 1 - posicion;
      etiqueta.textContent = dia === hoy ? '•' : (desdeHoy % 5 === 0 ? String(Number(dia.slice(8))) : '');
      columna.title = `${dia}: ${uso === null ? '—' : formatear(uso) + '%'}`;
    }

    columna.append(valor, barra, etiqueta);

    // Marca del límite de ese día (solo cuando los límites no son todos iguales)
    if (!limitesIguales) {
      const marca = document.createElement('div');
      marca.className = 'marca-limite';
      marca.style.bottom = `${ALTO_ETIQUETA_DIA + (limite / escala) * ALTO_BARRAS}px`;
      marca.title = t('historial.limiteDia', { limite: formatear(limite) });
      columna.appendChild(marca);
    }

    contenedor.appendChild(columna);
  });

  // Las columnas parten en 0 y "crecen" hasta su alto.
  despuesDelProximoCuadro(() => {
    for (const { barra, alto } of barras) barra.style.height = `${alto}px`;
  });
}

// --- Desglose: barra dividida y lista por producto ---

// Un color fijo para cada producto conocido, para que siempre sea el mismo.
const COLORES_POR_PRODUCTO = {
  claude_code: '#e8895f', // naranja
  chat: '#5fa8e8',        // azul
  cowork: '#a78bfa',      // morado
  other: '#8a8a95',       // gris
};
// Colores de repuesto por si claude.ai agrega un producto nuevo.
const COLORES_DE_REPUESTO = ['#3fbf72', '#f2b84b', '#ec5a5f', '#2dd4bf'];

// El nombre de un producto en el idioma elegido. Si es un producto que no conocemos, se usa el nombre que entrega claude.ai.
function nombreDeProducto(producto) {
  const clave = 'producto.' + producto.clave;
  return existeTexto(clave) ? t(clave) : producto.nombre;
}

function dibujarDesglose() {
  const barra = document.getElementById('barra-total');
  const lista = document.getElementById('lista-desglose');
  const nota = document.getElementById('nota-desglose');
  barra.innerHTML = '';
  lista.innerHTML = '';

  const uso = ultimosDatos && ultimosDatos.uso;
  if (!uso) {
    nota.textContent = t('desglose.sinDatos');
    return;
  }
  if (!uso.desglose) {
    nota.textContent = t('desglose.sinDesglose');
    return;
  }
  nota.textContent = t('desglose.nota', { semana: formatear(uso.semana) });

  // De mayor a menor
  const productos = [...uso.desglose].sort((a, b) => b.porcentaje - a.porcentaje);
  const tramos = [];

  productos.forEach((producto, posicion) => {
    const color = COLORES_POR_PRODUCTO[producto.clave] || COLORES_DE_REPUESTO[posicion % COLORES_DE_REPUESTO.length];

    // Un tramo de la barra, tan ancho como la parte que le corresponde (los productos en 0% no se dibujan).
    if (producto.porcentaje > 0) {
      const tramo = document.createElement('div');
      tramo.className = 'tramo';
      tramo.style.backgroundColor = color;
      barra.appendChild(tramo);
      tramos.push({ tramo, ancho: producto.porcentaje });
    }

    const fila = document.createElement('li');
    fila.className = 'fila';

    const punto = document.createElement('span');
    punto.className = 'punto';
    punto.style.backgroundColor = color;

    const nombre = document.createElement('span');
    nombre.className = 'nombre-producto';
    nombre.textContent = nombreDeProducto(producto);

    const valor = document.createElement('span');
    valor.className = 'valor-producto';
    valor.textContent = `${formatear(producto.porcentaje)}%`;

    fila.append(punto, nombre, valor);
    lista.appendChild(fila);
  });

  // Los tramos parten con ancho 0 y se abren hasta su tamaño.
  despuesDelProximoCuadro(() => {
    for (const { tramo, ancho } of tramos) tramo.style.width = `${ancho}%`;
  });
}

// --- Proyección: "a este ritmo..." ---

// Redondea a un decimal para mostrar "~11,5%".
function aproximado(numero) {
  return formatear(Math.round(numero * 10) / 10);
}

// Textos para la proyección de HOY (límite diario). "tono" es el color de la franja lateral.
function textosDeLaProyeccionDiaria(p) {
  const con = (clave, tono, valores) => ({ titulo: t(clave, valores), detalle: t(clave + '.detalle', valores), tono });
  switch (p.tipo) {
    case 'ya-llegaste': return con('proy.dia.yaLlegaste', ROJO);
    case 'llegaras': return con('proy.dia.llegaras', AMARILLO, { hora: p.cuandoTexto });
    case 'no-llegaras': return con('proy.dia.noLlegaras', VERDE, { fin: aproximado(p.fin) });
    case 'sin-uso': return con('proy.dia.sinUso', VERDE);
    default: return con('proy.dia.sinDatos', '#6e6e78');
  }
}

// Textos para la proyección de la SEMANA (cuota semanal).
function textosDeLaProyeccionSemanal(p, reinicioTexto) {
  const con = (clave, tono, valores) => ({ titulo: t(clave, valores), detalle: t(clave + '.detalle', valores), tono });
  switch (p.tipo) {
    case 'ya-llegaste': return con('proy.semana.yaLlegaste', ROJO, { reinicio: reinicioTexto });
    case 'llegaras': return con('proy.semana.llegaras', AMARILLO, { cuando: p.cuandoTexto, reinicio: reinicioTexto });
    case 'no-llegaras': return con('proy.semana.noLlegaras', VERDE, { fin: aproximado(p.fin) });
    case 'sin-uso': return con('proy.semana.sinUso', VERDE);
    default: return con('proy.semana.sinDatos', '#6e6e78');
  }
}

function dibujarProyeccion() {
  const uso = ultimosDatos && ultimosDatos.uso;
  const proyeccion = uso && uso.proyeccion;

  const sinDatos = { titulo: t('proy.sinDatos'), detalle: t('proy.sinDatos.detalle'), tono: '#6e6e78' };
  const hoy = proyeccion ? textosDeLaProyeccionDiaria(proyeccion.diaria) : sinDatos;
  const semana = proyeccion ? textosDeLaProyeccionSemanal(proyeccion.semanal, uso.reinicioTexto) : sinDatos;

  for (const [clave, textos] of [['hoy', hoy], ['semana', semana]]) {
    document.getElementById(`proyeccion-${clave}-titulo`).textContent = textos.titulo;
    document.getElementById(`proyeccion-${clave}-detalle`).textContent = textos.detalle;
    document.getElementById(`proyeccion-${clave}`).style.setProperty('--tono', textos.tono);
  }
}

// ----- Estado de la sesión -----

// Escribe el mensaje y el botón de la vista de inicio de sesión, según el estado.
function escribirTextosDeSesion(estado) {
  const expirada = estado === 'expirada';
  document.getElementById('mensaje-sesion').textContent = t(expirada ? 'login.expirada' : 'login.sinSesion');
  document.getElementById('boton-sesion').textContent = t(expirada ? 'login.reentrar' : 'login.iniciar');
}

// Según el estado de la sesión, muestra los datos o el botón para entrar.
let ultimoEstado = null; // el último estado de la sesión recibido
function aplicarEstado(estado) {
  ultimoEstado = estado;
  const vistaDatos = document.getElementById('vista-datos');
  const vistaSesion = document.getElementById('vista-sesion');

  if (estado === 'conectado') {
    vistaDatos.classList.remove('oculto');
    vistaSesion.classList.add('oculto');
    ubicarBarraDeHerramientas();
    return;
  }

  // 'sin-sesion' o 'expirada': mostramos el mensaje y el botón (y cerramos el panel, si estaba abierto;
  // cuando se ven todas las cuentas a la vez no, porque desde ahí mismo se entra y se sale de cada cuenta)
  if (!document.body.classList.contains('todas')) cerrarPanel();
  escribirTextosDeSesion(estado);
  vistaDatos.classList.add('oculto');
  vistaSesion.classList.remove('oculto');
}

// ----- Conexión con el resto de la app -----

// Al hacer clic en el botón, se abre la ventana de claude.ai
document.getElementById('boton-sesion').addEventListener('click', () => {
  window.widget.iniciarSesion();
});

// Cada ícono de "Hoy" despliega su panel (y la pestañita de la cuenta, el de las cuentas); el botón ✕ (o la tecla Escape) lo cierra.
for (const boton of document.querySelectorAll('[data-panel]')) {
  boton.addEventListener('click', () => abrirPanel(boton.dataset.panel));
}
document.getElementById('cerrar-panel').addEventListener('click', cerrarPanel);
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    cerrarPanel();
    return;
  }
  // Atajos para la escala de la interfaz: Ctrl + (más grande), Ctrl − (más chico) y Ctrl 0 (vuelve al 100%).
  if (!evento.ctrlKey) return;
  if (evento.key === '+' || evento.key === '=') {
    evento.preventDefault();
    window.widget.cambiarEscala(10);
  } else if (evento.key === '-' || evento.key === '_') {
    evento.preventDefault();
    window.widget.cambiarEscala(-10);
  } else if (evento.key === '0') {
    evento.preventDefault();
    window.widget.fijarEscala(100);
  }
});

// Cuando el estado cambie (entraste, venció la sesión, cerraste sesión), actualizamos la pantalla.
window.widget.alCambiarEstado(aplicarEstado);
// Cuando lleguen datos de uso nuevos (o un error al leerlos), actualizamos las barras.
window.widget.alCambiarUso(mostrarUso);
// Cuando cambie la apariencia (tema, transparencia, vista u orientación), la aplicamos al instante.
// Si cambia la vista o la orientación, se hace con una animación: el contenido se desvanece un instante mientras
// la tarjeta cambia de tamaño (widget.css), y vuelve a aparecer. Así se ve como un "despliegue", sin saltos.
let aparienciaMostrada = null;
function aplicarAparienciaAnimada(apariencia) {
  // Si solo cambió cuánto se estiró la ventana (se llama muchas veces por segundo mientras se arrastra un borde),
  // basta con actualizar eso, sin repintar el resto.
  const antes = aparienciaMostrada;
  const coloresIguales = antes !== null && JSON.stringify(apariencia.colores || null) === JSON.stringify(antes.colores || null);
  const soloTamano = antes !== null && coloresIguales && ['tema', 'opacidad', 'modo', 'orientacion', 'escala', 'todas', 'formatoReinicio']
    .every((clave) => apariencia[clave] === antes[clave]);
  // El formato del reinicio: se aplica al instante a todos los "Reinicio: ...".
  if (apariencia.formatoReinicio && apariencia.formatoReinicio !== formatoReinicio) {
    formatoReinicio = apariencia.formatoReinicio;
    actualizarReinicios();
  }
  const altoAnterior = extraAlto;
  extraAlto = (apariencia.extra && apariencia.extra.alto) || 0;
  if (soloTamano) {
    aparienciaMostrada = apariencia;
    aplicarExtra(apariencia);
    // Al terminar de arrastrar (o restablecer), las columnas del historial se redibujan con el alto nuevo.
    if (!apariencia.redimensionando && extraAlto !== altoAnterior) refrescarPanel();
    return;
  }

  const cambiaLaVista = aparienciaMostrada !== null &&
    (apariencia.modo !== aparienciaMostrada.modo || apariencia.orientacion !== aparienciaMostrada.orientacion);
  aparienciaMostrada = apariencia;

  // El tamaño, la vista y la orientación pueden haber cambiado desde fuera (Ctrl + rueda, botones, menú de la bandeja):
  // se reflejan en el formulario de Ajustes.
  if (apariencia.escala !== undefined) panelAjustes.mostrarEscala(apariencia.escala);
  panelAjustes.mostrarVista(apariencia.modo, apariencia.orientacion);
  // Si había un panel abierto y ya no cabía en la pantalla, la app lo achicó: se usa ese alto.
  if (panelActual !== null && apariencia.altoPanel && apariencia.altoPanel !== altoDelPanel) {
    ponerAltoDelPanel(apariencia.altoPanel);
  }

  // Los botones de vista muestran cuál está activa.
  document.getElementById('boton-compacto').setAttribute('aria-pressed', String(apariencia.modo === 'compacto'));
  document.getElementById('boton-completo').setAttribute('aria-pressed', String(apariencia.modo === 'completo'));
  for (const boton of document.querySelectorAll('[data-alternar="compacto"], [data-alternar="completo"]')) {
    boton.setAttribute('aria-pressed', String(apariencia.modo === boton.dataset.alternar));
  }

  const cambiar = () => {
    const eraCompleto = esCompleto();
    aplicarApariencia(apariencia);
    // Con colores nuevos, las barras se vuelven a pintar.
    if (!coloresIguales && ultimosDatos) mostrarUso(ultimosDatos);
    // Al salir de la vista completa con Ajustes (o Cuentas) abierto, ese panel se cierra (ya no está en su lugar).
    // (se vuelve a abrir en la vista nueva, como pasa con los otros cambios de vista)
    if (eraCompleto && !esCompleto() && PANELES_EN_LUGAR.includes(panelActual)) {
      reabrirPanel = panelActual;
      panelActual = null;
      document.body.classList.remove('ajustes-abierto');
      marcarIconoActivo();
    }
    // Al entrar a la vista completa o al cambiar de orientación, se vuelve a dibujar lo que ahora está a la vista.
    refrescarPanel();
  };

  // Si Ajustes (o Cuentas) estaba abierto y hubo que cerrarlo para cambiar de vista, se vuelve a abrir cuando termina el cambio.
  const reabrirSiHaceFalta = () => {
    if (!cambiaLaVista || !reabrirPanel) return;
    const nombre = reabrirPanel;
    reabrirPanel = null;
    setTimeout(() => abrirPanel(nombre), 450);
  };

  if (!cambiaLaVista || REDUCIR_ANIMACIONES) {
    cambiar();
    reabrirSiHaceFalta();
    return;
  }
  document.body.classList.add('cambiando-modo');   // 1. el contenido se desvanece
  setTimeout(() => {
    cambiar();                                      // 2. se cambia de vista: la tarjeta cambia de tamaño
    setTimeout(() => document.body.classList.remove('cambiando-modo'), 150); // 3. el contenido vuelve a aparecer
    reabrirSiHaceFalta();
  }, 140);
}
window.widget.alCambiarApariencia(aplicarAparienciaAnimada);

// Antes de cambiar de modo, la app avisa qué borde de la tarjeta queda quieto (true = el de abajo, false = el de arriba).
// La tarjeta se acomoda contra ese borde, y así no se mueve de lugar mientras cambia de alto.
window.widget.alCambiarAncla((anclaAbajo) => {
  if (panelActual === null && !esCompleto()) document.body.classList.toggle('abajo', !anclaAbajo);
});
// Los botones de vista: el de una barra pasa a la vista compacta, y el de cuatro cuadritos a la completa.
// Pulsar el mismo botón otra vez vuelve a la vista normal.
document.getElementById('boton-compacto').addEventListener('click', () => {
  window.widget.alternarModo('compacto');
});
document.getElementById('boton-completo').addEventListener('click', () => {
  window.widget.alternarModo('completo');
});
// Los botones de la lista de cuentas (cuando se ven todas a la vez): hacen lo mismo que los de la tarjeta.
for (const boton of document.querySelectorAll('[data-alternar]')) {
  boton.addEventListener('click', () => {
    if (boton.dataset.alternar === 'orientacion') window.widget.alternarOrientacion();
    else window.widget.alternarModo(boton.dataset.alternar);
  });
}
// El botón de columnas/filas cambia entre la disposición vertical y la horizontal.
document.getElementById('boton-orientacion').addEventListener('click', () => {
  window.widget.alternarOrientacion();
});
// La app pide cerrar el panel antes de cambiar de vista (cambia el tamaño de la ventana).
window.widget.alPedirCerrarPanel(() => {
  reabrirPanel = PANELES_EN_LUGAR.includes(panelActual) ? panelActual : null; // si estabas en Ajustes o Cuentas, se vuelve a abrir cuando termine el cambio
  cerrarPanel();
});
// Cuando el menú de la bandeja pida un panel (Historial, Desglose o Proyección), lo desplegamos.
window.widget.alPedirPanel((nombre) => {
  if (panelActual !== nombre) abrirPanel(nombre);
});

// Los bordes y esquinas de la ventana: arrastrarlos la estira (la app mira dónde está el mouse). Doble clic: tamaño de siempre.
for (const agarre of document.querySelectorAll('.agarre')) {
  agarre.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0) return;
    agarre.setPointerCapture(evento.pointerId); // así el arrastre sigue aunque el mouse salga de la ventana
    window.widget.redimensionarInicio(agarre.dataset.borde);
  });
  const terminar = () => window.widget.redimensionarFin();
  agarre.addEventListener('pointerup', terminar);
  agarre.addEventListener('pointercancel', terminar);
  agarre.addEventListener('dblclick', () => window.widget.restablecerTamano());
}

// Ctrl + rueda del mouse sobre el widget: cambia su tamaño de a 5 puntos (hacia arriba agranda, hacia abajo achica).
// Se agrupan las vueltas de la rueda para no mandar decenas de cambios por segundo.
let pasoPendiente = 0;
let temporizadorRueda = null;
window.addEventListener('wheel', (evento) => {
  if (!evento.ctrlKey) return;
  evento.preventDefault();
  pasoPendiente += evento.deltaY < 0 ? 5 : -5;
  if (temporizadorRueda === null) {
    temporizadorRueda = setTimeout(() => {
      window.widget.cambiarEscala(pasoPendiente);
      pasoPendiente = 0;
      temporizadorRueda = null;
    }, 90);
  }
}, { passive: false });

// En la vista vertical, la barra de íconos va justo después de la palabra "Hoy". Como esa palabra cambia de ancho con el
// idioma (en inglés es "Today"), la posición se calcula con su ancho real.
function ubicarBarraDeHerramientas() {
  const etiqueta = document.getElementById('etiqueta-hoy');
  const tarjeta = document.querySelector('.tarjeta');
  // Posición de la palabra dentro de la tarjeta (se miden las dos en pantalla y se restan; el 1 es el borde de la tarjeta)
  const derecha = etiqueta.getBoundingClientRect().right - tarjeta.getBoundingClientRect().left - 1;
  if (derecha > 0) document.documentElement.style.setProperty('--herramientas-izq', `${Math.round(derecha + 10)}px`);
}

// La tarjeta entra con una animación (crece un poco): se vuelve a medir cuando termina, para que la medida sea exacta.
document.querySelector('.tarjeta').addEventListener('animationend', ubicarBarraDeHerramientas);

// Cuando cambie el idioma (desde Ajustes), se vuelven a escribir todos los textos al instante.
function aplicarIdioma(datos) {
  definirIdioma(datos);                       // i18n.js: guarda los textos y reescribe los textos fijos de la página
  if (panelActual) document.getElementById('panel-titulo').textContent = t(TITULOS_DE_PANEL[panelActual]);
  if (ultimoEstado && ultimoEstado !== 'conectado') escribirTextosDeSesion(ultimoEstado);
  if (ultimosDatos) mostrarUso(ultimosDatos); // los textos con números y fechas
  refrescarPanel();                           // el panel abierto (nombres de días, proyección...)
  panelAjustes.traducir();                    // los textos que arma el formulario de Ajustes
  ubicarBarraDeHerramientas();                // la palabra "Hoy" cambia de ancho con el idioma
}
window.widget.alCambiarIdioma(aplicarIdioma);

// Al abrir: primero se pide el idioma (para no mostrar textos a medias), y después la apariencia, el estado
// y el último dato que la app ya tenga.
window.widget.obtenerIdioma().then((datos) => {
  definirIdioma(datos);
  panelAjustes.traducir();
  ubicarBarraDeHerramientas();
  window.widget.obtenerApariencia().then(aplicarAparienciaAnimada);
  window.widget.obtenerEstado().then(aplicarEstado);
  window.widget.obtenerUso().then(mostrarUso);
});
