import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesSearch} from '../public/searchable-select.js';

test('la búsqueda encuentra fragmentos internos sin distinguir mayúsculas ni tildes', () => {
  for (const [text, query] of [
    ['Voz Chilena', 'ilena'], ['Gata fan del rock', 'FAN DEL'],
    ['Canción Ñandú', 'cancion'], ['Gato Perú', 'PERU'],
    ['Gato Tabby', 'abby'], ['Gata Calicó', '  ali  '],
    ['Madre Latina', 'dre Lat'], ['Gato Calvo', ''],
  ]) assert.equal(matchesSearch(text, query), true, `${text}: ${query}`);
  assert.equal(matchesSearch('Gato Tabby', 'Calvo'), false);
  assert.equal(matchesSearch('Voz Chilena', 'chliena'), false);
});
