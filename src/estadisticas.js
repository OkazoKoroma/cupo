// estadisticas.js: saca conclusiones de lo que la app ya tiene guardado (sin consultar nada a claude.ai):
// récords y rachas, qué días y a qué horas se usa más, cuánto sobra cada semana, un límite diario sugerido,
// las sesiones de 5 horas agotadas y un resumen mes a mes.
//
// Este archivo no usa Electron ni lee archivos: recibe datos y devuelve resultados (así se puede probar).

const { ultimosDias } = require('./calculo');

const redondear = (valor) => Math.round(valor * 10) / 10;
const promedio = (lista) => (lista.length ? lista.reduce((suma, v) => suma + v, 0) / lista.length : null);
// Día de la semana de "2026-10-05": 0 = lunes ... 6 = domingo.
const diaDeSemana = (dia) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;

// Recibe:
//   historial      → [{ dia, uso, limite, horas }] todo lo guardado (hasta unos 400 días)
//   semanasPasadas → [{ inicio, semana }] las semanas terminadas
//   sesiones       → [{ inicioMs, finMs, maximo, llenaMs }] las sesiones de 5 horas terminadas
//   limiteDiario   → el límite de Ajustes (para los días que no guardaron el suyo)
//   ahora          → fecha de ahora
// Devuelve un objeto con todo calculado (cada cosa es null si todavía no hay datos para decirla).
function calcular({ historial = [], semanasPasadas = [], sesiones = [], limiteDiario = 14, ahora = new Date() }) {
  const porDia = new Map(historial.filter((d) => d && Number.isFinite(d.uso)).map((d) => [d.dia, d]));
  const limiteDe = (registro) => (Number.isFinite(registro.limite) ? registro.limite : limiteDiario);
  const dias30 = ultimosDias(ahora, 30).map((dia) => porDia.get(dia)).filter(Boolean);

  // --- Récords y rachas (últimos 30 días)
  const masAlto = dias30.reduce((mayor, d) => (!mayor || d.uso > mayor.uso ? d : mayor), null);
  const sobreElLimite = dias30.filter((d) => d.uso >= limiteDe(d)).length;
  // Racha: días seguidos (de hoy hacia atrás) bajo el límite. Un día sin registro no corta la racha ni la suma.
  let racha = 0;
  for (const dia of ultimosDias(ahora, 400).reverse()) {
    const registro = porDia.get(dia);
    if (!registro) continue;
    if (registro.uso >= limiteDe(registro)) break;
    racha += 1;
  }

  // --- Qué días de la semana se usa más (promedio de cada uno, en los últimos 30 días)
  const porDiaSemana = [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const valor = promedio(dias30.filter((d) => diaDeSemana(d.dia) === n).map((d) => d.uso));
    return valor === null ? null : redondear(valor);
  });

  // --- Mapa de la semana: día × hora (promedio de cada casilla, con los días que guardaron su uso por hora)
  const conHoras = dias30.filter((d) => Array.isArray(d.horas) && d.horas.length === 24);
  const mapa = conHoras.length === 0 ? null : [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const delDia = conHoras.filter((d) => diaDeSemana(d.dia) === n);
    return Array.from({ length: 24 }, (_, hora) => (delDia.length ? Math.round(promedio(delDia.map((d) => Number(d.horas[hora]) || 0)) * 100) / 100 : null));
  });

  // --- Cuánto sobra cada semana (con las semanas terminadas)
  const finales = semanasPasadas.map((s) => s && s.semana).filter(Number.isFinite);
  const semanas = finales.length === 0 ? null : {
    cantidad: finales.length,
    termina: redondear(promedio(finales)),
    sobra: redondear(promedio(finales.map((v) => Math.max(0, 100 - v)))),
  };

  // --- Límite diario sugerido: repartir el 95% de la semana entre los días que de verdad se usa Claude.
  // (con al menos 7 días guardados; "días de uso" = los que pasaron de medio punto)
  let sugerido = null;
  if (dias30.length >= 7) {
    const deUso = dias30.filter((d) => d.uso >= 0.5).length;
    const porSemana = Math.max(1, Math.min(7, Math.round((deUso / dias30.length) * 7)));
    sugerido = { limite: Math.max(5, Math.min(50, Math.round((95 / porSemana) * 2) / 2)), diasPorSemana: porSemana };
  }

  // --- Sesiones de 5 horas: cuántas se agotaron en los últimos 7 días, y a qué hora suele pasar
  const hace7 = ahora.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recientes = sesiones.filter((s) => s && s.finMs >= hace7);
  const agotadas = sesiones.filter((s) => s && Number.isFinite(s.llenaMs));
  let horaTipica = null;
  if (agotadas.length) {
    const cuenta = new Array(24).fill(0);
    for (const s of agotadas) cuenta[new Date(s.llenaMs).getHours()] += 1;
    horaTipica = cuenta.indexOf(Math.max(...cuenta));
  }
  const resumenDeSesiones = sesiones.length === 0 ? null : {
    total7: recientes.length,
    agotadas7: recientes.filter((s) => Number.isFinite(s.llenaMs)).length,
    horaTipica,
  };

  // --- Mes a mes (con todo el historial)
  const meses = new Map();
  for (const d of porDia.values()) {
    const mes = d.dia.slice(0, 7);
    if (!meses.has(mes)) meses.set(mes, []);
    meses.get(mes).push(d);
  }
  const porMes = [...meses.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, lista]) => ({
    mes,
    dias: lista.filter((d) => d.uso >= 0.5).length,
    total: redondear(lista.reduce((suma, d) => suma + d.uso, 0)),
    promedio: redondear(promedio(lista.map((d) => d.uso))),
    masAlto: redondear(Math.max(...lista.map((d) => d.uso))),
  }));

  return {
    dias: dias30.length,
    masAlto: masAlto && { dia: masAlto.dia, uso: redondear(masAlto.uso) },
    promedio: dias30.length ? redondear(promedio(dias30.map((d) => d.uso))) : null,
    racha,
    sobreElLimite,
    porDiaSemana,
    mapa,
    semanas,
    sugerido,
    sesiones: resumenDeSesiones,
    porMes,
    ultimos: dias30.map((d) => ({ dia: d.dia, uso: redondear(d.uso), limite: limiteDe(d) })),
  };
}

module.exports = { calcular };
