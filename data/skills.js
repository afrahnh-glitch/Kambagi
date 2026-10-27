/*
 * سجل الأقسام والمهارات. أي سؤال يجب أن تكون مهارته مسجلة هنا.
 * يمكن إضافة مهارة جديدة بإضافة سطر فقط.
 */
window.QB = window.QB || { sources: [], questions: [] };

window.QB.sections = {
  quant:  { label: 'القدرات الكمية' },
  verbal: { label: 'القدرات اللفظية' }
};

window.QB.skills = {
  // الكمي
  ratio:      { section: 'quant',  label: 'النسب والتناسب' },
  percent:    { section: 'quant',  label: 'النسبة المئوية' },
  average:    { section: 'quant',  label: 'المتوسطات' },
  arithmetic: { section: 'quant',  label: 'المسائل الحسابية' },
  algebra:    { section: 'quant',  label: 'الجبر والمعادلات' },
  geometry:   { section: 'quant',  label: 'الهندسة' },
  stats:      { section: 'quant',  label: 'الإحصاء والاحتمالات' },
  speed:      { section: 'quant',  label: 'السرعة والزمن والمسافة' },
  comparison: { section: 'quant',  label: 'المقارنة الكمية' },
  patterns:   { section: 'quant',  label: 'الأنماط والمسائل المنطقية الكمية' },
  // اللفظي
  analogy:    { section: 'verbal', label: 'التناظر اللفظي' },
  completion: { section: 'verbal', label: 'إكمال الجمل' },
  contextual: { section: 'verbal', label: 'الخطأ السياقي' },
  reading:    { section: 'verbal', label: 'استيعاب المقروء' },
  vocabulary: { section: 'verbal', label: 'المفردات والعلاقات اللفظية' }
};

// الخيارات الثابتة لأسئلة المقارنة الكمية
window.QB.comparisonOptions = [
  { id: 'a', text: 'القيمة الأولى أكبر' },
  { id: 'b', text: 'القيمة الثانية أكبر' },
  { id: 'c', text: 'القيمتان متساويتان' },
  { id: 'd', text: 'المعطيات غير كافية' }
];
