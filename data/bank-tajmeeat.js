/*
 * قسم أسئلة التجميعات الموثقة — فارغ حاليًا.
 *
 * لا يُضاف هنا إلا سؤال من ملف تجميعات:
 *   1) مصدره مسجل في data/sources.js وفيه وصف لإذن النشر (license)،
 *   2) يحمل مرجع الصفحة أو رقم السؤال،
 *   3) تمت مراجعته (status: 'verified').
 * الأسئلة بحالة 'review' تبقى في قائمة المراجعة ولا تظهر للطلاب.
 *
 * مثال على سؤال واحد:
 *
 * window.QB.questions.push({
 *   id: 'TJ-1447-V-0001',
 *   pool: 'tajmeeat',
 *   section: 'verbal',            // quant أو verbal
 *   skill: 'analogy',             // من data/skills.js
 *   stem: 'نص السؤال كما في المصدر',
 *   options: [ { id: 'a', text: '...' }, { id: 'b', text: '...' }, { id: 'c', text: '...' }, { id: 'd', text: '...' } ],
 *   answer: 'b',
 *   explanation: 'شرح الحل',
 *   explanationSource: 'source',  // 'source' إذا كان الشرح من الملف، 'authored' إذا أُعدّ لاحقًا
 *   source: { sourceId: 'tj-1447-verbal-a', page: 12, number: 34 },
 *   status: 'review',             // 'verified' بعد المراجعة فقط
 *   license: 'كما في سجل المصدر'
 * });
 *
 * يمكن أيضًا تعبئة القالب templates/tajmeeat-template.csv ثم تحويله بالأمر:
 *   node tools/import-csv.mjs templates/tajmeeat-template.csv > data/bank-tajmeeat.js
 */
window.QB = window.QB || { sources: [], questions: [] };
