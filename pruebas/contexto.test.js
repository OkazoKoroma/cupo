// Pruebas de la ventana de contexto de Claude Code (con chats inventados en una carpeta temporal). Se corren con: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const contexto = require('../src/contexto');

// Crea una carpeta como la de Claude Code con chats inventados: [{ archivo, titulo, tokens, modelo, haceMin }]
function carpetaConChats(chats) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-chats-'));
  for (const chat of chats) {
    const ruta = path.join(carpeta, chat.archivo);
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const lineas = [
      { type: 'custom-title', customTitle: chat.titulo },
      { type: 'assistant', sessionId: chat.archivo, message: { model: chat.modelo, usage: { input_tokens: 0, cache_read_input_tokens: chat.tokens, cache_creation_input_tokens: 0, output_tokens: 0 } } },
    ];
    fs.writeFileSync(ruta, lineas.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const cuando = new Date(Date.now() - chat.haceMin * 60 * 1000);
    fs.utimesSync(ruta, cuando, cuando);
  }
  return carpeta;
}

test('lee los chats recientes, del más nuevo al más viejo, con su %', () => {
  const carpeta = carpetaConChats([
    { archivo: 'a/1.jsonl', titulo: 'Uno', tokens: 100000, modelo: 'claude-opus-4-5', haceMin: 30 },
    { archivo: 'b/2.jsonl', titulo: 'Dos', tokens: 500000, modelo: 'claude-opus-5-5', haceMin: 5 },
    { archivo: 'b/3.jsonl', titulo: 'Viejo', tokens: 10, modelo: 'claude-opus-5-5', haceMin: 60 * 5 },
  ]);
  const chats = contexto.leerChats({ carpeta });
  assert.deepStrictEqual(chats.map((c) => c.titulo), ['Dos', 'Uno']); // el de hace 5 horas no aparece
  assert.strictEqual(chats[0].porcentaje, 50);  // 500k de 1M (modelo de la familia 5)
  assert.strictEqual(chats[1].porcentaje, 50);  // 100k de 200k
});

test('el tamaño elegido en Ajustes manda', () => {
  const carpeta = carpetaConChats([{ archivo: 'a/1.jsonl', titulo: 'Uno', tokens: 100000, modelo: 'claude-opus-5-5', haceMin: 1 }]);
  assert.strictEqual(contexto.leerChats({ carpeta, tamano: '200k' })[0].porcentaje, 50);
  assert.strictEqual(contexto.leerChats({ carpeta, tamano: '1m' })[0].porcentaje, 10);
});

test('sin Claude Code (no existe la carpeta) no falla', () => {
  assert.deepStrictEqual(contexto.leerChats({ carpeta: path.join(os.tmpdir(), 'no-existe-headroom') }), []);
});

test('el aviso para compactar: al pasar el umbral y cada 10% más; al bajar, empieza de nuevo', () => {
  const estado = { sesion: null, avisadoHasta: null };
  const avisa = (porcentaje) => contexto.tocaAvisar(estado, { sesion: 'x', porcentaje }, 70);
  assert.deepStrictEqual([50, 71, 75, 81, 95, 40, 72].map(avisa), [false, true, false, true, true, false, true]);
});
