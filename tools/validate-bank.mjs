// فحص بنك الأسئلة: الحقول، المعرفات، الإجابات، المصادر، وقائمة المراجعة.
// التشغيل: node tools/validate-bank.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { loadAll, ROOT } from './load-bank.mjs';
const require = createRequire(import.meta.url);
const Engine = require(ROOT + '/assets/engine.js');

const { bank, config } = loadAll();
let problems = 0;

const ids = new Map();
bank.questions.forEach(q => ids.set(q.id, (ids.get(q.id) || 0) + 1));
for (const [id, n] of ids) if (n > 1) { console.log(`✗ معرف مكرر: ${id} (${n} مرات)`); problems++; }

const review = [];
for (const q of bank.questions) {
  const errs = Engine.validateQuestion(q, bank);
  if (q.status === 'verified' && errs.length) { console.log(`✗ ${q.id} معتمد لكنه غير صالح: ${errs.join('، ')}`); problems++; }
  if (q.figure && !fs.existsSync(ROOT + '/' + q.figure)) { console.log(`✗ ${q.id}: ملف الرسم غير موجود ${q.figure}`); problems++; }
  if (q.status !== 'verified') review.push({ id: q.id, status: q.status, errs: errs.concat(q.reviewNote ? [q.reviewNote] : []) });
}

const sourceIds = new Set(bank.sources.map(s => s.id));
if (sourceIds.size !== bank.sources.length) { console.log('✗ معرف مصدر مكرر'); problems++; }

for (const pool of ['tajmeeat', 'original']) {
  const s = Engine.poolSummary(bank, pool, config);
  const el = Engine.eligibleQuestions(bank, pool);
  const bySkill = {};
  el.forEach(q => { bySkill[q.skill] = (bySkill[q.skill] || 0) + 1; });
  console.log(`\n[${pool === 'tajmeeat' ? 'التجميعات' : 'الأسئلة الأصلية'}] معتمد: ${s.total} (كمي ${s.bySection.quant || 0}، لفظي ${s.bySection.verbal || 0}) — ${s.usable ? 'جاهز للاختبار' : 'غير كافٍ للاختبار'}`);
  Object.entries(bySkill).forEach(([k, n]) => console.log(`   ${bank.skills[k].label}: ${n}`));
}

console.log(`\nقائمة المراجعة (غير معروضة للطلاب): ${review.length}`);
review.forEach(r => console.log(`   ${r.id} [${r.status}] ${r.errs.join('، ')}`));

console.log(problems ? `\n✗ ${problems} مشكلة` : '\n✓ البنك سليم');
process.exit(problems ? 1 : 0);
