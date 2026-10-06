// informe.js: arma el informe de uso como una página (HTML) que se abre en el navegador y se puede imprimir o guardar como PDF.
// Usa solo lo que ya calculó estadisticas.js; no consulta nada. Los textos salen del idioma elegido.

const { t, locale } = require('./idiomas');

const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const numero = (valor) => (Number.isFinite(valor) ? valor.toLocaleString(locale(), { maximumFractionDigits: 1 }) : '—');
const fechaLarga = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const nombreDelMes = (mes) => new Date(`${mes}-15T12:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
const nombreDelDia = (n) => new Date(Date.UTC(2024, 0, 1 + n, 12)).toLocaleDateString(locale(), { weekday: 'long', timeZone: 'UTC' }); // (el 1 de enero de 2024 fue lunes)

// "datos" es lo que devuelve estadisticas.calcular; "cuenta" el nombre de la cuenta (o nada si hay una sola).
function construir(datos, { cuenta, ahora = new Date() } = {}) {
  const ficha = (titulo, valor, detalle = '') => `<div class="ficha"><span>${escapar(titulo)}</span><b>${escapar(valor)}</b><i>${escapar(detalle)}</i></div>`;
  const fichas = [
    ficha(t('est.masAlto'), datos.masAlto ? `${numero(datos.masAlto.uso)}%` : '—', datos.masAlto ? fechaLarga(datos.masAlto.dia) : ''),
    ficha(t('est.promedio'), datos.promedio !== null ? `${numero(datos.promedio)}%` : '—', t('est.de30')),
    ficha(t('est.racha'), t('est.dias', { n: datos.racha })),
    ficha(t('est.sobre'), t('est.dias', { n: datos.sobreElLimite }), t('est.de30')),
    ficha(t('est.sobra'), datos.semanas ? `${numero(datos.semanas.sobra)}%` : '—', datos.semanas ? t('est.semanas', { n: datos.semanas.cantidad }) : ''),
    ficha(t('est.sugerido'), datos.sugerido ? `${numero(datos.sugerido.limite)}%` : '—', datos.sugerido ? t('est.sugerido.detalle', { n: datos.sugerido.diasPorSemana }) : ''),
    ficha(t('est.sesiones'), datos.sesiones ? t('est.sesiones.detalle', { a: datos.sesiones.agotadas7, n: datos.sesiones.total7 }) : '—',
      datos.sesiones && datos.sesiones.horaTipica !== null ? t('est.hora', { hora: `${String(datos.sesiones.horaTipica).padStart(2, '0')}:00` }) : ''),
  ].join('');

  const fila = (celdas, etiqueta = 'td') => `<tr>${celdas.map((c) => `<${etiqueta}>${escapar(c)}</${etiqueta}>`).join('')}</tr>`;
  const semana = datos.porDiaSemana.some((v) => v !== null)
    ? `<h2>${escapar(t('est.porDia'))}</h2><table>${fila(datos.porDiaSemana.map((_, n) => nombreDelDia(n)), 'th')}${fila(datos.porDiaSemana.map((v) => (v === null ? '—' : `${numero(v)}%`)))}</table>`
    : '';
  const meses = datos.porMes.length
    ? `<h2>${escapar(t('informe.porMes'))}</h2><table>${fila([t('informe.mes'), t('informe.diasConUso'), t('est.promedio'), t('est.masAlto'), t('informe.total')], 'th')}${
      datos.porMes.map((m) => fila([nombreDelMes(m.mes), String(m.dias), `${numero(m.promedio)}%`, `${numero(m.masAlto)}%`, `${numero(m.total)}%`])).join('')}</table>`
    : '';
  const ultimos = datos.ultimos.length
    ? `<h2>${escapar(t('informe.ultimos'))}</h2><table>${fila([t('informe.dia'), t('informe.uso'), t('informe.limite')], 'th')}${
      datos.ultimos.map((d) => `<tr${d.uso >= d.limite ? ' class="sobre"' : ''}><td>${escapar(fechaLarga(d.dia))}</td><td>${numero(d.uso)}%</td><td>${numero(d.limite)}%</td></tr>`).join('')}</table>`
    : '';

  const generado = t('informe.generado', { fecha: ahora.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) });
  return `<!DOCTYPE html>
<html lang="${escapar(locale())}"><head><meta charset="UTF-8"><title>${escapar(t('informe.titulo'))}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1c1c22; max-width: 820px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: .8px; color: #b5562f; }
  p.sub { margin: 0 0 20px; color: #666; font-size: 13px; }
  .fichas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .ficha { border: 1px solid #ddd; border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px; }
  .ficha span { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #666; } .ficha b { font-size: 20px; } .ficha i { font-size: 12px; color: #666; font-style: normal; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; } th, td { border-bottom: 1px solid #e3e3e3; padding: 5px 8px; text-align: left; } th { color: #555; font-weight: 600; }
  tr.sobre td { color: #b3261e; font-weight: 600; }
  @media print { body { margin: 0 auto; } }
</style></head><body>
<h1>${escapar(t('informe.titulo'))}${cuenta ? ` · ${escapar(cuenta)}` : ''}</h1>
<p class="sub">${escapar(generado)}. ${escapar(t('est.nota'))}</p>
<div class="fichas">${fichas}</div>
${semana}${meses}${ultimos}
</body></html>
`;
}

module.exports = { construir };
