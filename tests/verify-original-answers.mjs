// تحقق حسابي مستقل من إجابة كل سؤال كمي أصلي، والتأكد من أن خيارًا واحدًا فقط صحيح.
import assert from 'node:assert/strict';
import { loadAll } from '../tools/load-bank.mjs';
const { bank } = loadAll();

const num = t => {
  const m = String(t).replace(/\[\[|\]\]/g, '').replace('−', '-').match(/-?\d+(?:\.\d+)?(?:\/\d+)?/);
  if (!m) return NaN;
  if (m[0].includes('/')) { const [a, b] = m[0].split('/').map(Number); return a / b; }
  return Number(m[0]);
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

// القيمة الصحيحة محسوبة هنا من معطيات السؤال، لا من الملف
const expected = {
  'O-RAT-01': 3 * (40 / 5),
  'O-RAT-02': (2 / 3) * (4 / 5),               // أ/ج
  'O-RAT-03': 15 * 3 / 5,
  'O-RAT-04': 180 / 6 * 10,
  'O-PCT-01': 250 * 0.8,
  'O-PCT-02': (100 - 80) / 80 * 100,
  'O-PCT-03': 45 / 0.3,
  'O-PCT-04': null,                             // نصي: يُفحص أدناه
  'O-AVG-01': 15 * 4,
  'O-AVG-02': (5 * 80 + 92) / 6,
  'O-AVG-03': 3 * 20 - 18 - 25,
  'O-AVG-04': (4 + 7 + 10 + 13 + 16) / 5,
  'O-ALG-01': (14 + 7) / 3,
  'O-ALG-02': (10 + 4) / 2,
  'O-ALG-03': 4 * (12 / 2) + 1,
  'O-ALG-04': (-3) ** 2 - 9,
  'O-GEO-01': Math.hypot(12, 5),
  'O-GEO-02': 180 - 50 - 65,
  'O-GEO-03': (36 / 4) ** 2,
  'O-GEO-04': 2 * (22 / 7) * 7,
  'O-SPD-01': 240 / 3,
  'O-SPD-02': 2 / 6 * 60,
  'O-SPD-03': 300 / (70 + 80),
  'O-SPD-04': 2 / (1 / 10 + 1 / 15),
  'O-STA-01': 5 / (3 + 5 + 2),
  'O-STA-02': [7, 3, 9, 5, 11].sort((a, b) => a - b)[2],
  'O-STA-03': 2 / 6,
  'O-STA-04': 6
};

let checked = 0;
for (const [id, val] of Object.entries(expected)) {
  const q = bank.questions.find(x => x.id === id);
  assert.ok(q, 'سؤال مفقود ' + id);
  const correctOpt = q.options.find(o => o.id === q.answer);
  if (id === 'O-RAT-02') {
    const [a, c] = correctOpt.text.split(':').map(Number);
    assert.ok(near(a / c, val), id);
    q.options.filter(o => o.id !== q.answer).forEach(o => {
      const [x, y] = o.text.split(':').map(Number); assert.ok(!near(x / y, val), id + ' خيار آخر صحيح');
    });
  } else if (id === 'O-PCT-04') {
    const r = 1.1 * 0.9;
    assert.ok(near(r, 0.99) && correctOpt.text.includes('انخفض') && correctOpt.text.includes('1%'), id);
  } else {
    assert.ok(near(num(correctOpt.text), val), `${id}: المتوقع ${val} والموجود ${correctOpt.text}`);
    q.options.filter(o => o.id !== q.answer).forEach(o => assert.ok(!near(num(o.text), val), id + ' خيار آخر يساوي الإجابة'));
  }
  checked++;
}

// المقارنة الكمية
const cmp = { 'O-CMP-01': [0.25 * 80, 0.8 * 25], 'O-CMP-02': [0.5 ** 2, 0.5], 'O-CMP-04': [3 / 4, 5 / 7] };
for (const [id, [a, b]] of Object.entries(cmp)) {
  const q = bank.questions.find(x => x.id === id);
  const want = near(a, b) ? 'c' : a > b ? 'a' : 'b';
  assert.equal(q.answer, want, id); checked++;
}
// س² مقابل س لعدد صحيح موجب: متساويتان عند 1 والأولى أكبر عند 2 → غير كافية
{
  const q = bank.questions.find(x => x.id === 'O-CMP-03');
  const outcomes = new Set([1, 2, 3, 10].map(x => x * x === x ? 'eq' : x * x > x ? 'gt' : 'lt'));
  assert.equal(outcomes.size > 1 ? 'd' : '?', q.answer, 'O-CMP-03'); checked++;
}

const quantCount = bank.questions.filter(q => q.pool === 'original' && q.section === 'quant').length;
assert.equal(checked, quantCount, 'كل الأسئلة الكمية الأصلية يجب أن تُفحص');
console.log(`✓ تم التحقق حسابيًا من ${checked} سؤالًا كميًا أصليًا`);
