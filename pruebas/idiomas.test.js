// Pruebas de los idiomas: todos tienen los mismos textos que el español y con los mismos {valores}. Se corren con: npm test
const { test } = require('node:test');
const assert = require('node:assert');

const ES = require('../src/idiomas/es');
const llaves = (texto) => (String(texto).match(/\{\w+\}/g) || []).sort().join(',');

for (const codigo of ['en', 'pt', 'fr', 'de']) {
  test(`${codigo}: mismos textos y mismos {valores} que el español`, () => {
    const D = require(`../src/idiomas/${codigo}`);
    assert.deepStrictEqual(Object.keys(D).filter((k) => !(k in ES)), [], 'claves de más');
    assert.deepStrictEqual(Object.keys(ES).filter((k) => !(k in D)), [], 'claves que faltan');
    assert.deepStrictEqual(Object.keys(ES).filter((k) => llaves(ES[k]) !== llaves(D[k])), [], '{valores} distintos');
  });
}

test('cada texto que usa la pantalla existe en el español', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../src/ventanas/widget.html'), 'utf8');
  const usadas = [...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual([...new Set(usadas)].filter((k) => !(k in ES)), []);
});
