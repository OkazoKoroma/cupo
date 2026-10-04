// Pruebas de la copia de seguridad y de los cálculos nuevos (horas de más uso, comparación con la semana pasada).
// Se corren con: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const copia = require('../src/copia');
const calculo = require('../src/calculo');

test('copia: lo que se guarda se vuelve a leer igual', () => {
  const datos = {
    intervaloMin: 10, tema: 'claro',
    cuentas: [{ id: 'c1', nombre: '', particion: 'persist:claude', limiteDiario: 20, historial: [{ dia: '2026-10-01', uso: 8, limite: 20 }] }],
  };
  const leida = copia.leer(copia.crear(datos, '0.8.0', new Date('2026-10-03T12:00:00Z')));
  assert.strictEqual(leida.ok, true);
  assert.strictEqual(leida.version, '0.8.0');
  assert.deepStrictEqual(leida.datos, datos);
});

test('copia: un archivo cualquiera no sirve', () => {
  assert.strictEqual(copia.leer('hola').ok, false);
  assert.strictEqual(copia.leer('{"cuentas":[]}').ok, false);
  assert.strictEqual(copia.leer(JSON.stringify({ app: 'headroom-copia', datos: { cuentas: [] } })).ok, false);
});

test('copia: lo desconocido o con otro tipo no pasa, y la sesión de cada cuenta es siempre la suya', () => {
  const texto = JSON.stringify({
    app: 'headroom-copia',
    datos: {
      intervaloMin: 'mucho', raro: 1, tema: 'oscuro',
      cuentas: [
        { id: 'c2', nombre: 'Trabajo', particion: 'otra-cosa', limiteDiario: 'x', umbralAviso: 9, inventado: true },
        { id: 'c2', nombre: 'Repetida' },
        { id: '../x', nombre: 'Mala' },
      ],
    },
  });
  const { ok, datos } = copia.leer(texto);
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(datos, { tema: 'oscuro', cuentas: [{ id: 'c2', nombre: 'Trabajo', particion: 'persist:claude-c2', umbralAviso: 9 }] });
});

const a_las = (hora, dia = '2026-10-06') => new Date(`${dia}T${hora}:00`);

test('horas de más uso: lo que sube entre dos lecturas se reparte entre las horas que pasaron', () => {
  const puntos = [
    { t: a_las('09:00').getTime(), hoy: 0 },
    { t: a_las('09:30').getTime(), hoy: 2 },   // 2 puntos entre las 9:00 y las 9:30
    { t: a_las('12:30').getTime(), hoy: 5 },   // 3 puntos en tres horas: media hora de las 9, las 10, las 11 y media de las 12
  ];
  const horas = calculo.usoPorHora(puntos, a_las('09:00').getTime());
  assert.strictEqual(horas.length, 24);
  assert.deepStrictEqual(horas.slice(9, 13), [2.5, 1, 1, 0.5]);
  assert.strictEqual(Math.round(horas.reduce((a, b) => a + b, 0) * 100) / 100, 5);
});

test('horas de más uso: si la primera lectura ya trae uso (la semana se reinició hoy), se reparte desde ese momento', () => {
  const horas = calculo.usoPorHora([{ t: a_las('10:00').getTime(), hoy: 4 }], a_las('08:00').getTime());
  assert.deepStrictEqual(horas.slice(8, 10), [2, 2]);
  assert.deepStrictEqual(calculo.usoPorHora([], 0), new Array(24).fill(0));
});

test('curva de la semana: un punto por hora, y se lee en línea recta entre dos puntos', () => {
  let curva = calculo.agregarALaCurva([], 0.2, 1);
  curva = calculo.agregarALaCurva(curva, 0.8, 2);   // misma hora: reemplaza
  curva = calculo.agregarALaCurva(curva, 10, 12);
  assert.deepStrictEqual(curva, [[0.8, 2], [10, 12]]);
  assert.strictEqual(calculo.valorDeLaCurva(curva, 0.5), 2);
  assert.strictEqual(Math.round(calculo.valorDeLaCurva(curva, 5.4) * 10) / 10, 7);
  assert.strictEqual(calculo.valorDeLaCurva(curva, 100), 12);
  assert.strictEqual(calculo.valorDeLaCurva([[50, 30]], 10), null); // la curva empezó a guardarse después
});

test('comparar con la semana pasada: con la curva, y si no hay, con el historial por día', () => {
  const inicioSemana = a_las('04:00', '2026-10-05');
  const ahora = a_las('16:00', '2026-10-06'); // 36 horas de empezada
  const curvaPasada = { reinicioMs: inicioSemana.getTime(), puntos: [[0, 0], [24, 10], [48, 30]] };
  assert.deepStrictEqual(
    calculo.compararConSemanaPasada({ semana: 32, inicioSemana, ahora, curvaPasada, historial: [] }),
    { diferencia: 12, antes: 20, aproximado: false },
  );
  // Sin curva: lo usado la semana pasada del lunes 28 a las 04:00 al martes 29 a las 16:00
  const historial = [{ dia: '2026-09-28', uso: 12 }, { dia: '2026-09-29', uso: 9 }];
  const r = calculo.compararConSemanaPasada({ semana: 10, inicioSemana, ahora, curvaPasada: null, historial });
  assert.strictEqual(r.aproximado, true);
  assert.strictEqual(r.antes, 16); // 20 de 24 horas del lunes (10) + 16 de 24 del martes (6)
  assert.strictEqual(r.diferencia, -6);
  // Sin datos de la semana pasada no hay comparación
  assert.strictEqual(calculo.compararConSemanaPasada({ semana: 10, inicioSemana, ahora, curvaPasada: null, historial: [] }), null);
});
