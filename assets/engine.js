/*
 * محرك «كم باقي على هدفك؟»: سحب الأسئلة، التصحيح، التحليل، والخطة المختصرة والتفصيلية.
 * منطق برمجي خالص بلا واجهة، يعمل في المتصفح وفي Node للاختبارات.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- أدوات عامة ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function round5(x) { return Math.max(5, Math.round(x / 5) * 5); }

  // ---------- التحقق من الأسئلة ----------
  const REQUIRED = ['id', 'pool', 'section', 'skill', 'stem', 'answer', 'status', 'source'];

  function validateQuestion(q, bank) {
    const errors = [];
    REQUIRED.forEach(f => { if (q[f] === undefined || q[f] === null || q[f] === '') errors.push('حقل ناقص: ' + f); });
    if (!['tajmeeat', 'original'].includes(q.pool)) errors.push('pool غير صحيح');
    if (!bank.sections || !bank.sections[q.section]) errors.push('قسم غير مسجل: ' + q.section);
    const sk = bank.skills && bank.skills[q.skill];
    if (!sk) errors.push('مهارة غير مسجلة: ' + q.skill);
    else if (sk.section !== q.section) errors.push('المهارة لا تتبع القسم');
    const opts = optionsOf(q, bank);
    if (!Array.isArray(opts) || opts.length < 2) errors.push('الخيارات أقل من اثنين');
    else {
      const ids = opts.map(o => o.id);
      if (new Set(ids).size !== ids.length) errors.push('معرفات خيارات مكررة');
      if (!ids.includes(q.answer)) errors.push('الإجابة الصحيحة ليست ضمن الخيارات');
      opts.forEach(o => { if (!o.text || !String(o.text).trim()) errors.push('خيار بلا نص'); });
    }
    const src = (bank.sources || []).find(s => s.id === (q.source && q.source.sourceId));
    if (!src) errors.push('مصدر غير مسجل');
    else if (src.pool !== q.pool) errors.push('مصدر السؤال لا يطابق نوعه');
    if (q.pool === 'tajmeeat') {
      if (!src || !src.license || !String(src.license).trim()) errors.push('لا يوجد إذن/ترخيص مسجل للمصدر');
      if (!q.source || !(q.source.page || q.source.number)) errors.push('مرجع الصفحة أو رقم السؤال مفقود');
    }
    return errors;
  }

  function optionsOf(q, bank) {
    if (q.skill === 'comparison' && !q.options && bank.comparisonOptions) return bank.comparisonOptions;
    return q.options;
  }

  function eligibleQuestions(bank, pool) {
    return (bank.questions || []).filter(q =>
      q.pool === pool && q.status === 'verified' && validateQuestion(q, bank).length === 0);
  }

  // مصدر كل قسم: يُستخدم المصدر المختار للقسم إذا كان فيه أسئلة معتمدة كافية،
  // وإلا تُستخدم الأسئلة التدريبية الأصلية لذلك القسم (مع إظهار مصدر كل سؤال للطالب).
  function sectionPools(bank, pool, cfg) {
    const min = cfg.minVerifiedPerSection || 1;
    const count = (p, sec) => eligibleQuestions(bank, p).filter(q => q.section === sec).length;
    const out = {};
    ['quant', 'verbal'].forEach(sec => {
      if (count(pool, sec) >= min) out[sec] = pool;
      else if (pool !== 'original' && count('original', sec) >= min) out[sec] = 'original';
      else out[sec] = null;
    });
    return out;
  }

  function poolSummary(bank, pool, cfg) {
    const el = eligibleQuestions(bank, pool);
    const bySection = { quant: 0, verbal: 0 };
    el.forEach(q => { bySection[q.section] = (bySection[q.section] || 0) + 1; });
    const sp = sectionPools(bank, pool, cfg);
    return {
      pool, total: el.length, bySection, sectionPools: sp,
      // صالح إذا غطّى المصدر قسمًا واحدًا على الأقل، وأمكن إكمال القسمين
      usable: (sp.quant === pool || sp.verbal === pool) && !!sp.quant && !!sp.verbal
    };
  }

  // ---------- سحب أسئلة متوازنة ----------
  // يوزع حصة القسم على المهارات بحيث تأخذ كل مهارة مختارة perSkill سؤالًا على الأقل متى أمكن،
  // ليصبح تقييم المهارة ممكنًا بدل تشتيت الأسئلة سؤالًا واحدًا لكل مهارة.
  function sampleSection(questions, quota, perSkill, rng) {
    const bySkill = {};
    questions.forEach(q => { (bySkill[q.skill] = bySkill[q.skill] || []).push(q); });
    Object.keys(bySkill).forEach(k => { bySkill[k] = shuffle(bySkill[k], rng); });
    let skills = shuffle(Object.keys(bySkill), rng);
    const available = questions.length;
    quota = Math.min(quota, available);
    if (quota <= 0) return [];

    // المهارات التي فيها perSkill أسئلة على الأقل تأتي أولًا
    skills.sort((a, b) => (bySkill[b].length >= perSkill) - (bySkill[a].length >= perSkill));
    const k = clamp(Math.floor(quota / Math.max(1, perSkill)), 1, skills.length);
    const chosen = skills.slice(0, k);
    const take = {};
    chosen.forEach(s => { take[s] = 0; });

    // توزيع دوري حتى تكتمل الحصة أو تنفد الأسئلة
    let remaining = quota, progressed = true;
    let pool = chosen.slice();
    while (remaining > 0 && progressed) {
      progressed = false;
      for (const s of pool) {
        if (remaining === 0) break;
        if (take[s] < bySkill[s].length) { take[s]++; remaining--; progressed = true; }
      }
      if (!progressed && pool.length < skills.length) {
        // أضف مهارات أخرى إذا لم تكفِ المهارات المختارة
        const next = skills[pool.length];
        pool.push(next); take[next] = 0; progressed = true;
      }
    }
    const out = [];
    Object.keys(take).forEach(s => { out.push(...bySkill[s].slice(0, take[s])); });
    return out;
  }

  function buildAttempt(bank, cfg, opts) {
    const rng = opts.rng || mulberry32(opts.seed || (Date.now() & 0xffffffff));
    const length = cfg.testLengths[opts.lengthKey] || cfg.testLengths[cfg.defaultLength];
    const sp = sectionPools(bank, opts.pool, cfg);
    const fromPool = sec => sp[sec] ? eligibleQuestions(bank, sp[sec]).filter(q => q.section === sec) : [];
    const quant = sampleSection(fromPool('quant'), length.quant, length.perSkill, rng);
    const verbal = sampleSection(fromPool('verbal'), length.verbal, length.perSkill, rng);

    // ترتيب: الكمي ثم اللفظي (كل قسم مخلوط داخليًا)، مع إبقاء أسئلة القطعة الواحدة متجاورة
    const orderSection = list => {
      let l = cfg.shuffleQuestions ? shuffle(list, rng) : list.slice();
      const groups = [], seen = {};
      l.forEach(q => {
        const key = q.passageId || q.id;
        if (seen[key] === undefined) { seen[key] = groups.length; groups.push([]); }
        groups[seen[key]].push(q);
      });
      return [].concat(...groups);
    };
    const ordered = orderSection(quant).concat(orderSection(verbal));
    const ids = ordered.map(q => q.id);
    if (new Set(ids).size !== ids.length) throw new Error('تكرار في الأسئلة المسحوبة');

    const optionOrder = {};
    ordered.forEach(q => {
      const o = optionsOf(q, bank).map(x => x.id);
      const fixed = q.skill === 'comparison' || q.shuffleOptions === false || !cfg.shuffleOptions;
      optionOrder[q.id] = fixed ? o : shuffle(o, rng);
    });

    const now = opts.now || Date.now();
    const timerSecs = opts.timer ? ids.length * (cfg.timer.secondsPerQuestion || 60) : 0;
    return {
      id: 'att-' + now.toString(36) + '-' + Math.floor(rng() * 1e6).toString(36),
      pool: opts.pool,
      sectionPools: sp,
      lengthKey: opts.lengthKey,
      createdAt: now,
      questionIds: ids,
      optionOrder,
      answers: {},
      flags: {},
      current: 0,
      timer: opts.timer ? { enabled: true, endsAt: now + timerSecs * 1000, totalSeconds: timerSecs } : { enabled: false },
      submittedAt: null
    };
  }

  // تسجيل إجابة: سؤال واحد = إجابة واحدة، والإجابة الجديدة تستبدل السابقة
  function recordAnswer(attempt, qid, optionId) {
    if (attempt.submittedAt) return attempt;
    if (!attempt.questionIds.includes(qid)) return attempt;
    if (!attempt.optionOrder[qid].includes(optionId)) return attempt;
    attempt.answers[qid] = optionId;
    return attempt;
  }

  function unansweredIndexes(attempt) {
    return attempt.questionIds.map((id, i) => attempt.answers[id] ? null : i).filter(i => i !== null);
  }

  // ---------- التصحيح والتحليل ----------
  function levelFor(pct, cfg) {
    let lvl = cfg.levels[0];
    cfg.levels.forEach(l => { if (pct >= l.min) lvl = l; });
    return lvl;
  }

  function scoreAttempt(attempt, bank, cfg) {
    const byId = {};
    bank.questions.forEach(q => { byId[q.id] = q; });
    const seen = new Set();
    const items = [];
    attempt.questionIds.forEach(id => {
      if (seen.has(id)) return; // لا يحتسب السؤال أكثر من مرة
      seen.add(id);
      const q = byId[id];
      if (!q) return;
      const given = attempt.answers[id] || null;
      items.push({ id, section: q.section, skill: q.skill, given, correct: given === q.answer, answered: !!given });
    });

    const total = items.length;
    const correct = items.filter(i => i.correct).length;
    const unanswered = items.filter(i => !i.answered).length;
    const wrong = total - correct - unanswered;

    const sections = {};
    Object.keys(bank.sections).forEach(s => {
      const list = items.filter(i => i.section === s);
      if (!list.length) return;
      const c = list.filter(i => i.correct).length;
      sections[s] = {
        key: s, label: bank.sections[s].label, total: list.length, correct: c,
        unanswered: list.filter(i => !i.answered).length,
        pct: c / list.length
      };
    });

    const min = cfg.minQuestionsPerSkill;
    const skillMap = {};
    items.forEach(i => {
      const m = skillMap[i.skill] = skillMap[i.skill] || { key: i.skill, section: i.section, label: bank.skills[i.skill].label, total: 0, correct: 0 };
      m.total++; if (i.correct) m.correct++;
    });
    const skills = Object.values(skillMap).map(m => {
      m.pct = m.correct / m.total;
      if (m.total < min) m.status = 'insufficient';
      else m.status = m.pct >= cfg.skillGoodThreshold ? 'good' : 'needs';
      return m;
    });

    const pct = total ? correct / total : 0;
    return {
      attemptId: attempt.id,
      pool: attempt.pool,
      computedAt: Date.now(),
      total, correct, wrong, unanswered, pct,
      level: levelFor(pct, cfg),
      sections, skills, items
    };
  }

  // ---------- التواريخ ----------
  function parseISODate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const back = new Date(d);
    if (back.getUTCMonth() !== +m[2] - 1 || back.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function todayISO(now) {
    const d = now ? new Date(now) : new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function daysBetween(fromISO, toISO) {
    const a = parseISODate(fromISO), b = parseISODate(toISO);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86400000);
  }

  // ---------- الخطة المختصرة ----------
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function validateProfile(p, today) {
    const errors = {};
    const d = daysBetween(today, p.examDate);
    if (d === null) errors.examDate = 'اختر موعد الاختبار.';
    else if (d < 0) errors.examDate = 'هذا التاريخ مضى. اختر موعدًا قادمًا.';
    else if (d > 730) errors.examDate = 'الموعد بعيد جدًا. اختر موعدًا خلال سنتين.';
    const h = Number(p.hoursPerDay);
    if (!(h >= 0.5 && h <= 8)) errors.hoursPerDay = 'اختر عدد ساعات بين نصف ساعة و8 ساعات.';
    const w = Number(p.daysPerWeek);
    if (!(Number.isInteger(w) && w >= 1 && w <= 7)) errors.daysPerWeek = 'اختر عدد أيام من 1 إلى 7.';
    const t = Number(p.targetScore);
    if (p.targetScore === '' || p.targetScore === null || p.targetScore === undefined || !(t >= 1 && t <= 100)) errors.targetScore = 'اكتب درجة مستهدفة من 1 إلى 100.';
    if (p.currentScore !== '' && p.currentScore !== null && p.currentScore !== undefined) {
      const c = Number(p.currentScore);
      if (!(c >= 1 && c <= 100)) errors.currentScore = 'الدرجة الحالية من 1 إلى 100، أو اتركها فارغة.';
    }
    return errors;
  }

  function generatePlan(result, profile, opts) {
    const today = opts.today;
    const daysLeft = daysBetween(today, profile.examDate);
    const hours = Number(profile.hoursPerDay);
    const daysPerWeek = Number(profile.daysPerWeek);
    const dailyMin = Math.round(hours * 60);
    const hasCurrent = profile.currentScore !== '' && profile.currentScore != null;
    const current = hasCurrent ? Number(profile.currentScore) : null;
    const target = Number(profile.targetScore);

    let mode;
    if (daysLeft <= 0) mode = 'today';
    else if (daysLeft <= 7) mode = 'intense';
    else if (daysLeft <= 30) mode = 'focused';
    else mode = 'staged';

    const modeInfo = {
      today:   { label: 'يوم الاختبار', ratios: [0, 0, 0] },
      intense: { label: 'مراجعة مكثفة للأيام المتبقية', ratios: [0.1, 0.6, 0.3] },
      focused: { label: 'تدريب مركّز', ratios: [0.2, 0.55, 0.25] },
      staged:  { label: 'تأسيس ثم تدريب ثم محاكاة', ratios: [0.3, 0.5, 0.2] }
    }[mode];

    // توزيع الوقت بين القسمين حسب الأداء، بحد أدنى 35% لكل قسم
    const q = result.sections.quant, v = result.sections.verbal;
    const qp = q ? q.pct : 0.5, vp = v ? v.pct : 0.5;
    let quantShare = clamp(0.5 + ((1 - qp) - (1 - vp)) * 0.5, 0.35, 0.65);
    quantShare = Math.round(quantShare * 20) / 20; // لأقرب 5%
    const verbalShare = Math.round((1 - quantShare) * 100) / 100;

    // الأولويات: المهارات التي تحتاج تدريبًا، الأضعف أولًا
    const needs = result.skills.filter(s => s.status === 'needs').sort((a, b) => a.pct - b.pct || b.total - a.total);
    const priorities = needs.slice(0, 3);
    const insufficient = result.skills.filter(s => s.status === 'insufficient');

    // أيام المذاكرة في الأسبوع موزعة بانتظام
    const studyDayIdx = [];
    for (let i = 0; i < daysPerWeek; i++) studyDayIdx.push(Math.floor(i * 7 / daysPerWeek));

    // عدد الجلسات المعروضة: أسبوع كامل، أو الأيام المتبقية إذا كانت أقل
    let sessionsCount = daysPerWeek;
    if (mode === 'intense') sessionsCount = Math.min(daysPerWeek, daysLeft);
    if (mode === 'today') sessionsCount = 0;

    // تحديد قسم كل جلسة
    const quantDays = sessionsCount === 1 ? 0 : Math.round(sessionsCount * quantShare);
    const sectionSeq = [];
    const first = profile.startPref === 'verbal' ? 'verbal' : profile.startPref === 'quant' ? 'quant' : (qp <= vp ? 'quant' : 'verbal');
    const second = first === 'quant' ? 'verbal' : 'quant';
    let nFirst = first === 'quant' ? quantDays : sessionsCount - quantDays;
    let nSecond = sessionsCount - nFirst;
    if (sessionsCount === 1) { nFirst = 0; nSecond = 0; }
    // تناوب يبدأ بالقسم المفضل
    while (sectionSeq.length < sessionsCount) {
      if (sessionsCount === 1) { sectionSeq.push('mixed'); break; }
      if (nFirst > 0) { sectionSeq.push(first); nFirst--; }
      if (sectionSeq.length < sessionsCount && nSecond > 0) { sectionSeq.push(second); nSecond--; }
      if (nFirst === 0 && nSecond === 0) break;
    }

    // اختيار مهارة التركيز لكل جلسة
    const skillQueue = { quant: [], verbal: [] };
    priorities.forEach(s => skillQueue[s.section].push(s));
    needs.slice(3).forEach(s => skillQueue[s.section].push(s));
    const ptr = { quant: 0, verbal: 0 };
    const sectionLabel = { quant: 'الكمي', verbal: 'اللفظي', mixed: 'الكمي واللفظي' };

    const [rLearn, rPractice, rReview] = modeInfo.ratios;
    const sessions = [];
    for (let i = 0; i < sessionsCount; i++) {
      const sec = sectionSeq[i];
      let focus;
      if (sec === 'mixed') {
        focus = priorities.length ? priorities.map(p => p.label).join('، ') : 'مهارات متنوعة من القسمين';
      } else {
        const list = skillQueue[sec];
        focus = list.length ? list[ptr[sec]++ % list.length].label : 'مراجعة عامة لمهارات القسم ' + sectionLabel[sec];
      }
      sessions.push({
        day: mode === 'intense' ? 'الجلسة ' + (i + 1) : WEEKDAYS[studyDayIdx[i]],
        section: sec, sectionLabel: sectionLabel[sec], focus,
        minutes: dailyMin,
        tasks: [
          rLearn ? { kind: 'learn', minutes: round5(dailyMin * rLearn), text: 'راجع فكرة المهارة وطريقة الحل المختصرة' } : null,
          { kind: 'practice', minutes: round5(dailyMin * rPractice), text: 'حل أسئلة تدريبية على المهارة مع ضبط الوقت' },
          { kind: 'review', minutes: round5(dailyMin * rReview), text: 'راجع أخطاءك واكتب سبب كل خطأ' }
        ].filter(Boolean),
        isPracticeTest: false
      });
    }

    // الاختبار التدريبي الدوري
    if (mode === 'staged' || mode === 'focused') {
      if (sessions.length >= 3) {
        const last = sessions[sessions.length - 1];
        last.isPracticeTest = true;
        last.section = 'mixed'; last.sectionLabel = sectionLabel.mixed;
        last.focus = 'اختبار تدريبي قصير لمتابعة التطور';
        last.tasks = [
          { kind: 'test', minutes: round5(dailyMin * 0.6), text: 'أعد اختبار تحديد المستوى أو حل اختبارًا تدريبيًا بوقت محدد' },
          { kind: 'review', minutes: round5(dailyMin * 0.4), text: 'قارن نتيجتك بالسابقة وحدد مهارات الأسبوع القادم' }
        ];
      }
    } else if (mode === 'intense' && sessions.length) {
      if (sessions.length >= 3) {
        const mid = sessions[Math.floor((sessions.length - 1) / 2)];
        mid.isPracticeTest = true;
        mid.section = 'mixed'; mid.sectionLabel = sectionLabel.mixed;
        mid.focus = 'اختبار تدريبي بوقت محدد';
        mid.tasks = [
          { kind: 'test', minutes: round5(dailyMin * 0.6), text: 'حل اختبارًا تدريبيًا كاملًا بوقت محدد' },
          { kind: 'review', minutes: round5(dailyMin * 0.4), text: 'حلل الأخطاء وركز على الأنماط المتكررة' }
        ];
      }
      // الجلسة الأخيرة قبل الاختبار مراجعة خفيفة فقط
      if (sessions.length >= 2 || daysLeft === 1) {
        const lastDay = sessions[sessions.length - 1];
        lastDay.isPracticeTest = false;
        lastDay.section = 'mixed'; lastDay.sectionLabel = sectionLabel.mixed;
        lastDay.focus = 'مراجعة خفيفة قبل الاختبار';
        lastDay.minutes = Math.min(dailyMin, 60);
        lastDay.tasks = [
          { kind: 'review', minutes: round5(Math.min(dailyMin, 60) * 0.7), text: 'راجع ملخص أخطائك والقواعد المختصرة فقط' },
          { kind: 'rest', minutes: round5(Math.min(dailyMin, 60) * 0.3), text: 'جهّز أغراض الاختبار ونم مبكرًا' }
        ];
      }
    }

    // التوصيات حسب المدة المتبقية
    const recs = [];
    if (mode === 'today') {
      recs.push('اختبارك اليوم: لا تبدأ مذاكرة جديدة، راجع ملخص أخطائك فقط.',
        'نظّم وقتك داخل الاختبار ولا تتوقف طويلًا عند سؤال واحد.');
    } else if (mode === 'intense') {
      recs.push('ركّز على المهارات ذات الأولوية بدل محاولة مراجعة كل شيء.',
        'حل أسئلة بوقت محدد لتعتاد سرعة الاختبار.',
        'اجعل اليوم الأخير للمراجعة الخفيفة والراحة.');
    } else if (mode === 'focused') {
      recs.push('خصص معظم الوقت لحل الأسئلة ومراجعة الأخطاء.',
        'أعد الاختبار التشخيصي أسبوعيًا لمتابعة تطورك.',
        'سجّل أخطاءك في دفتر خاص وراجعه قبل كل جلسة.');
    } else {
      recs.push('ابدأ بتأسيس المهارات ذات الأولوية قبل الإكثار من الاختبارات.',
        'زِد نسبة حل الأسئلة تدريجيًا كلما اقترب الموعد.',
        'أعد الاختبار التشخيصي كل أسبوعين لمتابعة تطورك.');
    }
    if (dailyMin > 180) recs.push('قسّم وقت المذاكرة اليومي إلى فترات قصيرة تتخللها استراحات.');
    if (insufficient.length) recs.push('بعض المهارات لم تُختبر بأسئلة كافية؛ الاختبار الشامل يعطي صورة أوضح عنها.');

    const notes = [];
    if (!hasCurrent) notes.push('لم تُدخل درجة حالية، لذلك بُنيت الخطة على نتيجة هذا الاختبار التدريبي فقط، ودقتها محدودة.');
    let gap = null;
    if (hasCurrent) {
      gap = target - current;
      if (gap <= 0) notes.push('درجتك المستهدفة لا تزيد على درجتك الحالية؛ ركّز على تثبيت مستواك وتقليل الأخطاء.');
    }
    notes.push('هذه خطة استرشادية مختصرة، ولا تضمن الوصول إلى درجة معينة.');

    return {
      generatedAt: Date.now(),
      today, daysLeft, mode, modeLabel: modeInfo.label,
      weeksLeft: daysLeft > 0 ? Math.ceil(daysLeft / 7) : 0,
      dailyMin, daysPerWeek,
      weeklyMinutes: mode === 'intense' ? dailyMin * sessions.length : dailyMin * daysPerWeek,
      split: { quant: quantShare, verbal: verbalShare },
      priorities, insufficient, sessions,
      target, current, gap,
      recommendations: recs, notes
    };
  }

  // ---------- الخطة التفصيلية اليومية ----------
  const SKILL_TIPS = {
    ratio: 'حوّل النسبة إلى أجزاء: اقسم المعلوم على عدد أجزائه، ثم اضرب في الأجزاء المطلوبة.',
    percent: 'احفظ المكافئات الشائعة (25% = ربع، 20% = خمس، 12.5% = ثمن)، واحسب نسبة التغير دائمًا من القيمة الأصلية.',
    average: 'المجموع = المتوسط × العدد؛ أغلب مسائل المتوسطات تُحل بالمجموع لا بالمتوسط.',
    arithmetic: 'قدّر الناتج تقريبيًا قبل الحساب لتستبعد الخيارات البعيدة بسرعة.',
    algebra: 'إذا تعقّدت المعادلة جرّب التعويض بالخيارات، وانتبه لإشارة السالب عند فك الأقواس.',
    geometry: 'اكتب المعطيات على الرسم، واحفظ مجموع زوايا المثلث (180) والرباعي (360) وثلاثيات فيثاغورس (3، 4، 5) و(5، 12، 13).',
    stats: 'الاحتمال = الحالات المطلوبة ÷ الحالات الكلية، ورتّب البيانات تصاعديًا قبل إيجاد الوسيط.',
    speed: 'المسافة = السرعة × الزمن؛ في الاتجاهين المتعاكسين اجمع السرعتين، وفي الاتجاه نفسه اطرحهما.',
    comparison: 'جرّب قيمًا مختلفة (موجبة، سالبة، كسور، صفر)؛ إذا تغيّرت نتيجة المقارنة فالمعطيات غير كافية.',
    patterns: 'ابحث عن الفرق بين الحدود، ثم فرق الفروق، ثم الضرب، ثم جمع الحدين السابقين.',
    analogy: 'كوّن جملة قصيرة تربط الكلمتين، ثم طبّق الجملة نفسها على كل خيار.',
    completion: 'انتبه لأدوات الربط (لكن، رغم، لذلك)؛ فهي تحدد هل الفراغ يوافق السياق أو يعاكسه.',
    contextual: 'حدّد الفكرة العامة للجملة أولًا، ثم ابحث عن الكلمة التي تناقضها.',
    reading: 'اقرأ السؤال قبل النص، وابحث عن الدليل داخل النص ولا تعتمد على معلوماتك الخارجية.',
    vocabulary: 'تعلّم الكلمات في جمل لا منفردة، وراجع المترادفات والأضداد الشائعة يوميًا.'
  };
  const PHASES = {
    foundation: 'تأسيس',
    practice: 'تدريب مكثف',
    simulation: 'محاكاة ومراجعة',
    review: 'مراجعة خفيفة'
  };
  // أيام المذاكرة المفضلة: من الأحد إلى الخميس، ثم السبت، ثم الجمعة
  const STUDY_DAY_ORDER = [0, 1, 2, 3, 4, 6, 5];

  function addDaysISO(iso, n) {
    const d = new Date(parseISODate(iso) + n * 86400000);
    const p = x => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }
  function weekdayOf(iso) { return new Date(parseISODate(iso)).getUTCDay(); }

  function generateDetailedPlan(result, profile, opts) {
    const today = opts.today;
    const base = generatePlan(result, profile, opts);
    const maxDays = opts.maxDays || 56;
    const daysLeft = base.daysLeft;
    const horizon = Math.min(daysLeft, maxDays);
    const truncated = daysLeft > maxDays;
    const dailyMin = base.dailyMin;
    const perWeek = base.daysPerWeek;
    const allSkills = opts.skills || {};

    // أوزان المهارات: الضعيفة أكثر، وغير المقاسة بقدر متوسط، والجيدة للمحافظة
    const weights = { quant: {}, verbal: {} };
    Object.keys(allSkills).forEach(k => { const s = allSkills[k].section; if (weights[s]) weights[s][k] = 1; });
    result.skills.forEach(s => {
      weights[s.section] = weights[s.section] || {};
      weights[s.section][s.key] = s.status === 'needs' ? (s.pct < 0.34 ? 4 : 3) : s.status === 'insufficient' ? 2 : 1;
    });
    const labelOf = k => (allSkills[k] && allSkills[k].label) || (result.skills.find(s => s.key === k) || {}).label || k;
    const rr = { quant: {}, verbal: {} };
    function nextSkill(sec) {
      const w = weights[sec], keys = Object.keys(w);
      if (!keys.length) return null;
      let total = 0, best = null;
      keys.forEach(k => { rr[sec][k] = (rr[sec][k] || 0) + w[k]; total += w[k]; if (best === null || rr[sec][k] > rr[sec][best]) best = k; });
      rr[sec][best] -= total;
      return best;
    }

    // تحديد أيام المذاكرة
    const dates = [];
    for (let i = 0; i < horizon; i++) dates.push(addDaysISO(today, i));
    let isStudy;
    if (base.mode === 'intense') {
      const k = Math.min(perWeek, daysLeft);
      isStudy = (d, i) => i >= horizon - k;
    } else {
      const studyWeekdays = new Set(STUDY_DAY_ORDER.slice(0, perWeek));
      // اليوم السابق للاختبار مراجعة خفيفة دائمًا، حتى لو كان يوم راحة
      isStudy = (d, i) => studyWeekdays.has(weekdayOf(d)) || (!truncated && i === daysLeft - 1);
    }
    const studyIdx = [];
    dates.forEach((d, i) => { if (isStudy(d, i)) studyIdx.push(i); });
    // كل أيام المذاكرة حتى الاختبار (لتحديد المرحلة حتى لو اقتُطع العرض)
    let totalStudyUntilExam = studyIdx.length;
    if (truncated) {
      totalStudyUntilExam = 0;
      const sw = new Set(STUDY_DAY_ORDER.slice(0, perWeek));
      for (let i = 0; i < daysLeft; i++) if (sw.has(weekdayOf(addDaysISO(today, i)))) totalStudyUntilExam++;
    }

    function phaseFor(n) {
      const f = totalStudyUntilExam ? n / totalStudyUntilExam : 1;
      if (base.mode === 'intense') return 'simulation';
      if (base.mode === 'focused') return f < 0.6 ? 'practice' : 'simulation';
      return f < 0.4 ? 'foundation' : f < 0.8 ? 'practice' : 'simulation';
    }
    // تقدير واقعي يشمل التفكير والتحقق: دقيقة ونصف للسؤال الكمي ودقيقة للفظي
    const qCount = (sec, min) => Math.max(5, Math.round(min / (sec === 'verbal' ? 1 : 1.5)));
    const secLabel = { quant: 'الكمي', verbal: 'اللفظي', mixed: 'الكمي واللفظي' };

    const split = base.split.quant;
    let qn = 0, vn = 0;
    const firstSec = profile.startPref === 'verbal' ? 'verbal' : profile.startPref === 'quant' ? 'quant'
      : ((result.sections.quant ? result.sections.quant.pct : 0.5) <= (result.sections.verbal ? result.sections.verbal.pct : 0.5) ? 'quant' : 'verbal');
    function pickSection(n) {
      if (n === 0) return firstSec;
      const dq = split * (n + 1) - qn, dv = (1 - split) * (n + 1) - vn;
      return dq >= dv ? 'quant' : 'verbal';
    }

    const days = [];
    let n = 0, totalMinutes = 0, totalQuestions = 0, testDays = 0, sinceTest = 0;
    const skillSessions = {};
    dates.forEach((date, i) => {
      const wd = weekdayOf(date);
      if (!studyIdx.includes(i)) { days.push({ date, weekday: WEEKDAYS[wd], type: 'rest', title: 'راحة', tasks: [] }); return; }
      const phase = phaseFor(n);
      const isLastBeforeExam = !truncated && i === daysLeft - 1;
      let day;
      if (isLastBeforeExam && studyIdx.length > 1) {
        const m = Math.min(dailyMin, 60);
        day = { type: 'study', phase: 'review', section: 'mixed', title: 'مراجعة خفيفة قبل الاختبار', minutes: m, tasks: [
          { text: 'راجع دفتر أخطائك والقواعد المختصرة فقط، ولا تبدأ موضوعًا جديدًا', minutes: round5(m * 0.7) },
          { text: 'جهّز أغراض الاختبار وتأكد من موعده ومكانه، ونم مبكرًا', minutes: round5(m * 0.3) }
        ] };
      } else {
        const testEvery = phase === 'simulation' ? 3 : 7;
        const isTest = (base.mode === 'intense' ? (studyIdx.length >= 3 && n === Math.floor((studyIdx.length - 1) / 2)) : (sinceTest >= testEvery - 1));
        if (isTest) {
          testDays++; sinceTest = 0;
          const full = phase === 'simulation';
          const m1 = round5(dailyMin * 0.6), m2 = round5(dailyMin * 0.4);
          day = { type: 'study', phase, section: 'mixed', isTest: true,
            title: full ? 'اختبار تدريبي كامل بوقت محدد' : 'اختبار قياس التقدم',
            minutes: dailyMin, tasks: [
              { text: full ? 'حل اختبارًا تدريبيًا كاملًا (كمي ولفظي) بوقت محدد ودون توقف' : 'أعد اختبار تحديد المستوى (الشامل) في هذه الأداة', minutes: m1 },
              { text: 'قارن نتيجتك بالسابقة، وحدّد مهارتين تركّز عليهما في الأيام القادمة', minutes: m2 }
            ] };
        } else {
          sinceTest++;
          const sec = pickSection(n);
          if (sec === 'quant') qn++; else vn++;
          const sk = nextSkill(sec) || null;
          const label = sk ? labelOf(sk) : 'مهارات القسم ' + secLabel[sec];
          skillSessions[sk] = (skillSessions[sk] || 0) + 1;
          let tasks;
          if (phase === 'foundation') {
            const a = round5(dailyMin * 0.35), b = round5(dailyMin * 0.45), c = round5(dailyMin * 0.2);
            tasks = [
              { text: `افهم أساسيات «${label}» وطريقة حلها المختصرة`, minutes: a },
              { text: `حل أسئلة على «${label}» دون وقت، وركّز على الطريقة لا السرعة`, minutes: b, questions: qCount(sec, b) },
              { text: 'سجّل كل خطأ في دفتر الأخطاء مع سببه', minutes: c }
            ];
          } else if (phase === 'practice') {
            const a = round5(dailyMin * 0.15), b = round5(dailyMin * 0.6), c = round5(dailyMin * 0.25);
            tasks = [
              { text: `راجع ملخص «${label}» وأخطاءك السابقة فيها`, minutes: a },
              { text: `حل أسئلة على «${label}» بوقت محدد`, minutes: b, questions: qCount(sec, b) },
              { text: 'أعد حل الأسئلة التي أخطأت فيها دون النظر للحل', minutes: c }
            ];
          } else {
            const b = round5(dailyMin * 0.7), c = round5(dailyMin * 0.3);
            tasks = [
              { text: `حل أسئلة متنوعة من القسم ${secLabel[sec]} بوقت محدد، مع تركيز على «${label}»`, minutes: b, questions: qCount(sec, b) },
              { text: 'راجع أخطاءك وحدّد نمطها: سرعة، أم فهم، أم سهو', minutes: c }
            ];
          }
          day = { type: 'study', phase, section: sec, skill: sk, title: label, minutes: dailyMin, tasks, tip: sk ? SKILL_TIPS[sk] : '' };
        }
      }
      day.date = date; day.weekday = WEEKDAYS[wd];
      day.sectionLabel = secLabel[day.section];
      day.phaseLabel = PHASES[day.phase];
      day.questions = day.tasks.reduce((s, t) => s + (t.questions || 0), 0);
      totalMinutes += day.minutes; totalQuestions += day.questions;
      days.push(day);
      n++;
    });
    if (!truncated) {
      const examDate = addDaysISO(today, daysLeft);
      days.push({ date: examDate, weekday: WEEKDAYS[weekdayOf(examDate)], type: 'exam', title: 'يوم الاختبار', tasks: [
        { text: 'تناول فطورًا خفيفًا واحضر قبل الموعد بوقت كافٍ' },
        { text: 'لا تتوقف طويلًا عند سؤال صعب؛ تجاوزه وارجع له في الأخير' }
      ] });
    }

    // تجميع الأسابيع
    const weeks = [];
    days.forEach((d, i) => {
      const w = Math.floor(i / 7);
      (weeks[w] = weeks[w] || { index: w + 1, days: [] }).days.push(d);
    });
    weeks.forEach(w => {
      w.start = w.days[0].date; w.end = w.days[w.days.length - 1].date;
      w.studyDays = w.days.filter(d => d.type === 'study').length;
      w.minutes = w.days.reduce((s, d) => s + (d.minutes || 0), 0);
      w.questions = w.days.reduce((s, d) => s + (d.questions || 0), 0);
    });

    // نطاقات المراحل للعرض
    const phases = [];
    days.filter(d => d.type === 'study').forEach(d => {
      const last = phases[phases.length - 1];
      if (last && last.key === d.phase) { last.end = d.date; last.days++; }
      else phases.push({ key: d.phase, label: PHASES[d.phase], start: d.date, end: d.date, days: 1 });
    });

    return {
      today, daysLeft, mode: base.mode, modeLabel: base.modeLabel, truncated, horizon, maxDays,
      dailyMin, daysPerWeek: perWeek, split: base.split, priorities: base.priorities,
      days, weeks, phases,
      totals: { studyDays: days.filter(d => d.type === 'study').length, minutes: totalMinutes, questions: totalQuestions, testDays },
      skillSessions,
      notes: base.notes
    };
  }

  return {
    mulberry32, shuffle, validateQuestion, optionsOf, eligibleQuestions, poolSummary, sectionPools,
    sampleSection, buildAttempt, recordAnswer, unansweredIndexes, scoreAttempt, levelFor,
    parseISODate, todayISO, daysBetween, validateProfile, generatePlan, generateDetailedPlan, addDaysISO, SKILL_TIPS, WEEKDAYS
  };
});
