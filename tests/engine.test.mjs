// اختبارات وحدة للمحرك: السحب، التصحيح، التحليل، التواريخ، والخطة.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadAll, ROOT } from '../tools/load-bank.mjs';
const require = createRequire(import.meta.url);
const E = require(ROOT + '/assets/engine.js');
const { bank, config } = loadAll();

let passed = 0;
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const notSame = (a, b, m) => assert.notEqual(JSON.stringify(a), JSON.stringify(b), m);
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
const byId = Object.fromEntries(bank.questions.map(q => [q.id, q]));

test('لا تُعرض إلا الأسئلة المعتمدة من المصدر المختار', () => {
  const fake = structuredClone(bank);
  fake.questions.push({ ...fake.questions[0], id: 'X-REVIEW', status: 'review' });
  const el = E.eligibleQuestions(fake, 'original');
  assert.ok(!el.some(q => q.id === 'X-REVIEW'));
  assert.ok(E.eligibleQuestions(fake, 'tajmeeat').every(q => q.pool === 'tajmeeat' && q.status === 'verified'));
  assert.ok(!E.eligibleQuestions(bank, 'tajmeeat').some(q => q.status === 'review'));
});

test('سؤال تجميعات بلا ترخيص أو بلا مرجع صفحة يُرفض', () => {
  const fake = structuredClone(bank);
  fake.sources.push({ id: 'tj-x', pool: 'tajmeeat', title: 't', license: '' });
  const q = { ...fake.questions[0], id: 'TJ-1', pool: 'tajmeeat', source: { sourceId: 'tj-x' } };
  const errs = E.validateQuestion(q, fake);
  assert.ok(errs.some(e => e.includes('ترخيص')));
  assert.ok(errs.some(e => e.includes('مرجع')));
});

test('الاختبار القصير والشامل: العدد صحيح، متوازن، بلا تكرار، و3 أسئلة على الأقل لكل مهارة', () => {
  for (const lengthKey of ['short', 'full']) {
    for (let seed = 1; seed <= 300; seed++) {
      const a = E.buildAttempt(bank, config, { pool: 'original', lengthKey, seed, timer: false });
      const L = config.testLengths[lengthKey];
      assert.equal(a.questionIds.length, L.quant + L.verbal);
      assert.equal(new Set(a.questionIds).size, a.questionIds.length);
      const qs = a.questionIds.map(id => byId[id]);
      assert.equal(qs.filter(q => q.section === 'quant').length, L.quant);
      assert.equal(qs.filter(q => q.section === 'verbal').length, L.verbal);
      const counts = {};
      qs.forEach(q => { counts[q.skill] = (counts[q.skill] || 0) + 1; });
      Object.values(counts).forEach(n => assert.ok(n >= 3, lengthKey + ' مهارة بأقل من 3 أسئلة'));
      // الكمي أولًا ثم اللفظي، وأسئلة القطعة متجاورة
      const firstVerbal = qs.findIndex(q => q.section === 'verbal');
      assert.ok(qs.slice(firstVerbal).every(q => q.section === 'verbal'));
      const pidx = {};
      qs.forEach((q, i) => { if (q.passageId) (pidx[q.passageId] = pidx[q.passageId] || []).push(i); });
      Object.values(pidx).forEach(ix => assert.equal(ix[ix.length - 1] - ix[0], ix.length - 1));
    }
  }
});

test('التجميعات للكمي والأصلية للفظي عند عدم توفر تجميعات لفظية', () => {
  const sp = E.sectionPools(bank, 'tajmeeat', config);
  same(sp, { quant: 'tajmeeat', verbal: 'original' });
  for (let seed = 1; seed <= 100; seed++) {
    const a = E.buildAttempt(bank, config, { pool: 'tajmeeat', lengthKey: seed % 2 ? 'short' : 'full', seed });
    const qs = a.questionIds.map(id => byId[id]);
    assert.ok(qs.filter(q => q.section === 'quant').every(q => q.pool === 'tajmeeat'));
    assert.ok(qs.filter(q => q.section === 'verbal').every(q => q.pool === 'original'));
    assert.equal(new Set(a.questionIds).size, a.questionIds.length);
    const counts = {}; qs.forEach(q => { counts[q.skill] = (counts[q.skill] || 0) + 1; });
    Object.values(counts).forEach(n => assert.ok(n >= 3));
  }
  // مصدر أصلي فقط لا يخلط التجميعات
  const b = E.buildAttempt(bank, config, { pool: 'original', lengthKey: 'full', seed: 9 });
  assert.ok(b.questionIds.every(id => byId[id].pool === 'original'));
});

test('الترتيب عشوائي بين المحاولات، وخيارات المقارنة الكمية ثابتة', () => {
  const orders = new Set();
  let optionShuffled = false;
  for (let seed = 1; seed <= 30; seed++) {
    const a = E.buildAttempt(bank, config, { pool: 'original', lengthKey: 'full', seed });
    orders.add(a.questionIds.join(','));
    for (const id of a.questionIds) {
      const q = byId[id];
      if (q.skill === 'comparison') same(a.optionOrder[id], ['a', 'b', 'c', 'd']);
      else if (a.optionOrder[id].join('') !== 'abcd') optionShuffled = true;
      same([...a.optionOrder[id]].sort(), E.optionsOf(q, bank).map(o => o.id).sort());
    }
  }
  assert.ok(orders.size > 25);
  assert.ok(optionShuffled);
});

test('الإجابة الأخيرة تستبدل السابقة، والإجابات غير الصالحة تُتجاهل', () => {
  const a = E.buildAttempt(bank, config, { pool: 'original', lengthKey: 'short', seed: 7 });
  const id = a.questionIds[0];
  E.recordAnswer(a, id, 'a'); E.recordAnswer(a, id, 'b');
  E.recordAnswer(a, id, 'z'); E.recordAnswer(a, 'NOT-IN-TEST', 'a');
  same(Object.keys(a.answers), [id]);
  assert.equal(a.answers[id], 'b');
  a.submittedAt = Date.now();
  E.recordAnswer(a, id, 'c');
  assert.equal(a.answers[id], 'b', 'لا تعديل بعد التسليم');
});

test('التصحيح يطابق مفتاح الإجابات، ولا يحتسب السؤال مرتين', () => {
  const a = E.buildAttempt(bank, config, { pool: 'original', lengthKey: 'short', seed: 11 });
  a.questionIds.forEach((id, i) => {
    const q = byId[id];
    if (i < 10) E.recordAnswer(a, id, q.answer);
    else if (i < 20) E.recordAnswer(a, id, E.optionsOf(q, bank).find(o => o.id !== q.answer).id);
  });
  a.questionIds.push(a.questionIds[0]); // محاولة تكرار
  const r = E.scoreAttempt(a, bank, config);
  assert.equal(r.total, 24); assert.equal(r.correct, 10); assert.equal(r.wrong, 10); assert.equal(r.unanswered, 4);
  assert.equal(r.correct + r.wrong + r.unanswered, r.total);
  const secSum = Object.values(r.sections).reduce((s, x) => s + x.total, 0);
  assert.equal(secSum, r.total);
});

test('التصنيف الداخلي وحالات المهارات حسب القواعد', () => {
  assert.equal(E.levelFor(0.49, config).key, 'foundation');
  assert.equal(E.levelFor(0.5, config).key, 'developing');
  assert.equal(E.levelFor(0.8, config).key, 'advanced');
  const a = E.buildAttempt(bank, config, { pool: 'original', lengthKey: 'short', seed: 3 });
  a.questionIds.forEach(id => { const q = byId[id]; if (q.section === 'quant') E.recordAnswer(a, id, q.answer); });
  const r = E.scoreAttempt(a, bank, config);
  r.skills.forEach(s => {
    if (s.total < 3) assert.equal(s.status, 'insufficient');
    else assert.equal(s.status, s.section === 'quant' ? 'good' : 'needs');
  });
  assert.equal(r.sections.quant.pct, 1); assert.equal(r.sections.verbal.pct, 0);
  // مهارة بسؤالين فقط لا تُقيَّم
  const tiny = { ...a, questionIds: a.questionIds.slice(0, 2) };
  E.scoreAttempt(tiny, bank, config).skills.forEach(s => assert.equal(s.status, 'insufficient'));
});

test('حساب الأيام والتواريخ', () => {
  assert.equal(E.daysBetween('2026-10-25', '2026-11-01'), 7);
  assert.equal(E.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(E.daysBetween('2028-02-28', '2028-03-01'), 2); // سنة كبيسة
  assert.equal(E.daysBetween('2026-10-25', '2026-02-30'), null);
  const v = E.validateProfile({ examDate: '2026-10-24', hoursPerDay: 2, daysPerWeek: 5, targetScore: 85 }, '2026-10-25');
  assert.ok(v.examDate);
  const ok = E.validateProfile({ examDate: '2026-12-01', hoursPerDay: 2, daysPerWeek: 5, targetScore: 85, currentScore: '' }, '2026-10-25');
  same(ok, {});
  assert.ok(E.validateProfile({ examDate: '2026-12-01', hoursPerDay: 2, daysPerWeek: 5, targetScore: '' }, '2026-10-25').targetScore);
});

function resultWith(qp, vp) {
  const a = E.buildAttempt(bank, config, { pool: 'original', lengthKey: 'short', seed: 5 });
  const qs = a.questionIds.map(id => byId[id]);
  const quant = qs.filter(q => q.section === 'quant'), verbal = qs.filter(q => q.section === 'verbal');
  quant.slice(0, Math.round(qp * quant.length)).forEach(q => E.recordAnswer(a, q.id, q.answer));
  verbal.slice(0, Math.round(vp * verbal.length)).forEach(q => E.recordAnswer(a, q.id, q.answer));
  return E.scoreAttempt(a, bank, config);
}

test('الخطة تتغير حسب النتيجة: القسم الأضعف يأخذ وقتًا أكثر', () => {
  const prof = { examDate: '2026-12-20', hoursPerDay: 2, daysPerWeek: 5, targetScore: 85, currentScore: '' };
  const weakQuant = E.generatePlan(resultWith(0.25, 0.9), prof, { today: '2026-10-25' });
  const weakVerbal = E.generatePlan(resultWith(0.9, 0.25), prof, { today: '2026-10-25' });
  assert.ok(weakQuant.split.quant > 0.5 && weakVerbal.split.quant < 0.5);
  assert.ok(weakQuant.split.quant <= 0.65 && weakQuant.split.quant >= 0.35);
  assert.ok(Math.abs(weakQuant.split.quant + weakQuant.split.verbal - 1) < 1e-9);
  notSame(weakQuant.priorities.map(p => p.key), weakVerbal.priorities.map(p => p.key));
  weakQuant.priorities.forEach(p => assert.equal(p.status, 'needs'));
  assert.ok(weakQuant.priorities.length <= 3);
  assert.ok(weakQuant.notes.some(n => n.includes('دقتها محدودة')));
  assert.ok(weakQuant.notes.some(n => n.includes('لا تضمن')));
});

test('الخطة تتغير حسب المدة المتبقية والوقت المتاح', () => {
  const r = resultWith(0.5, 0.5);
  const base = { hoursPerDay: 1.5, daysPerWeek: 4, targetScore: 80, currentScore: 70 };
  const far = E.generatePlan(r, { ...base, examDate: '2027-01-30' }, { today: '2026-10-25' });
  const mid = E.generatePlan(r, { ...base, examDate: '2026-11-15' }, { today: '2026-10-25' });
  const near = E.generatePlan(r, { ...base, examDate: '2026-10-29' }, { today: '2026-10-25' });
  const today = E.generatePlan(r, { ...base, examDate: '2026-10-25' }, { today: '2026-10-25' });
  assert.equal(far.mode, 'staged'); assert.equal(mid.mode, 'focused'); assert.equal(near.mode, 'intense'); assert.equal(today.mode, 'today');
  assert.equal(far.sessions.length, 4);
  assert.equal(near.sessions.length, 4); // 4 أيام متبقية و4 أيام مذاكرة
  assert.ok(near.sessions[near.sessions.length - 1].focus.includes('مراجعة خفيفة'));
  assert.equal(today.sessions.length, 0);
  assert.ok(far.sessions[far.sessions.length - 1].isPracticeTest);
  assert.equal(far.gap, 10);
  for (const p of [far, mid, near]) p.sessions.forEach(s => {
    const sum = s.tasks.reduce((x, t) => x + t.minutes, 0);
    assert.ok(Math.abs(sum - s.minutes) <= 10, 'مجموع المهام قريب من وقت الجلسة');
  });
  const one = E.generatePlan(r, { ...base, daysPerWeek: 1, examDate: '2027-01-30' }, { today: '2026-10-25' });
  assert.equal(one.sessions.length, 1); assert.equal(one.sessions[0].section, 'mixed');
  const seven = E.generatePlan(r, { ...base, daysPerWeek: 7, examDate: '2027-01-30' }, { today: '2026-10-25' });
  assert.equal(new Set(seven.sessions.map(s => s.day)).size, 7);
  const tomorrow = E.generatePlan(r, { ...base, examDate: '2026-10-26' }, { today: '2026-10-25' });
  assert.equal(tomorrow.sessions.length, 1);
  assert.ok(tomorrow.sessions[0].focus.includes('مراجعة خفيفة'));
  const heavy = E.generatePlan(r, { ...base, hoursPerDay: 5, examDate: '2027-01-30' }, { today: '2026-10-25' });
  assert.ok(heavy.recommendations.some(x => x.includes('استراحات')));
});

test('تفضيل البدء بقسم يحدد أول جلسة', () => {
  const r = resultWith(0.5, 0.5);
  const base = { hoursPerDay: 1, daysPerWeek: 5, targetScore: 80, examDate: '2027-01-30' };
  assert.equal(E.generatePlan(r, { ...base, startPref: 'verbal' }, { today: '2026-10-25' }).sessions[0].section, 'verbal');
  assert.equal(E.generatePlan(r, { ...base, startPref: 'quant' }, { today: '2026-10-25' }).sessions[0].section, 'quant');
});

console.log(`\n${passed} اختبارًا ناجحًا`);
