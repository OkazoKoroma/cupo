// ajustes.js: revisa que los ajustes que escribes en el panel de Ajustes sean válidos,
// y maneja la opción "Arrancar con Windows".

const { app } = require('electron');
const { t, OPCIONES_IDIOMA } = require('./idiomas');

// Cada cuántos minutos se puede consultar el uso (nunca menos de 5, para no molestar a claude.ai).
const OPCIONES_INTERVALO = [5, 10, 15, 30, 60];

// Tamaño del widget, en %: 100 es el normal. Lo usan la validación y el atajo Ctrl + rueda del mouse.
const ESCALA_MINIMA = 70;
const ESCALA_MAXIMA = 160;

// Vistas del widget y su orientación (la orientación vale para la vista normal).
const OPCIONES_MODO = ['normal', 'compacto', 'completo', 'cuentas'];
const OPCIONES_ORIENTACION = ['vertical', 'horizontal'];

// Temas de color: oscuro, claro, o automático (sigue el tema de Windows).
const OPCIONES_TEMA = ['oscuro', 'claro', 'auto'];

// Revisa los ajustes recibidos desde el panel. El panel ya valida, pero aquí se vuelve
// a revisar porque nunca hay que fiarse de lo que llega desde una pantalla.
// Devuelve { ok: true, valores } o { ok: false, error: 'mensaje en español' }.
function validar(datos) {
  const limiteDiario = Number(datos.limiteDiario);
  const umbralAviso = Number(datos.umbralAviso);
  const intervaloMin = Number(datos.intervaloMin);

  if (!Number.isFinite(limiteDiario) || limiteDiario < 1 || limiteDiario > 100) {
    return { ok: false, error: t('err.limite') };
  }
  if (!Number.isFinite(umbralAviso) || umbralAviso < 1) {
    return { ok: false, error: t('err.avisoMinimo') };
  }
  if (umbralAviso >= limiteDiario) {
    return { ok: false, error: t('err.avisoMenor') };
  }
  if (!OPCIONES_INTERVALO.includes(intervaloMin)) {
    return { ok: false, error: t('err.intervalo') };
  }
  const umbralSesion = Number(datos.umbralSesion);
  if (!Number.isFinite(umbralSesion) || umbralSesion < 50 || umbralSesion > 99) {
    return { ok: false, error: t('err.umbralSesion') };
  }
  // Aviso de la cuota semanal (si no viene, se usan los valores de siempre)
  const umbralSemana = datos.umbralSemana === undefined ? 85 : Number(datos.umbralSemana);
  if (!Number.isFinite(umbralSemana) || umbralSemana < 50 || umbralSemana > 99) {
    return { ok: false, error: t('err.umbralSemana') };
  }
  if (datos.alertasSemana !== undefined && typeof datos.alertasSemana !== 'boolean') {
    return { ok: false, error: t('err.opcion') };
  }
  if (
    typeof datos.siempreEncima !== 'boolean' ||
    typeof datos.arrancarConWindows !== 'boolean' ||
    typeof datos.alertasSesion !== 'boolean'
  ) {
    return { ok: false, error: t('err.opcion') };
  }

  // Apariencia
  if (!OPCIONES_MODO.includes(datos.modo)) {
    return { ok: false, error: t('err.vista') };
  }
  if (!OPCIONES_ORIENTACION.includes(datos.orientacion)) {
    return { ok: false, error: t('err.disposicion') };
  }
  if (!OPCIONES_IDIOMA.includes(datos.idioma)) {
    return { ok: false, error: t('err.idioma') };
  }
  if (!OPCIONES_TEMA.includes(datos.tema)) {
    return { ok: false, error: t('err.tema') };
  }
  const opacidad = Number(datos.opacidad);
  if (!Number.isFinite(opacidad) || opacidad < 40 || opacidad > 100) {
    return { ok: false, error: t('err.transparencia') };
  }

  const escala = Number(datos.escala);
  if (!Number.isFinite(escala) || escala < ESCALA_MINIMA || escala > ESCALA_MAXIMA) {
    return { ok: false, error: t('err.escala', { min: ESCALA_MINIMA, max: ESCALA_MAXIMA }) };
  }

  // Límites distintos por día: null (el mismo límite todos los días) o 7 números, de lunes a domingo.
  let limitesPorDia = null;
  if (datos.limitesPorDia !== null && datos.limitesPorDia !== undefined) {
    if (!Array.isArray(datos.limitesPorDia) || datos.limitesPorDia.length !== 7) {
      return { ok: false, error: t('err.limitesSiete') };
    }
    limitesPorDia = datos.limitesPorDia.map(Number);
    if (limitesPorDia.some((limite) => !Number.isFinite(limite) || limite < 1 || limite > 100)) {
      return { ok: false, error: t('err.limiteDia') };
    }
    limitesPorDia = limitesPorDia.map((limite) => Math.round(limite * 10) / 10);
  }

  return {
    ok: true,
    valores: {
      // Un decimal como máximo (ej. 12,5)
      limiteDiario: Math.round(limiteDiario * 10) / 10,
      umbralAviso: Math.round(umbralAviso * 10) / 10,
      intervaloMin,
      alertasSesion: datos.alertasSesion,
      umbralSesion: Math.round(umbralSesion),
      alertasSemana: datos.alertasSemana !== false,
      umbralSemana: Math.round(umbralSemana),
      siempreEncima: datos.siempreEncima,
      arrancarConWindows: datos.arrancarConWindows,
      modo: datos.modo,
      orientacion: datos.orientacion,
      tema: datos.tema,
      idioma: datos.idioma,
      opacidad: Math.round(opacidad),
      escala: Math.round(escala),
      limitesPorDia,
      todasLasCuentas: datos.todasLasCuentas !== false,
    },
  };
}

// ----- Arrancar con Windows -----

// Mientras la app no esté instalada (Fase 6), Windows tiene que saber que debe abrir Electron
// apuntando a la carpeta del proyecto; si no, abriría una ventana vacía de Electron.
function opcionesDeInicio() {
  return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };
}

// ¿Está activado hoy "arrancar con Windows"? Se pregunta a Windows directamente.
function arrancaConWindows() {
  return app.getLoginItemSettings(opcionesDeInicio()).openAtLogin;
}

// Activa o desactiva el arranque con Windows (queda en la lista de aplicaciones de inicio).
function cambiarArranqueConWindows(activar) {
  app.setLoginItemSettings({ openAtLogin: activar, ...opcionesDeInicio() });
}

module.exports = {
  OPCIONES_MODO,
  OPCIONES_ORIENTACION,
  ESCALA_MINIMA,
  ESCALA_MAXIMA,
  OPCIONES_INTERVALO,
  OPCIONES_TEMA,
  validar,
  arrancaConWindows,
  cambiarArranqueConWindows,
};
