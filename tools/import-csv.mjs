// تحويل ملف CSV (من Excel أو Google Sheets) إلى ملف أسئلة التجميعات.
// التشغيل: node tools/import-csv.mjs templates/tajmeeat-template.csv > data/bank-tajmeeat.js
// الأعمدة: id,section,skill,stem,passage,option_a..option_d,answer,explanation,explanation_source,source_id,page,number,status
import fs from 'node:fs';

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

const file = process.argv[2];
if (!file) { console.error('اكتب مسار ملف CSV'); process.exit(1); }
const [header, ...data] = parseCSV(fs.readFileSync(file, 'utf8'));
const col = name => header.indexOf(name);
const out = data.map((r, n) => {
  const g = k => (r[col(k)] || '').trim();
  const options = ['a', 'b', 'c', 'd'].map(L => ({ id: L, text: g('option_' + L) })).filter(o => o.text);
  const page = g('page'), number = g('number');
  const q = {
    id: g('id') || `TJ-ROW-${n + 2}`,
    pool: 'tajmeeat', section: g('section'), skill: g('skill'), stem: g('stem'),
    options, answer: g('answer').toLowerCase(),
    explanation: g('explanation'), explanationSource: g('explanation_source') || 'source',
    source: { sourceId: g('source_id'), page: page ? Number(page) : undefined, number: number || undefined },
    status: g('status') === 'verified' ? 'verified' : 'review'
  };
  if (g('passage')) q.passage = g('passage');
  if (q.skill === 'comparison') delete q.options;
  return q;
});

process.stdout.write(`/* أُنشئ آليًا من ${file} — لا تعدّليه يدويًا، عدّلي ملف CSV ثم أعيدي التحويل */\n`);
process.stdout.write('window.QB = window.QB || { sources: [], questions: [] };\n');
process.stdout.write(`window.QB.questions.push(...${JSON.stringify(out, null, 2)});\n`);
console.error(`تم تحويل ${out.length} سؤالًا (المعتمد منها: ${out.filter(q => q.status === 'verified').length})`);
