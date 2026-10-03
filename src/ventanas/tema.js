// tema.js: aplica la apariencia elegida en Ajustes (tema, transparencia y modo compacto).
// Lo usa el widget (y su panel de Ajustes). La app principal manda la apariencia con este formato:
//   { tema: 'oscuro' | 'claro' | 'auto', opacidad: 40 a 100,
//     modo: 'normal' | 'compacto' | 'completo', orientacion: 'vertical' | 'horizontal' }

let aparienciaActual = { tema: 'oscuro', opacidad: 100, modo: 'normal', orientacion: 'vertical' };

// Pone el tema (oscuro o claro) y la transparencia. "auto" sigue el tema de Windows.
function aplicarApariencia(apariencia) {
  aparienciaActual = apariencia;

  const windowsEsClaro = window.matchMedia('(prefers-color-scheme: light)').matches;
  const claro = apariencia.tema === 'claro' || (apariencia.tema === 'auto' && windowsEsClaro);
  document.body.dataset.tema = claro ? 'claro' : 'oscuro';

  // La transparencia solo afecta al fondo (el texto y las barras se siguen viendo nítidos).
  document.documentElement.style.setProperty('--op', String(apariencia.opacidad / 100));
  // La vista se refleja en clases del cuerpo, que widget.css usa para acomodar todo:
  //   compacto: una sola línea | completo: barras arriba y paneles abajo | horizontal: barras lado a lado
  //   franja: el estilo de "barras lado a lado" (lo usan la vista horizontal y la completa)
  const modo = apariencia.modo || 'normal';
  const horizontal = modo === 'normal' && apariencia.orientacion === 'horizontal';
  document.body.classList.toggle('compacto', modo === 'compacto');
  document.body.classList.toggle('completo', modo === 'completo');
  document.body.classList.toggle('horizontal', horizontal);
  document.body.classList.toggle('franja', horizontal || modo === 'completo');
}

// Si el tema es "auto" y cambias el tema de Windows, el widget lo sigue al instante.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  aplicarApariencia(aparienciaActual);
});
