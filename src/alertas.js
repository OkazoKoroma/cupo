// alertas.js: notificaciones de Windows (los avisos que aparecen en la esquina de la pantalla).
// Todos los textos salen del idioma elegido (ver idiomas.js).

const { Notification } = require('electron');
const { rutaDeAsset } = require('./rutas');
const { t, locale } = require('./idiomas');

// Formato de números según el idioma: coma para los decimales en español (12,5), punto en inglés (12.5).
function formatear(numero) {
  return numero.toLocaleString(locale(), { maximumFractionDigits: 1 });
}

// Muestra una notificación de Windows.
function mostrar(titulo, mensaje) {
  console.log(`Notificación enviada: ${titulo} | ${mensaje}`);
  if (!Notification.isSupported()) return;
  new Notification({
    title: titulo,
    body: mensaje,
    icon: rutaDeAsset('icono.png'),
  }).show();
}

// Antepone el nombre de la cuenta al título: "[Trabajo] Llegaste a tu límite...". Sin nombre, el título queda igual.
function conCuenta(titulo, cuenta) {
  return cuenta ? `[${cuenta}] ${titulo}` : titulo;
}

// Envía la alerta del límite diario que corresponda.
//   tipo        → 'aviso' (te acercas al límite) o 'limite' (lo alcanzaste)
//   hoy         → % usado hoy
//   limite      → límite diario en %
//   cuenta      → nombre de la cuenta (solo si hay varias: se antepone al título para saber de cuál es el aviso)
function enviar(tipo, hoy, limite, cuenta) {
  const cuerpo = t('alerta.diario.cuerpo', { hoy: formatear(hoy), limite: formatear(limite) });
  if (tipo === 'limite') {
    mostrar(conCuenta(t('alerta.limite.titulo'), cuenta), cuerpo);
  } else if (tipo === 'aviso') {
    mostrar(conCuenta(t('alerta.aviso.titulo'), cuenta), cuerpo);
  }
}

// Avisa que el historial se guardó en un archivo.
function enviarExportado(cantidad, ruta) {
  mostrar(
    t('alerta.exportado.titulo'),
    cantidad === 1 ? t('alerta.exportado.uno', { ruta }) : t('alerta.exportado.varios', { n: cantidad, ruta })
  );
}

// Avisa que claude.ai parece haber cambiado su página y el widget ya no entiende los datos.
function enviarProblemaDeFormato() {
  mostrar(t('alerta.formato.titulo'), t('alerta.formato.cuerpo'));
}

// Envía una alerta de la sesión de 5 horas.
//   tipo           → 'sesion-aviso', 'sesion-limite' o 'sesion-reiniciada'
//   porcentaje     → % usado de la sesión (null si no se conoce)
//   reinicioTexto  → hora a la que se reinicia la sesión, ej. "14:40" (null si no se conoce)
//   cuenta         → nombre de la cuenta (solo si hay varias)
function enviarSesion(tipo, porcentaje, reinicioTexto, cuenta) {
  if (tipo === 'sesion-aviso') {
    const cuando = reinicioTexto ? t('alerta.sesionReinicia', { hora: reinicioTexto }) : '';
    mostrar(
      conCuenta(t('alerta.sesionAviso.titulo'), cuenta),
      t('alerta.sesionAviso.cuerpo', { porcentaje: formatear(porcentaje) }) + cuando
    );
  } else if (tipo === 'sesion-limite') {
    mostrar(
      conCuenta(t('alerta.sesionLimite.titulo'), cuenta),
      reinicioTexto ? t('alerta.sesionLimite.conHora', { hora: reinicioTexto }) : t('alerta.sesionLimite.sinHora')
    );
  } else if (tipo === 'sesion-reiniciada') {
    mostrar(conCuenta(t('alerta.sesionReiniciada.titulo'), cuenta), t('alerta.sesionReiniciada.cuerpo'));
  }
}

module.exports = { enviar, enviarSesion, enviarProblemaDeFormato, enviarExportado };
