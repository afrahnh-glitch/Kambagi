// فحوص بنيوية لأسئلة «الفزعة» اللفظية (مركز كنان).
// تشغيل: node --test tests/verify-kanan.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from '../tools/load-bank.mjs';

const { bank } = loadAll();
const E = (await import('node:module')).createRequire(import.meta.url)('../assets/engine.js');
const kn = bank.questions.filter(q => q.source.sourceId === 'tj-kanan-fazaa-2');
const strip = s => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا');

test('العدد والتوزيع', () => {
  assert.equal(kn.length, 62);
  const by = {}; kn.forEach(q => { by[q.skill] = (by[q.skill] || 0) + 1; });
  assert.deepEqual(by, { analogy: 15, completion: 12, contextual: 12, vocabulary: 6, reading: 17 });
  assert.ok(kn.every(q => q.section === 'verbal' && q.pool === 'tajmeeat' && q.status === 'verified'));
  assert.equal(new Set(kn.map(q => q.id)).size, kn.length);
  assert.equal(E.eligibleQuestions(bank, 'tajmeeat').filter(q => q.source.sourceId === 'tj-kanan-fazaa-2').length, 62);
});

test('مرجع ومصدر لكل سؤال', () => {
  kn.forEach(q => {
    assert.ok(Number.isInteger(q.source.page) && q.source.page >= 1 && q.source.page <= 291, q.id);
    assert.match(q.source.number, /السؤال \d+/, q.id);
    assert.ok(q.explanation && q.explanation.length > 15, q.id);
  });
});

test('خيارات الخطأ السياقي مأخوذة من الجملة نفسها وبترتيبها', () => {
  kn.filter(q => q.skill === 'contextual').forEach(q => {
    const sentence = strip(q.stem.split('\n')[1]);
    q.options.forEach(o => assert.ok(sentence.includes(strip(o.text).replace(/^و/, '')), q.id + ' ' + o.text));
    assert.equal(q.shuffleOptions, false, q.id);
  });
});

test('أزواج التناظر وخيارات الإكمال بنقطتين، والإكمال بفراغين', () => {
  kn.filter(q => q.skill === 'analogy').forEach(q => {
    assert.ok(q.stem.split('\n')[1].includes(':'), q.id);
    q.options.forEach(o => assert.ok(o.text.includes(':'), q.id));
  });
  kn.filter(q => q.skill === 'completion').forEach(q => {
    assert.equal((q.stem.match(/\.{6,}/g) || []).length, 2, q.id);
    q.options.forEach(o => assert.ok(o.text.includes(':'), q.id));
  });
});

test('أسئلة الاستيعاب مرتبطة بنص كامل، ولا تتكرر الخيارات', () => {
  kn.filter(q => q.skill === 'reading').forEach(q => {
    assert.ok(q.passage && q.passage.length > 40 && q.passageId, q.id);
  });
  kn.forEach(q => assert.equal(new Set(q.options.map(o => o.text)).size, 4, q.id));
});
