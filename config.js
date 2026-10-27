/*
 * إعدادات أداة «كم باقي على هدفك؟»
 * كل ما يمكن تعديله دون لمس الكود موجود هنا.
 */
window.APP_CONFIG = {
  appVersion: '1.0.0',

  // مفتاح التخزين المحلي على جهاز الطالب (غيّريه فقط إذا أردتِ تصفير جميع المحاولات المحفوظة)
  storageKey: 'kbh-v1',

  // أطوال الاختبار: عدد أسئلة كل قسم، وعدد الأسئلة لكل مهارة داخل الاختبار
  testLengths: {
    short: { label: 'قصير', quant: 12, verbal: 12, perSkill: 3 },
    full:  { label: 'شامل', quant: 30, verbal: 16, perSkill: 3 }
  },
  defaultLength: 'short',

  // ترتيب عشوائي للأسئلة والخيارات (أسئلة المقارنة الكمية لا تُخلط خياراتها)
  shuffleQuestions: true,
  shuffleOptions: true,

  // المؤقت اختياري؛ يحدد الطالب تفعيله من صفحة بيانات الاختبار
  timer: { defaultEnabled: false, secondsPerQuestion: 60 },

  // السماح بالتسليم مع وجود أسئلة غير مجابة (بعد تنبيه الطالب وعرض أرقامها)
  allowSubmitWithUnanswered: true,

  // تحليل المهارات
  minQuestionsPerSkill: 3,     // أقل عدد أسئلة لتقييم مهارة؛ أقل من ذلك = «نحتاج إلى أسئلة إضافية»
  skillGoodThreshold: 0.67,    // نسبة الصواب التي تعدّ عندها المهارة «جيدة» في الأسئلة المختبرة

  // التصنيف التدريبي الداخلي (حسب نسبة الصواب في هذا الاختبار فقط)
  levels: [
    { min: 0,    key: 'foundation', label: 'يحتاج إلى تأسيس' },
    { min: 0.5,  key: 'developing', label: 'في طور التطور' },
    { min: 0.8,  key: 'advanced',   label: 'متقدم في المهارات المقاسة' }
  ],

  // أقل عدد من الأسئلة المعتمدة في القسم ليُتاح مصدر الأسئلة للاختبار
  minVerifiedPerSection: 12,

  /*
   * طلب الخطة التفصيلية — غير مفعّل حاليًا.
   * عند الجاهزية: اجعلي enabled: true، وضعي في requestUrl رابط نموذج الطلب،
   * وفي instructions نص التعليمات الذي سيظهر للطالب.
   */
  detailedPlan: {
    enabled: false,
    requestUrl: '',
    requestButtonLabel: 'انتقل إلى نموذج الطلب',
    instructions: ''
  }
};
