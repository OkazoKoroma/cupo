// uso.js: lee el uso del plan de Claude desde claude.ai.
//
// OJO: este es el ÚNICO archivo que depende de cómo está hecha la página de claude.ai.
// Anthropic no ofrece una forma oficial de consultar el uso, así que leemos los mismos datos
// que muestra la página Configuración → Uso. Si algún día esa página cambia y el widget
// deja de mostrar el uso, el arreglo se hace aquí y en ningún otro lugar.
//
// Cómo funciona: abrimos una ventana invisible de claude.ai con tu sesión guardada y,
// desde dentro de esa página, pedimos la dirección /api/organizations/<id>/usage
// (la misma que usa la página de Uso). Así claude.ai ve una consulta normal de tu navegador.
// No se guarda nada de esa respuesta en archivos: solo se toman dos números y una fecha.

const { BrowserWindow } = require('electron');

const PAGINA = 'https://claude.ai/settings/usage';
const TIEMPO_MAXIMO_MS = 45 * 1000; // si la página no carga en 45 s, damos por perdida la consulta

// Error con un "tipo" para que el resto de la app sepa qué mensaje mostrar:
//   'sin-internet' → no se pudo cargar claude.ai
//   'sesion'       → claude.ai dice que la sesión no es válida (hay que volver a entrar)
//   'formato'      → llegaron datos, pero no con la forma esperada (claude.ai cambió algo)
class ErrorUso extends Error {
  constructor(tipo, mensaje) {
    super(mensaje);
    this.tipo = tipo;
  }
}

// Código que se ejecuta DENTRO de la página de claude.ai (no en nuestra app).
// 1. Pide la lista de organizaciones de tu cuenta.
// 2. Prueba la dirección de uso en cada una y se queda con la primera que responda bien
//    (tu cuenta puede tener también una organización de API que no tiene este dato).
const CODIGO_EN_LA_PAGINA = `(async () => {
  const respOrgs = await fetch('/api/organizations');
  if (respOrgs.status === 401 || respOrgs.status === 403) return { error: 'sesion' };
  if (!respOrgs.ok) return { error: 'formato' };
  const orgs = await respOrgs.json();
  if (!Array.isArray(orgs)) return { error: 'formato' };
  for (const org of orgs) {
    const r = await fetch('/api/organizations/' + org.uuid + '/usage');
    if (r.ok) return { datos: await r.json(), org: { capacidades: org.capabilities, nivel: org.rate_limit_tier, plan: org.analytics_subscription_plan } };
  }
  return { error: 'formato' };
})()`;

// El tipo de plan, a partir de los datos de la organización: { clave, multiplo } o null si no se reconoce.
//   clave: 'free', 'pro', 'max', 'team' o 'enterprise' | multiplo: 5 o 20 en el plan Max (si claude.ai lo informa)
// Es un dato extra: si no viene o no se entiende, queda en null y no es un error.
function interpretarPlan(org) {
  if (!org || typeof org !== 'object') return null;
  const capacidades = Array.isArray(org.capacidades) ? org.capacidades.map((c) => String(c).toLowerCase()) : [];
  const nivel = String(org.nivel || '').toLowerCase();
  const plan = String(org.plan || '').toLowerCase();
  const todo = [...capacidades, nivel, plan].join(' ');

  if (todo.includes('enterprise')) return { clave: 'enterprise', multiplo: null };
  if (todo.includes('team')) return { clave: 'team', multiplo: null };
  if (todo.includes('max')) {
    const multiplo = /max[_-]?(\d+)x/.exec(todo);
    return { clave: 'max', multiplo: multiplo ? Number(multiplo[1]) : null };
  }
  if (todo.includes('pro')) return { clave: 'pro', multiplo: null };
  if (capacidades.includes('chat')) return { clave: 'free', multiplo: null };
  return null;
}

// Revisa que la respuesta tenga la forma esperada y saca lo que nos interesa.
// Se separa en su propia función para poder probarla sola.
function interpretar(datos) {
  const semana = datos && datos.seven_day;
  if (!semana || typeof semana.utilization !== 'number' || !semana.resets_at) {
    throw new ErrorUso('formato', 'La respuesta de claude.ai no tiene el formato esperado');
  }
  const reinicio = new Date(semana.resets_at);
  if (Number.isNaN(reinicio.getTime())) {
    throw new ErrorUso('formato', 'La fecha de reinicio no se pudo leer');
  }

  // Sesión de 5 horas: es un dato extra. Si no viene (por ejemplo, no hay una ventana activa),
  // no es un error: simplemente queda en null.
  const cinco = datos.five_hour;
  let sesion5h = null;
  if (cinco && typeof cinco.utilization === 'number' && cinco.resets_at) {
    const reinicio5h = new Date(cinco.resets_at);
    if (!Number.isNaN(reinicio5h.getTime())) {
      sesion5h = { porcentaje: cinco.utilization, reinicio: reinicio5h };
    }
  }

  // Desglose de la semana por producto (Claude Code, Chats, Cowork...). También es un dato extra:
  // si no viene o no tiene la forma esperada, queda en null y no es un error.
  // Cada "porcentaje" es la parte del uso de la semana que corresponde a ese producto (suman 100).
  const filas = datos.seven_day_breakdown && datos.seven_day_breakdown.rows;
  let desglose = null;
  if (Array.isArray(filas)) {
    const validas = filas
      .filter((fila) => fila && typeof fila.display_name === 'string' && typeof fila.percent === 'number')
      .map((fila) => ({ clave: String(fila.key), nombre: fila.display_name, porcentaje: fila.percent }));
    if (validas.length > 0) desglose = validas;
  }

  // Límites semanales extra de un modelo (por ejemplo "Fable" en el plan Max). Vienen en la lista "limits" con el nombre del modelo.
  // También es un dato extra: si no hay, queda en null. Se ignora lo que no tiene nombre (no sabríamos qué es).
  const limitesExtra = [];
  if (Array.isArray(datos.limits)) {
    for (const limite of datos.limits) {
      if (!limite || limite.group !== 'weekly' || limite.kind === 'weekly_all' || typeof limite.percent !== 'number') continue;
      const modelo = limite.scope && limite.scope.model && limite.scope.model.display_name;
      const reinicioExtra = new Date(limite.resets_at);
      if (typeof modelo !== 'string' || !modelo.trim() || Number.isNaN(reinicioExtra.getTime())) continue;
      limitesExtra.push({ nombre: modelo.trim(), porcentaje: limite.percent, reinicio: reinicioExtra });
    }
  }

  // Crédito extra (uso extra / créditos de uso): solo si está activado y tiene un tope mensual (si no, no hay porcentaje que mostrar).
  // Los montos vienen en la unidad más chica de la moneda (centavos) con su "exponent": 1600 con exponent 2 = 16,00.
  const dinero = (monto) => (monto && typeof monto === 'object' && typeof monto.amount_minor === 'number'
    ? { minor: monto.amount_minor, moneda: typeof monto.currency === 'string' ? monto.currency : 'USD', exponente: Number.isInteger(monto.exponent) ? monto.exponent : 2 }
    : null);
  let creditos = null;
  const gasto = datos.spend;
  const adicional = datos.extra_usage;
  if (gasto && gasto.enabled === true && typeof gasto.percent === 'number' && dinero(gasto.limit) && dinero(gasto.limit).minor > 0) {
    creditos = { porcentaje: gasto.percent, usado: dinero(gasto.used), limite: dinero(gasto.limit) };
  } else if (adicional && adicional.is_enabled === true && typeof adicional.utilization === 'number' && adicional.monthly_limit) {
    creditos = { porcentaje: adicional.utilization, usado: null, limite: null }; // sin montos: no se sabe con certeza su unidad
  }

  return {
    semana: semana.utilization, // % de la cuota semanal usado (ej. 6 = 6%)
    reinicio,                   // fecha y hora en que la cuota semanal vuelve a cero
    sesion5h,                   // { porcentaje, reinicio } de la ventana de 5 horas, o null
    desglose,                   // [{ clave, nombre, porcentaje }] por producto, o null
    creditos,                   // { porcentaje, usado, limite } del crédito extra del mes, o null si no está activado o no tiene tope
    limitesExtra: limitesExtra.length > 0 ? limitesExtra : null, // [{ nombre, porcentaje, reinicio }] por modelo (ej. Fable), o null
  };
}

// Consulta el uso de la cuenta que vive en esa partición (su espacio de sesión).
// Devuelve { semana, reinicio, sesion5h, desglose, plan } o lanza un ErrorUso.
async function leerUso(particion) {
  // Ventana invisible: nunca se ve en pantalla y se destruye al terminar.
  const ventana = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: particion, // aquí vive la sesión guardada de esa cuenta
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  try {
    // Cargar la página, con límite de tiempo.
    const espera = new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new ErrorUso('sin-internet', 'Tiempo agotado')), TIEMPO_MAXIMO_MS)
    );
    const carga = ventana.loadURL(PAGINA).catch((error) => {
      // ERR_ABORTED (-3) ocurre cuando la página se redirige sola (por ejemplo al login): no es un fallo.
      if (error.errno === -3) return;
      throw new ErrorUso('sin-internet', error.message);
    });
    await Promise.race([carga, espera]);

    // Pedir los datos desde dentro de la página.
    let respuesta;
    try {
      respuesta = await ventana.webContents.executeJavaScript(CODIGO_EN_LA_PAGINA);
    } catch (error) {
      // Por ejemplo, claude.ai devolvió una página en vez de datos.
      throw new ErrorUso('formato', error.message);
    }

    if (respuesta.error === 'sesion') {
      throw new ErrorUso('sesion', 'La sesión de claude.ai no es válida');
    }
    if (respuesta.error) {
      throw new ErrorUso('formato', 'No se encontró el uso en claude.ai');
    }
    const resultado = interpretar(respuesta.datos);
    resultado.plan = interpretarPlan(respuesta.org);
    return resultado;
  } finally {
    if (!ventana.isDestroyed()) ventana.destroy();
  }
}

module.exports = { leerUso, interpretar, interpretarPlan, ErrorUso };
