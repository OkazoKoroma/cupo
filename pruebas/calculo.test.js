// Pruebas de los cálculos (uso de hoy, límites, aviso semanal). Se corren con: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const calculo = require('../src/calculo');

const a_las = (hora) => new Date(`2026-10-06T${hora}:00`); // un martes

test('uso de hoy: la primera lectura es el punto de partida y las siguientes suman', () => {
  let r = calculo.procesarLectura({ estado: null, historial: [], semana: 30, ahora: a_las('09:00'), limite: 14, umbralAviso: 10 });
  assert.strictEqual(r.hoy, 0);
  r = calculo.procesarLectura({ estado: r.estado, historial: r.historial, semana: 38, ahora: a_las('12:00'), limite: 14, umbralAviso: 10 });
  assert.strictEqual(r.hoy, 8);
  assert.deepStrictEqual(r.historial.map((d) => d.uso), [8]);
});

test('uso de hoy: aviso previo y límite llegan una sola vez', () => {
  let r = calculo.procesarLectura({ estado: null, historial: [], semana: 0, ahora: a_las('09:00'), limite: 14, umbralAviso: 10 });
  r = calculo.procesarLectura({ estado: r.estado, historial: r.historial, semana: 11, ahora: a_las('10:00'), limite: 14, umbralAviso: 10 });
  assert.deepStrictEqual(r.alertas, ['aviso']);
  r = calculo.procesarLectura({ estado: r.estado, historial: r.historial, semana: 12, ahora: a_las('10:30'), limite: 14, umbralAviso: 10 });
  assert.deepStrictEqual(r.alertas, []);
  r = calculo.procesarLectura({ estado: r.estado, historial: r.historial, semana: 15, ahora: a_las('11:00'), limite: 14, umbralAviso: 10 });
  assert.deepStrictEqual(r.alertas, ['limite']);
});

test('uso de hoy: si la cuota semanal se reinicia durante el día, se sigue sumando', () => {
  let r = calculo.procesarLectura({ estado: null, historial: [], semana: 90, ahora: a_las('02:00'), limite: 14, umbralAviso: 10 });
  r = calculo.procesarLectura({ estado: r.estado, historial: r.historial, semana: 95, ahora: a_las('03:00'), limite: 14, umbralAviso: 10 });
  r = calculo.procesarLectura({ estado: r.estado, historial: r.historial, semana: 2, ahora: a_las('05:00'), limite: 14, umbralAviso: 10 });
  assert.strictEqual(r.hoy, 7); // 5 antes del reinicio + 2 después
});

test('límites por día: el aviso previo guarda la proporción', () => {
  const lunes = new Date('2026-10-05T12:00:00');
  const { limite, umbral } = calculo.limitesDelDia({ limiteBase: 14, umbralBase: 10, limitesPorDia: [28, 14, 14, 14, 14, 7, 7], ahora: lunes });
  assert.strictEqual(limite, 28);
  assert.strictEqual(umbral, 20);
});

test('límite automático: lo que queda de la semana entre los días que faltan', () => {
  const ahora = a_las('15:00');
  assert.strictEqual(calculo.limiteAutomatico({ semanaAlEmpezar: 30, reinicio: new Date('2026-10-09T04:00:00'), ahora }), 23.3);
  assert.strictEqual(calculo.limiteAutomatico({ semanaAlEmpezar: 0, reinicio: new Date('2026-10-13T04:00:00'), ahora }), 14.3);
  assert.strictEqual(calculo.limiteAutomatico({ semanaAlEmpezar: 99.9, reinicio: new Date('2026-10-07T04:00:00'), ahora }), 1);
});

test('límite automático: el % con que empezó el día', () => {
  const ahora = a_las('15:00');
  assert.strictEqual(calculo.semanaAlEmpezarElDia({ estado: { dia: '2026-10-06', puntoPartida: 25 }, semana: 40, ahora }), 25);
  assert.strictEqual(calculo.semanaAlEmpezarElDia({ estado: { dia: '2026-10-05', puntoPartida: 25 }, semana: 40, ahora }), 40);
  assert.strictEqual(calculo.semanaAlEmpezarElDia({ estado: null, semana: 40, inicioSemana: a_las('01:00'), ahora }), 0);
});

test('aviso semanal: una vez por semana', () => {
  const reinicio = new Date('2026-10-09T04:00:00');
  let r = calculo.procesarSemana({ estado: null, semana: 86, reinicio, umbral: 85 });
  assert.deepStrictEqual(r.alertas, ['semana-aviso']);
  r = calculo.procesarSemana({ estado: r.estado, semana: 90, reinicio, umbral: 85 });
  assert.deepStrictEqual(r.alertas, []);
  r = calculo.procesarSemana({ estado: r.estado, semana: 88, reinicio: new Date('2026-10-16T04:00:00'), umbral: 85 });
  assert.deepStrictEqual(r.alertas, ['semana-aviso']);
});

test('últimos días: del más antiguo a hoy', () => {
  assert.deepStrictEqual(calculo.ultimosDias(a_las('12:00'), 3), ['2026-10-04', '2026-10-05', '2026-10-06']);
});
