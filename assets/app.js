/*
 * واجهة «كم باقي على هدفك؟» — تطبيق صفحة واحدة بتوجيه عبر الرابط (#/...).
 * لا خادم، لا تتبع، لا تسجيل دخول. كل البيانات على جهاز الطالب فقط.
 */
(function () {
  'use strict';
  const C = window.APP_CONFIG, B = window.QB, E = window.Engine;
  const app = document.getElementById('app');
  const topExtra = document.getElementById('topbar-extra');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');

  // ---------- فحص التحميل ----------
  if (!C || !B || !E || !Array.isArray(B.questions) || !B.skills || !B.sections) {
    app.innerHTML = '<div class="card empty"><div class="icon">!</div><h1>تعذّر تحميل الأداة</h1><p class="muted">حدث خطأ في تحميل ملفات بنك الأسئلة. حدّث الصفحة وحاول مرة أخرى.</p><button class="btn btn-primary" onclick="location.reload()">تحديث الصفحة</button></div>';
    return;
  }
  const byId = {};
  B.questions.forEach(q => { byId[q.id] = q; });

  // ---------- التخزين المحلي ----------
  const fresh = () => ({ v: 1, attempt: null, profile: null, prefs: {} });
  let storageOk = true;
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(C.storageKey) || 'null');
      if (s && s.v === 1) return Object.assign(fresh(), s);
    } catch (e) { storageOk = false; }
    return fresh();
  }
  let state = load();
  function save() {
    try { localStorage.setItem(C.storageKey, JSON.stringify(state)); storageOk = true; }
    catch (e) {
      if (storageOk) toast('تعذّر الحفظ على هذا الجهاز؛ لا تغلق الصفحة قبل إنهاء الاختبار.', 'error');
      storageOk = false;
    }
  }
  function clearAll() { state = fresh(); try { localStorage.removeItem(C.storageKey); } catch (e) { /* لا شيء */ } }

  // التحقق من سلامة المحاولة المحفوظة (قد يتغير البنك بعد الحفظ)
  if (state.attempt) {
    const a = state.attempt;
    const valid = Array.isArray(a.questionIds) && a.questionIds.length && a.questionIds.every(id => byId[id]) && a.optionOrder && a.answers;
    if (!valid) { state.attempt = null; save(); }
  }

  const inProgress = () => state.attempt && !state.attempt.submittedAt;
  const submitted = () => state.attempt && state.attempt.submittedAt;
  let resultCache = null;
  function result() {
    if (!submitted()) return null;
    if (!resultCache || resultCache.attemptId !== state.attempt.id) resultCache = E.scoreAttempt(state.attempt, B, C);
    return resultCache;
  }

  // ---------- أدوات العرض ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // المعادلات تُعرض من اليسار لليمين؛ علامة LRM حول الحروف العربية تمنع انقلاب الأرقام بعدها (مثل 2س = 14)
  const LRM = '\u200E';
  const mathHtml = m => '<span class="math" dir="ltr">' + LRM + m.replace(/([\u0600-\u06FF]+)/g, LRM + '$1' + LRM) + LRM + '</span>';
  const fmt = s => String(s == null ? '' : s).split(/\[\[(.+?)\]\]/).map((part, i) => i % 2
    ? mathHtml(esc(part))
    : esc(part).replace(/\(?\d[\d\s.×÷+−=\/()%°²]*[\d)%°²](?:\s?سم²)?|\d+\s?سم²/g,
        m => /[×÷+−=\/°²]/.test(m) && !/^\s|\s$/.test(m) ? mathHtml(m) : m)
  ).join('').replace(/\n/g, '<br>');
  const pct = x => Math.round(x * 100) + '%';
  const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  const optsOf = q => E.optionsOf(q, B);

  function plural(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return n + ' ' + few;
    return n + ' ' + many;
  }
  const daysTxt = n => plural(n, 'يوم واحد', 'يومان', 'أيام', 'يومًا');
  function durTxt(min) {
    const h = Math.floor(min / 60), m = min % 60;
    const hTxt = h ? plural(h, 'ساعة', 'ساعتان', 'ساعات', 'ساعة') : '';
    const mTxt = m ? (m >= 3 && m <= 10 ? m + ' دقائق' : m + ' دقيقة') : '';
    return [hTxt, mTxt].filter(Boolean).join(' و') || '0 دقيقة';
  }
const figHtml = q => q.figure ? `<figure class="q-fig"><img src="${esc(q.figure)}" alt="${esc(q.figureAlt || 'الشكل المرفق بالسؤال')}" loading="lazy" decoding="async"></figure>` : '';
  const sectionName = s => s === 'quant' ? 'الكمي' : s === 'verbal' ? 'اللفظي' : 'الكمي واللفظي';

  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.className = 'toast'; }, 3200);
  }

  function modal({ title, body, actions }) {
    const lastFocus = document.activeElement;
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close="1"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <h2 id="m-title">${esc(title)}</h2>${body}
      <div class="btn-row">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div></div>`;
    const close = () => { modalRoot.innerHTML = ''; document.removeEventListener('keydown', onKey); if (lastFocus && lastFocus.focus) lastFocus.focus(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    modalRoot.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.dataset.close) close();
      const btn = e.target.closest('[data-act]');
      if (btn) { const a = actions[+btn.dataset.act]; close(); if (a.onClick) a.onClick(); }
    });
    const first = modalRoot.querySelector('[data-act]');
    if (first) first.focus();
    return close;
  }

  function withLoading(text, fn, ms) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.setAttribute('role', 'status');
    ov.innerHTML = `<div class="center"><div class="spinner" aria-hidden="true"></div><p class="muted">${esc(text)}</p></div>`;
    document.body.appendChild(ov);
    setTimeout(() => { ov.remove(); fn(); }, ms || 650);
  }

  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  // ---------- المؤقت ----------
  let timerInt = null;
  function stopTimer() { clearInterval(timerInt); timerInt = null; }
  function timeLeft() { return Math.max(0, Math.round((state.attempt.timer.endsAt - Date.now()) / 1000)); }
  function fmtClock(s) { const m = Math.floor(s / 60), r = s % 60; return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0'); }
  function startTimer() {
    stopTimer();
    if (!inProgress() || !state.attempt.timer.enabled) return;
    const tick = () => {
      const el = document.getElementById('timer');
      const left = timeLeft();
      if (el) { el.textContent = fmtClock(left); el.classList.toggle('low', left <= 60); el.setAttribute('aria-label', 'الوقت المتبقي ' + fmtClock(left)); }
      if (left <= 0) { stopTimer(); submitAttempt(true); }
    };
    tick();
    timerInt = setInterval(tick, 1000);
  }

  // ---------- التوجيه ----------
  const routes = {
    '': renderHome, 'start': renderStart, 'quiz': renderQuiz, 'review': renderReview,
    'result': renderResult, 'analysis': renderAnalysis, 'answers': renderAnswers,
    'plan': renderPlan, 'plan/edit': renderPlanForm, 'retake': renderRetake
  };
  function route() {
    const path = location.hash.replace(/^#\/?/, '');
    const fn = routes[path] || renderNotFound;
    if (path !== 'quiz') stopTimer();
    topExtra.textContent = '';
    modalRoot.innerHTML = '';
    fn();
    window.scrollTo(0, 0);
    const h = app.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  window.addEventListener('hashchange', route);

  // ---------- 1) الصفحة الرئيسية ----------
  function renderHome() {
    document.title = 'كم باقي على هدفك؟';
    let resume = '';
    if (inProgress()) {
      const a = state.attempt;
      resume = `<div class="card resume"><p>لديك اختبار لم يكتمل (أجبت عن ${Object.keys(a.answers).length} من ${a.questionIds.length}).</p><a class="btn btn-primary" href="#/quiz">أكمل الاختبار</a></div>`;
    } else if (submitted()) {
      resume = `<div class="card resume"><p>نتيجتك الأخيرة محفوظة على هذا الجهاز.</p><a class="btn btn-primary" href="#/result">اعرض نتيجتي</a></div>`;
    }
    app.innerHTML = `
      <section class="hero enter">
        <span class="hero-eyebrow">اختبار القدرات العامة · الكمي واللفظي</span>
        <h1>كم باقي على <span class="accent">هدفك؟</span></h1>
        <p class="subtitle">اختبر مستواك في القدرات، واكتشف نقاط قوتك، وابدأ خطة مذاكرة تناسبك.</p>
        <p class="desc">جاوب عن الأسئلة، تعرّف على مستواك الحالي، واحصل على تصور واضح للخطوات القادمة نحو هدفك.</p>
        <a class="btn btn-gold" href="#/start">ابدأ اختبار تحديد المستوى</a>
      </section>
      ${resume}
      <div class="features">
        <div class="feature"><div class="feature-num">1</div><div><h3>اختبر مستواك</h3><p>أسئلة كمية ولفظية، سؤال واحد في كل شاشة.</p></div></div>
        <div class="feature"><div class="feature-num">2</div><div><h3>اكتشف نقاط ضعفك</h3><p>تحليل لكل قسم ولكل مهارة اختُبرت بأسئلة كافية.</p></div></div>
        <div class="feature"><div class="feature-num">3</div><div><h3>احصل على خطة مذاكرة مختصرة</h3><p>جدول أسبوعي يناسب موعد اختبارك ووقتك المتاح.</p></div></div>
      </div>
      <div class="note"><strong>تنويه:</strong> هذا اختبار تدريبي تشخيصي، وليس اختبارًا رسميًا ولا بديلًا عن اختبار القدرات الفعلي، ولا يتنبأ بدرجتك الرسمية. مجاني، دون تسجيل دخول، ولا نطلب أي بيانات شخصية.</div>`;
  }

  // ---------- 2) صفحة بيانات الاختبار ----------
  function renderStart() {
    document.title = 'بيانات الاختبار — كم باقي على هدفك؟';
    const tj = E.poolSummary(B, 'tajmeeat', C), orig = E.poolSummary(B, 'original', C);
    const prefs = state.prefs || {};
    let pool = prefs.pool;
    if (!pool || !(pool === 'tajmeeat' ? tj.usable : orig.usable)) pool = tj.usable ? 'tajmeeat' : orig.usable ? 'original' : null;
    let lengthKey = C.testLengths[prefs.lengthKey] ? prefs.lengthKey : C.defaultLength;
    let timerOn = prefs.timer != null ? !!prefs.timer : !!C.timer.defaultEnabled;

    if (!pool) {
      app.innerHTML = `<div class="card empty"><div class="icon">!</div><h1>الاختبار غير متاح حاليًا</h1><p class="muted">لا توجد أسئلة معتمدة كافية لبدء الاختبار. نعمل على إضافتها قريبًا.</p><a class="btn btn-ghost" href="#/">العودة للرئيسية</a></div>`;
      return;
    }

    const tjDesc = () => {
      const sp = tj.sectionPools, parts = [];
      if (sp.quant === 'tajmeeat') parts.push(`القسم الكمي من التجميعات (${tj.bySection.quant} سؤالًا معتمدًا)`);
      if (sp.verbal === 'tajmeeat') parts.push(`القسم اللفظي من التجميعات (${tj.bySection.verbal} سؤالًا معتمدًا)`);
      if (sp.quant === 'original') parts.push('القسم الكمي من الأسئلة التدريبية الأصلية');
      if (sp.verbal === 'original') parts.push('القسم اللفظي من الأسئلة التدريبية الأصلية إلى أن تُضاف تجميعات لفظية');
      return parts.join('، و') + '. يظهر مصدر كل سؤال عليه.';
    };
    const lenInfo = k => { const L = C.testLengths[k]; const n = L.quant + L.verbal; return `${n} سؤالًا (${L.quant} كمي، ${L.verbal} لفظي) · قرابة ${Math.round(n * C.timer.secondsPerQuestion / 60)} دقيقة`; };
    const hasOld = inProgress() || submitted();

    function draw() {
      app.innerHTML = `
        <h1>قبل أن تبدأ</h1>
        <div class="card enter">
          <h2>طبيعة الاختبار</h2>
          <ul class="rules">
            <li>اختبار تدريبي تشخيصي يقيس مستواك في <strong>القدرات الكمية</strong> و<strong>القدرات اللفظية</strong>.</li>
            <li>سؤال واحد في كل شاشة، ويمكنك التنقل بين الأسئلة وتغيير إجابتك قبل التسليم.</li>
            <li>لن تظهر الإجابات الصحيحة إلا بعد التسليم، ومعها شرح لكل سؤال.</li>
            <li>تُحفظ إجاباتك على جهازك تلقائيًا، فلا تفقد تقدمك إذا خرجت من الصفحة.</li>
          </ul>
        </div>

        <div class="card">
          <h2>مصدر الأسئلة</h2>
          <div class="choice-list" role="radiogroup" aria-label="مصدر الأسئلة">
            <button class="choice" role="radio" data-pool="tajmeeat" aria-checked="${pool === 'tajmeeat'}" aria-disabled="${!tj.usable}">
              <span class="dot"></span><span><strong>أسئلة التجميعات <span class="badge badge-tj">موثقة المصدر</span></strong>
              <span class="sub">${tj.usable ? tjDesc() : 'لم تُضف أسئلة تجميعات موثقة بعد، وستتاح عند اعتمادها.'}</span></span>
            </button>
            <button class="choice" role="radio" data-pool="original" aria-checked="${pool === 'original'}" aria-disabled="${!orig.usable}">
              <span class="dot"></span><span><strong>أسئلة تدريبية أصلية <span class="badge badge-orig">ليست من التجميعات</span></strong>
              <span class="sub">أسئلة كُتبت خصيصًا لهذه الأداة على نمط القدرات، وليست منقولة من التجميعات أو من اختبار رسمي.</span></span>
            </button>
          </div>
        </div>

        <div class="card">
          <h2>طول الاختبار</h2>
          <div class="choice-list" role="radiogroup" aria-label="طول الاختبار">
            ${Object.keys(C.testLengths).map(k => `
              <button class="choice" role="radio" data-len="${k}" aria-checked="${lengthKey === k}">
                <span class="dot"></span><span><strong>${esc(C.testLengths[k].label)}</strong><span class="sub">${lenInfo(k)}</span></span>
              </button>`).join('')}
          </div>
          <p class="small muted" style="margin:10px 0 0">الاختبار الشامل يقيس مهارات أكثر، فيعطي تحليلًا وخطة أدق.</p>
        </div>

        <div class="card">
          <div class="switch-row">
            <div><h2 style="margin:0">المؤقت</h2><p class="small muted" style="margin:0">اختياري: دقيقة لكل سؤال تقريبًا، ويُسلَّم الاختبار تلقائيًا عند انتهاء الوقت.</p></div>
            <button class="switch" role="switch" id="timer-switch" aria-checked="${timerOn}" aria-label="تفعيل المؤقت"></button>
          </div>
        </div>

        ${hasOld ? '<div class="note note-gold">لديك محاولة سابقة على هذا الجهاز. بدء اختبار جديد يبدأ من الصفر ويستبدل المحاولة السابقة ونتيجتها.</div>' : ''}
        <button class="btn btn-primary btn-block" id="go">ابدأ الاختبار</button>
        <p class="center" style="margin-top:8px"><a href="#/">العودة للرئيسية</a></p>`;

      app.querySelectorAll('[data-pool]').forEach(b => b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') === 'true') { toast('هذا المصدر غير متاح حاليًا'); return; }
        pool = b.dataset.pool; draw();
      }));
      app.querySelectorAll('[data-len]').forEach(b => b.addEventListener('click', () => { lengthKey = b.dataset.len; draw(); }));
      app.querySelector('#timer-switch').addEventListener('click', () => { timerOn = !timerOn; draw(); app.querySelector('#timer-switch').focus(); });
      app.querySelector('#go').addEventListener('click', () => {
        const begin = () => {
          try {
            state.attempt = E.buildAttempt(B, C, { pool, lengthKey, timer: timerOn, seed: (Math.random() * 2 ** 31) | 0 });
          } catch (e) { toast('تعذّر تجهيز الاختبار، حاول مرة أخرى.', 'error'); return; }
          state.prefs = { pool, lengthKey, timer: timerOn };
          resultCache = null; save();
          go('#/quiz');
        };
        if (hasOld) modal({
          title: 'بدء محاولة جديدة؟',
          body: '<p>المحاولة الجديدة ستبدأ من الصفر، وستُستبدل إجاباتك ونتيجتك السابقة على هذا الجهاز. بيانات خطتك (موعد الاختبار ووقت المذاكرة) ستبقى محفوظة.</p>',
          actions: [{ label: 'ابدأ من الصفر', cls: 'btn-primary', onClick: begin }, { label: 'إلغاء' }]
        });
        else begin();
      });
    }
    draw();
  }

  // ---------- 3) شاشة الأسئلة ----------
  function renderQuiz() {
    if (!inProgress()) { go(submitted() ? '#/result' : '#/start'); return; }
    const a = state.attempt;
    if (a.timer.enabled && timeLeft() <= 0) { submitAttempt(true); return; }
    document.title = 'الاختبار — كم باقي على هدفك؟';
    const n = a.questionIds.length;
    const i = Math.min(Math.max(0, a.current || 0), n - 1);
    const q = byId[a.questionIds[i]];
    const order = a.optionOrder[q.id];
    const opts = optsOf(q);
    const chosen = a.answers[q.id];
    const answeredCount = Object.keys(a.answers).length;
    const longOpts = order.some(id => (opts.find(o => o.id === id).text || '').length > 28);

    app.innerHTML = `
      <div class="quiz-head">
        <span class="counter">${q.section === 'quant' ? 'القسم الكمي' : 'القسم اللفظي'} · السؤال <span class="num">${i + 1}</span> من <span class="num">${n}</span></span>
        ${a.timer.enabled ? '<span class="timer" id="timer" role="timer"></span>' : ''}
      </div>
      <div class="progress" role="progressbar" aria-label="نسبة الأسئلة المجابة" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${answeredCount}"><i style="width:${(answeredCount / n) * 100}%"></i></div>
      <article class="card q-card enter" aria-labelledby="q-stem">
        <h1 class="sr-only">السؤال ${i + 1}</h1>
        <div class="q-meta">${q.pool === 'original' ? '<span class="badge badge-orig">سؤال تدريبي أصلي — ليس من التجميعات</span>' : '<span class="badge badge-tj">من التجميعات</span>'}</div>
        ${q.passage ? `<div class="passage"><span class="passage-label">اقرأ النص ثم أجب:</span>${fmt(q.passage)}</div>` : ''}
        <div class="q-stem" id="q-stem">${fmt(q.stem)}</div>
        ${figHtml(q)}
        <div class="options ${longOpts || q.skill === 'comparison' ? 'single-col' : ''}" role="radiogroup" aria-labelledby="q-stem">
          ${order.map((oid, k) => {
            const o = opts.find(x => x.id === oid);
            return `<button class="opt" role="radio" data-opt="${esc(oid)}" aria-checked="${chosen === oid}"><span class="letter">${LETTERS[k]}</span><span>${fmt(o.text)}</span></button>`;
          }).join('')}
        </div>
        <div class="quiz-tools">
          <button class="link-btn flag-btn" id="flag" aria-pressed="${!!a.flags[q.id]}">${a.flags[q.id] ? '★ معلَّم للمراجعة' : '☆ علّم للمراجعة'}</button>
          <a class="link-btn" href="#/review">كل الأسئلة والتسليم</a>
        </div>
      </article>
      <div class="quiz-nav">
        <button class="btn btn-ghost" id="prev" ${i === 0 ? 'disabled' : ''}>السابق</button>
        ${i < n - 1 ? '<button class="btn btn-primary" id="next">التالي</button>' : '<button class="btn btn-gold" id="to-review">مراجعة قبل التسليم</button>'}
      </div>`;

    app.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      E.recordAnswer(a, q.id, b.dataset.opt); save();
      app.querySelectorAll('[data-opt]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      const done = Object.keys(a.answers).length;
      const bar = app.querySelector('.progress');
      bar.setAttribute('aria-valuenow', done);
      bar.firstElementChild.style.width = (done / n) * 100 + '%';
    }));
    const move = d => { a.current = i + d; save(); renderQuiz(); window.scrollTo(0, 0); };
    app.querySelector('#prev').addEventListener('click', () => move(-1));
    const next = app.querySelector('#next');
    if (next) next.addEventListener('click', () => move(1));
    const tr = app.querySelector('#to-review');
    if (tr) tr.addEventListener('click', () => go('#/review'));
    app.querySelector('#flag').addEventListener('click', () => {
      if (a.flags[q.id]) delete a.flags[q.id]; else a.flags[q.id] = true;
      save(); renderQuiz();
    });
    startTimer();
  }

  // ---------- مراجعة قبل التسليم ----------
  function renderReview() {
    if (!inProgress()) { go(submitted() ? '#/result' : '#/start'); return; }
    document.title = 'مراجعة الإجابات قبل التسليم — كم باقي على هدفك؟';
    const a = state.attempt, n = a.questionIds.length;
    const un = E.unansweredIndexes(a);
    const flagged = a.questionIds.filter(id => a.flags[id]).length;
    app.innerHTML = `
      <h1>مراجعة قبل التسليم</h1>
      ${a.timer.enabled ? '<p>الوقت المتبقي: <span class="timer" id="timer"></span></p>' : ''}
      <div class="card enter">
        <div class="stats" style="margin-top:0">
          <div class="stat"><b>${n}</b><span>عدد الأسئلة</span></div>
          <div class="stat good"><b>${n - un.length}</b><span>مجاب</span></div>
          <div class="stat skip"><b>${un.length}</b><span>غير مجاب</span></div>
          <div class="stat"><b>${flagged}</b><span>معلَّم للمراجعة</span></div>
        </div>
      </div>
      <div class="card">
        <h2>اضغط رقم السؤال للانتقال إليه</h2>
        <div class="q-grid">
          ${a.questionIds.map((id, k) => `<button class="grid-q ${a.answers[id] ? 'answered' : ''} ${a.flags[id] ? 'flagged' : ''}" data-go="${k}" aria-label="السؤال ${k + 1}${a.answers[id] ? '، مجاب' : '، غير مجاب'}${a.flags[id] ? '، معلَّم' : ''}">${k + 1}</button>`).join('')}
        </div>
        <p class="legend"><span><i class="l-ans"></i>مجاب</span><span><i></i>غير مجاب</span><span><i class="l-flag"></i>معلَّم للمراجعة</span></p>
      </div>
      <button class="btn btn-gold btn-block" id="submit">اعرض نتيجتي</button>
      <p class="center" style="margin-top:8px"><a href="#/quiz">العودة إلى الأسئلة</a></p>`;
    app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { a.current = +b.dataset.go; save(); go('#/quiz'); }));
    app.querySelector('#submit').addEventListener('click', () => {
      if (un.length) {
        const nums = un.map(k => k + 1).join('، ');
        const actions = [{ label: 'ارجع للإجابة', cls: 'btn-primary', onClick: () => { a.current = un[0]; save(); go('#/quiz'); } }];
        if (C.allowSubmitWithUnanswered) actions.push({ label: 'سلّم الآن', onClick: () => submitAttempt(false) });
        modal({
          title: un.length === 1 ? 'لديك سؤال غير مجاب' : `لديك ${un.length} أسئلة غير مجابة`,
          body: `<p>أرقام الأسئلة غير المجابة: <strong>${nums}</strong></p><p class="muted small">${C.allowSubmitWithUnanswered ? 'إذا سلّمت الآن ستُحتسب هذه الأسئلة غير مجابة.' : 'أجب عن جميع الأسئلة قبل التسليم.'}</p>`,
          actions
        });
      } else submitAttempt(false);
    });
    startTimer();
  }

  function submitAttempt(byTimer) {
    if (!inProgress()) return;
    stopTimer();
    state.attempt.submittedAt = Date.now();
    resultCache = null; save();
    withLoading('جارٍ تصحيح إجاباتك…', () => {
      go('#/result');
      toast(byTimer ? 'انتهى الوقت وتم تسليم الاختبار.' : 'تم تسليم الاختبار بنجاح.', byTimer ? '' : 'success');
    });
  }

  // ---------- صفحات النتيجة ----------
  function subnav(active) {
    const items = [['result', 'النتيجة'], ['analysis', 'المهارات'], ['answers', 'الإجابات'], ['plan', 'خطتي']];
    return `<nav class="subnav" aria-label="أقسام التقرير">${items.map(([k, l]) => `<a href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  }
  function needResult() {
    if (result()) return true;
    app.innerHTML = `<div class="card empty"><div class="icon">؟</div><h1>لا توجد نتيجة بعد</h1>
      <p class="muted">${inProgress() ? 'لديك اختبار لم يكتمل. أكمله ثم سلّمه لتظهر نتيجتك.' : 'ابدأ اختبار تحديد المستوى لتظهر نتيجتك هنا.'}</p>
      <a class="btn btn-primary" href="${inProgress() ? '#/quiz' : '#/start'}">${inProgress() ? 'أكمل الاختبار' : 'ابدأ اختبار تحديد المستوى'}</a></div>`;
    return false;
  }
  function ring(p) {
    const r = 52, c = 2 * Math.PI * r;
    return `<div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="${r}" fill="none" stroke-width="12"/>
      <circle class="bar" cx="60" cy="60" r="${r}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - p)}"/></svg>
      <div class="val"><span><b>${pct(p)}</b><small>نسبة الصواب</small></span></div></div>`;
  }
  function animateBars() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      app.querySelectorAll('[data-target]').forEach(el => { el.style.strokeDashoffset = el.dataset.target; });
      app.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w; });
    }));
  }
  const poolNote = () => {
    const sp = (state.attempt && state.attempt.sectionPools) || {};
    const pool = state.attempt && state.attempt.pool;
    let t;
    if (pool === 'original') t = 'أُجري هذا الاختبار بأسئلة تدريبية أصلية، وليست من التجميعات.';
    else if (sp.quant === 'tajmeeat' && sp.verbal === 'original') t = 'القسم الكمي من أسئلة التجميعات، والقسم اللفظي من الأسئلة التدريبية الأصلية.';
    else if (sp.quant === 'original' && sp.verbal === 'tajmeeat') t = 'القسم اللفظي من أسئلة التجميعات، والقسم الكمي من الأسئلة التدريبية الأصلية.';
    else t = 'أُجري هذا الاختبار بأسئلة من التجميعات.';
    return `<p class="small muted" style="margin:6px 0 0">${t}</p>`;
  };

  // 4) النتيجة العامة
  function renderResult() {
    document.title = 'نتيجتي — كم باقي على هدفك؟';
    if (!needResult()) return;
    const r = result();
    app.innerHTML = `
      <h1>نتيجتك في الاختبار التدريبي</h1>
      ${subnav('result')}
      <div class="card enter">
        <div class="score-hero">
          ${ring(r.pct)}
          <div>
            <span class="level-chip level-${r.level.key}">${esc(r.level.label)}</span>
            <p class="small muted" style="margin:0">تصنيف داخلي لهذا الاختبار التدريبي فقط، وليس درجة القدرات الرسمية ولا توقعًا لها.</p>
            ${poolNote(r)}
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>${r.total}</b><span>عدد الأسئلة</span></div>
          <div class="stat good"><b>${r.correct}</b><span>إجابات صحيحة</span></div>
          <div class="stat bad"><b>${r.wrong}</b><span>إجابات خاطئة</span></div>
          <div class="stat skip"><b>${r.unanswered}</b><span>غير مجابة</span></div>
        </div>
      </div>
      <h2 class="section-title">الكمي واللفظي</h2>
      <div class="card">
        ${Object.values(r.sections).map(s => `
          <div class="sec-row">
            <div class="top"><span>${esc(s.label)}</span><span class="num">${s.correct} من ${s.total} · ${pct(s.pct)}</span></div>
            <div class="bar ${s.key === 'verbal' ? 'gold' : ''}"><i style="width:0" data-w="${pct(s.pct)}"></i></div>
          </div>`).join('')}
      </div>
      <div class="btn-row">
        <a class="btn btn-primary" href="#/analysis">تحليل المهارات</a>
        <a class="btn btn-ghost" href="#/answers">مراجعة الإجابات والشرح</a>
      </div>
      <a class="btn btn-gold btn-block" style="margin-top:10px" href="#/plan">احصل على خطتك المجانية</a>
      <p class="center" style="margin-top:10px"><a href="#/retake">إعادة الاختبار</a></p>`;
    animateBars();
  }

  // 5) تحليل الكمي واللفظي والمهارات
  function renderAnalysis() {
    document.title = 'تحليل المهارات — كم باقي على هدفك؟';
    if (!needResult()) return;
    const r = result();
    const groups = [
      ['good', 'g-good', 'أداء جيد', 'أداؤك جيد في الأسئلة التي تم اختبارها.'],
      ['needs', 'g-needs', 'تحتاج تدريبًا إضافيًا', 'تحتاج هذه المهارة إلى مزيد من التدريب.'],
      ['insufficient', 'g-ins', 'بيانات غير كافية', 'نحتاج إلى أسئلة إضافية لتحديد مستواك بدقة أكبر.']
    ];
    const sectionBlock = sec => {
      const s = r.sections[sec];
      if (!s) return '';
      const list = r.skills.filter(k => k.section === sec);
      return `
        <h2 class="section-title">${esc(s.label)} <span class="muted small num">(${pct(s.pct)})</span></h2>
        ${groups.map(([st, cls, title, msg]) => {
          const items = list.filter(k => k.status === st).sort((x, y) => y.pct - x.pct);
          if (!items.length) return '';
          return `<div class="skill-group ${cls}"><div class="skill-group-head"><span class="pill">${title}</span></div>
            ${items.map(k => `<div class="skill-card"><div class="top"><span>${esc(k.label)}</span><span class="num">${k.correct} من ${k.total}</span></div>
              <p class="msg">${msg}${st === 'insufficient' ? ` (اختُبرت ${k.total === 1 ? 'بسؤال واحد' : k.total === 2 ? 'بسؤالين' : 'ب' + k.total + ' أسئلة'} فقط)` : ''}</p>
              <div class="bar"><i style="width:0" data-w="${pct(k.pct)}"></i></div></div>`).join('')}</div>`;
        }).join('')}`;
    };
    app.innerHTML = `
      <h1>تحليل المهارات</h1>
      ${subnav('analysis')}
      <div class="note">تظهر هنا المهارات التي ظهرت في اختبارك فقط. لا تُقيَّم المهارة إلا إذا اختُبرت بـ${C.minQuestionsPerSkill} أسئلة على الأقل، لأن سؤالًا أو سؤالين لا يكفيان للحكم.</div>
      <div class="card enter">
        <h2>مقارنة القسمين</h2>
        ${Object.values(r.sections).map(s => `<div class="sec-row"><div class="top"><span>${esc(s.label)}</span><span class="num">${pct(s.pct)}</span></div><div class="bar ${s.key === 'verbal' ? 'gold' : ''}"><i style="width:0" data-w="${pct(s.pct)}"></i></div></div>`).join('')}
      </div>
      ${sectionBlock('quant')}${sectionBlock('verbal')}
      <a class="btn btn-gold btn-block" href="#/plan" style="margin-top:8px">احصل على خطتك المجانية</a>`;
    animateBars();
  }

  // 6) مراجعة الإجابات
  function renderAnswers() {
    document.title = 'مراجعة الإجابات — كم باقي على هدفك؟';
    if (!needResult()) return;
    const r = result();
    const a = state.attempt;
    const counts = { all: r.items.length, wrong: r.wrong, skip: r.unanswered, right: r.correct };
    let filter = 'all';
    const sourceTxt = q => {
      const s = B.sources.find(x => x.id === q.source.sourceId);
      if (q.pool === 'original') return 'المصدر: قسم الأسئلة التدريبية الأصلية للأداة (ليس من التجميعات)';
      const parts = [s ? s.title : q.source.sourceId];
      if (q.source.number) parts.push(typeof q.source.number === 'number' ? 'سؤال رقم ' + q.source.number : q.source.number);
      if (q.source.page) parts.push('صفحة ' + q.source.page + ' في الملف');
      if (s && s.compiler) parts.push(s.compiler);
      return 'المصدر: ' + parts.map(esc).join(' · ');
    };
    function draw() {
      const list = r.items.map((it, k) => ({ it, k })).filter(({ it }) =>
        filter === 'all' || (filter === 'wrong' && it.answered && !it.correct) || (filter === 'skip' && !it.answered) || (filter === 'right' && it.correct));
      app.innerHTML = `
        <h1>مراجعة الإجابات</h1>
        ${subnav('answers')}
        <div class="chips" role="group" aria-label="تصفية الأسئلة">
          ${[['all', 'الكل'], ['wrong', 'الخاطئة'], ['skip', 'غير المجابة'], ['right', 'الصحيحة']].map(([k, l]) =>
            `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l} (${counts[k]})</button>`).join('')}
        </div>
        ${list.length ? '' : '<div class="card empty"><p class="muted">لا توجد أسئلة في هذا التصنيف.</p></div>'}
        ${list.map(({ it, k }) => {
          const q = byId[it.id], opts = optsOf(q), order = a.optionOrder[q.id];
          const state_ = !it.answered ? '<span class="state skip">غير مجاب</span>' : it.correct ? '<span class="state ok">إجابة صحيحة</span>' : '<span class="state no">إجابة خاطئة</span>';
          return `<article class="card ans-card">
            <div class="q-head"><strong>السؤال ${k + 1} · ${esc(B.skills[q.skill].label)}</strong>${state_}</div>
            ${q.passage ? `<div class="passage"><span class="passage-label">النص:</span>${fmt(q.passage)}</div>` : ''}
            <div class="q-stem" style="font-size:1.05rem;margin-bottom:6px">${fmt(q.stem)}</div>
            ${figHtml(q)}
            <ul class="ans-opts">
              ${order.map((oid, j) => {
                const o = opts.find(x => x.id === oid);
                const isCorrect = oid === q.answer, isChosen = oid === it.given;
                const cls = isCorrect ? 'correct' : isChosen ? 'chosen-wrong' : '';
                const tag = isCorrect && isChosen ? 'إجابتك · الصحيحة' : isCorrect ? 'الإجابة الصحيحة' : isChosen ? 'إجابتك' : '';
                return `<li class="${cls}"><span>${LETTERS[j]}) ${fmt(o.text)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</li>`;
              }).join('')}
            </ul>
            ${!it.answered ? '<p class="small muted" style="margin-top:-4px">لم تختر إجابة لهذا السؤال.</p>' : ''}
            <div class="explain">
              <h4>${q.explanationSource === 'source' ? 'شرح الحل (من المصدر)' : 'شرح الحل (شرح تعليمي من إعداد الأداة)'}</h4>
              ${q.explanation ? fmt(q.explanation) : '<span class="muted">لا يتوفر شرح لهذا السؤال حاليًا.</span>'}
              ${q.shortcut ? `<div class="shortcut"><strong>طريقة مختصرة:</strong> ${fmt(q.shortcut)}</div>` : ''}
            </div>
            <p class="src-line">${sourceTxt(q)}</p>
          </article>`;
        }).join('')}
        <a class="btn btn-gold btn-block" href="#/plan">احصل على خطتك المجانية</a>`;
      app.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; draw(); }));
    }
    draw();
  }

  // 7) الخطة المجانية
  function renderPlanForm() {
    document.title = 'بيانات الخطة — كم باقي على هدفك؟';
    if (!needResult()) return;
    const today = E.todayISO();
    const p = Object.assign({ examDate: '', hoursPerDay: '', daysPerWeek: '', currentScore: '', targetScore: '', startPref: 'none' }, state.profile || {});
    const editing = !!state.profile;
    const hoursOpts = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6];
    const hLabel = h => durTxt(Math.round(h * 60));
    let errors = {};
    function draw() {
      app.innerHTML = `
        <h1>${editing ? 'تعديل بيانات الخطة' : 'لنجهّز خطتك المجانية'}</h1>
        ${subnav('plan')}
        <div class="note">لا نطلب اسمًا ولا رقم هاتف. تُحفظ هذه البيانات على جهازك فقط لتُستخدم في خطتك.</div>
        <form class="card enter" id="pf" novalidate>
          <div class="form-field">
            <label for="examDate">موعد اختبار القدرات</label>
            <input class="input" type="date" id="examDate" min="${today}" value="${esc(p.examDate)}" aria-invalid="${!!errors.examDate}" aria-describedby="e-examDate">
            ${errors.examDate ? `<p class="err" id="e-examDate">${errors.examDate}</p>` : ''}
          </div>
          <div class="form-field">
            <label for="hoursPerDay">وقت المذاكرة المتاح في اليوم</label>
            <select class="input" id="hoursPerDay" aria-invalid="${!!errors.hoursPerDay}">
              <option value="">اختر…</option>
              ${hoursOpts.map(h => `<option value="${h}" ${Number(p.hoursPerDay) === h ? 'selected' : ''}>${hLabel(h)}</option>`).join('')}
            </select>
            <p class="hint">اختر وقتًا تستطيع الالتزام به فعلًا، حتى لو كان قليلًا.</p>
            ${errors.hoursPerDay ? `<p class="err">${errors.hoursPerDay}</p>` : ''}
          </div>
          <div class="form-field">
            <span class="label" id="dpw-l">عدد أيام المذاكرة في الأسبوع</span>
            <div class="seg seg-7" role="group" aria-labelledby="dpw-l">
              ${[1, 2, 3, 4, 5, 6, 7].map(d => `<button type="button" data-dpw="${d}" aria-pressed="${Number(p.daysPerWeek) === d}">${d}</button>`).join('')}
            </div>
            ${errors.daysPerWeek ? `<p class="err">${errors.daysPerWeek}</p>` : ''}
          </div>
          <div class="form-field">
            <label for="currentScore">درجتك الحالية في القدرات <span class="muted small">(اختياري)</span></label>
            <input class="input" type="number" inputmode="numeric" id="currentScore" min="1" max="100" placeholder="اتركه فارغًا إذا لم تختبر من قبل" value="${esc(p.currentScore)}" aria-invalid="${!!errors.currentScore}">
            ${errors.currentScore ? `<p class="err">${errors.currentScore}</p>` : ''}
          </div>
          <div class="form-field">
            <label for="targetScore">درجتك المستهدفة</label>
            <input class="input" type="number" inputmode="numeric" id="targetScore" min="1" max="100" placeholder="مثلًا 85" value="${esc(p.targetScore)}" aria-invalid="${!!errors.targetScore}">
            ${errors.targetScore ? `<p class="err">${errors.targetScore}</p>` : ''}
          </div>
          <div class="form-field">
            <span class="label" id="sp-l">تفضّل البدء بـ <span class="muted small">(اختياري)</span></span>
            <div class="seg" role="group" aria-labelledby="sp-l">
              ${[['none', 'بلا تفضيل'], ['quant', 'الكمي'], ['verbal', 'اللفظي']].map(([k, l]) => `<button type="button" data-sp="${k}" aria-pressed="${(p.startPref || 'none') === k}">${l}</button>`).join('')}
            </div>
          </div>
          <button class="btn btn-gold btn-block" type="submit">${editing ? 'حدّث خطتي' : 'أنشئ خطتي المجانية'}</button>
          ${editing ? '<p class="center" style="margin:10px 0 0"><a href="#/plan">إلغاء التعديل</a></p>' : ''}
        </form>`;
      const f = app.querySelector('#pf');
      const read = () => {
        p.examDate = f.querySelector('#examDate').value;
        p.hoursPerDay = f.querySelector('#hoursPerDay').value;
        p.currentScore = f.querySelector('#currentScore').value.trim();
        p.targetScore = f.querySelector('#targetScore').value.trim();
      };
      f.querySelectorAll('[data-dpw]').forEach(b => b.addEventListener('click', () => { read(); p.daysPerWeek = +b.dataset.dpw; draw(); app.querySelector(`[data-dpw="${b.dataset.dpw}"]`).focus(); }));
      f.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => { read(); p.startPref = b.dataset.sp; draw(); app.querySelector(`[data-sp="${b.dataset.sp}"]`).focus(); }));
      f.addEventListener('submit', e => {
        e.preventDefault(); read();
        errors = E.validateProfile(p, E.todayISO());
        if (Object.keys(errors).length) {
          draw(); toast('راجع الحقول المظللة.', 'error');
          const bad = app.querySelector('[aria-invalid="true"]') || app.querySelector('.err');
          if (bad && bad.focus) bad.focus();
          return;
        }
        state.profile = { examDate: p.examDate, hoursPerDay: Number(p.hoursPerDay), daysPerWeek: Number(p.daysPerWeek),
          currentScore: p.currentScore === '' ? '' : Number(p.currentScore), targetScore: Number(p.targetScore), startPref: p.startPref || 'none' };
        save();
        withLoading('جارٍ إعداد خطتك…', () => { go('#/plan'); toast(editing ? 'تم تحديث خطتك.' : 'تم إنشاء خطتك المجانية.', 'success'); }, 500);
      });
    }
    draw();
  }

  function renderPlan() {
    document.title = 'خطتي المجانية — كم باقي على هدفك؟';
    if (!needResult()) return;
    if (!state.profile) { renderPlanForm(); return; }
    const today = E.todayISO();
    const perr = E.validateProfile(state.profile, today);
    if (perr.examDate) {
      app.innerHTML = `<h1>خطتي المجانية</h1>${subnav('plan')}<div class="card empty"><div class="icon">!</div><h2>موعد الاختبار المحفوظ مضى</h2><p class="muted">حدّث موعد اختبارك لنجهّز لك خطة جديدة.</p><a class="btn btn-primary" href="#/plan/edit">تعديل البيانات</a></div>`;
      return;
    }
    const r = result();
    const plan = E.generatePlan(r, state.profile, { today });
    const prof = state.profile;
    const qS = Math.round(plan.split.quant * 100), vS = 100 - qS;
    const fmtDate = iso => { const [y, m, d] = iso.split('-').map(Number); try { return new Date(y, m - 1, d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso; } };
    const levelSummary = `${r.level.label} في هذا الاختبار التدريبي، بنسبة صواب ${pct(r.pct)}` +
      (r.sections.quant && r.sections.verbal ? ` (الكمي ${pct(r.sections.quant.pct)}، اللفظي ${pct(r.sections.verbal.pct)}).` : '.');

    app.innerHTML = `
      <h1>خطتك المجانية المختصرة</h1>
      ${subnav('plan')}
      <div class="card enter">
        ${plan.mode === 'today'
          ? '<div class="countdown"><b>اليوم</b><span>موعد اختبارك</span></div>'
          : `<div class="countdown"><span>باقي</span><b>${plan.daysLeft}</b><span>${plan.daysLeft === 1 ? 'يوم واحد' : plan.daysLeft === 2 ? 'يومان' : plan.daysLeft <= 10 ? 'أيام' : 'يومًا'} على اختبارك</span></div>`}
        <p class="small muted" style="margin:6px 0 12px">${esc(fmtDate(prof.examDate))}</p>
        <h2 style="margin-bottom:4px">ملخص مستواك</h2>
        <p>${esc(levelSummary)}</p>
        <p class="small muted" style="margin:0">نوع الخطة: <strong>${esc(plan.modeLabel)}</strong> · درجتك المستهدفة: <strong class="num">${prof.targetScore}</strong>${plan.current != null ? ` · درجتك الحالية: <strong class="num">${plan.current}</strong>` : ''}</p>
      </div>

      ${plan.mode === 'today' ? '' : `
      <h2 class="section-title">مهارات الأولوية</h2>
      <div class="card">
        ${plan.priorities.length ? `<ol class="prio">${plan.priorities.map(s => `<li><div><strong>${esc(s.label)}</strong><div class="meta">${sectionName(s.section)} · صحيحة ${s.correct} من ${s.total}</div></div></li>`).join('')}</ol>`
          : '<p style="margin:0">لم تظهر مهارة تحتاج تدريبًا إضافيًا بين المهارات التي اختُبرت بأسئلة كافية. حافظ على مستواك بحل أسئلة متنوعة من القسمين.</p>'}
        ${plan.insufficient.length ? `<p class="small muted" style="margin:10px 0 0">مهارات تحتاج أسئلة إضافية لتقييمها: ${plan.insufficient.map(s => esc(s.label)).join('، ')}.</p>` : ''}
      </div>

      <h2 class="section-title">توزيع وقتك بين القسمين</h2>
      <div class="card">
        <div class="split" role="img" aria-label="الكمي ${qS}٪ واللفظي ${vS}٪"><div class="q" style="width:${qS}%">الكمي ${qS}%</div><div class="v" style="width:${vS}%">اللفظي ${vS}%</div></div>
        <p class="small muted" style="margin:10px 0 0">القسم الأضعف في نتيجتك يأخذ وقتًا أكبر، مع إبقاء القسم الآخر في التدريب. وقت المذاكرة: ${esc(durTxt(plan.dailyMin))} يوميًا، ${esc(daysTxt(plan.daysPerWeek))} في الأسبوع.</p>
      </div>

      <h2 class="section-title">${plan.mode === 'intense' ? 'جلسات الأيام المتبقية' : 'جدولك الأسبوعي'}</h2>
      <div class="sessions">
        ${plan.sessions.map(s => `<div class="session ${s.isPracticeTest ? 'test' : ''}">
          <div class="head"><span class="day">${esc(s.day)}</span><span class="sec">${esc(s.sectionLabel)} · ${esc(durTxt(s.minutes))}</span></div>
          <div class="focus">${esc(s.focus)}</div>
          <ul class="tasks">${s.tasks.map(t => `<li><span>${esc(t.text)}</span><span>${esc(durTxt(t.minutes))}</span></li>`).join('')}</ul>
        </div>`).join('')}
      </div>
      ${plan.mode !== 'intense' ? '<p class="small muted" style="margin-top:8px">كرّر هذا الجدول أسبوعيًا، وغيّر مهارة التركيز عندما يتحسن أداؤك فيها.</p>' : ''}`}

      <h2 class="section-title">توصيات حسب الوقت المتبقي</h2>
      <div class="card"><ul class="recs">${plan.recommendations.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${plan.notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}

      <div class="btn-row">
        <a class="btn btn-ghost" href="#/plan/edit">تعديل بياناتي</a>
        <a class="btn btn-ghost" href="#/result">العودة إلى النتيجة</a>
      </div>

      <section class="detailed" aria-labelledby="dp-title">
        <h2 id="dp-title">تبغى خطة تفصيلية تناسب مستواك؟</h2>
        <p>صار عندك تصور عن مستواك والمهارات اللي تحتاج تطورها. إذا تبغى خطة مذاكرة يومية مفصلة تناسب درجتك المستهدفة وموعد اختبارك ووقتك المتاح، تقدر تطلب إعداد خطة خاصة لك.</p>
        <button class="btn btn-gold" id="dp-btn">أرغب في خطة تفصيلية</button>
      </section>`;

    app.querySelector('#dp-btn').addEventListener('click', openDetailedPlan);
  }

  function openDetailedPlan() {
    const dp = C.detailedPlan || {};
    const live = dp.enabled && /^https:\/\//.test(dp.requestUrl || '');
    const body = `<p>يمكنك طلب خطة تفصيلية مخصصة بناءً على نتائج اختبارك. اتبع التعليمات المتاحة لطلب الخدمة.</p>` +
      (live
        ? (dp.instructions ? `<p>${esc(dp.instructions)}</p>` : '')
        : '<div class="note note-gold" style="margin:0">طلب الخطة التفصيلية يحتاج إلى تفعيل آلية الطلب من المطوّرة، وستتاح هذه الميزة بعد إعدادها.</div>') +
      '<p class="small muted" style="margin:12px 0 0">نتيجتك وخطتك المجانية محفوظتان ولن تتأثرا.</p>';
    const actions = live
      ? [{ label: dp.requestButtonLabel || 'انتقل إلى نموذج الطلب', cls: 'btn-gold', onClick: () => window.open(dp.requestUrl, '_blank', 'noopener') }, { label: 'إغلاق' }]
      : [{ label: 'حسنًا', cls: 'btn-primary' }];
    modal({ title: 'طلب خطة تفصيلية', body, actions });
  }

  // 9) إعادة الاختبار وحذف البيانات
  function renderRetake() {
    document.title = 'إعادة الاختبار — كم باقي على هدفك؟';
    const has = state.attempt || state.profile;
    app.innerHTML = `
      <h1>إعادة الاختبار</h1>
      <div class="card enter">
        <h2>محاولة جديدة من الصفر</h2>
        <p>عند بدء محاولة جديدة تُحذف إجاباتك ونتيجتك الحالية من هذا الجهاز، وتبدأ الأسئلة من جديد. بيانات خطتك (موعد الاختبار ووقت المذاكرة) تبقى محفوظة ما لم تحذفها.</p>
        <label class="check"><input type="checkbox" id="also-profile"> <span>احذف بيانات الخطة أيضًا</span></label>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" id="new">ابدأ محاولة جديدة</button>
          ${submitted() ? '<a class="btn btn-ghost" href="#/result">العودة إلى النتيجة</a>' : inProgress() ? '<a class="btn btn-ghost" href="#/quiz">العودة إلى الاختبار</a>' : ''}
        </div>
      </div>
      <div class="card">
        <h2>حذف بياناتي من هذا الجهاز</h2>
        <p class="muted">لا تُرسل بياناتك إلى أي خادم؛ كل شيء محفوظ في متصفحك فقط. يمكنك حذفه بالكامل في أي وقت.</p>
        <button class="btn btn-danger" id="wipe" ${has ? '' : 'disabled'}>احذف كل بياناتي</button>
      </div>`;
    app.querySelector('#new').addEventListener('click', () => {
      const alsoProfile = app.querySelector('#also-profile').checked;
      state.attempt = null; resultCache = null;
      if (alsoProfile) state.profile = null;
      save();
      toast('تم حذف المحاولة السابقة. ابدأ من جديد.', 'success');
      go('#/start');
    });
    app.querySelector('#wipe').addEventListener('click', () => modal({
      title: 'حذف كل البيانات؟',
      body: '<p>ستُحذف إجاباتك ونتيجتك وبيانات خطتك من هذا الجهاز نهائيًا.</p>',
      actions: [{ label: 'احذف', cls: 'btn-danger', onClick: () => { clearAll(); resultCache = null; toast('تم حذف بياناتك من هذا الجهاز.', 'success'); go('#/'); } }, { label: 'إلغاء' }]
    }));
  }

  function renderNotFound() {
    app.innerHTML = `<div class="card empty"><div class="icon">?</div><h1>الصفحة غير موجودة</h1><p class="muted">ربما الرابط غير صحيح.</p><a class="btn btn-primary" href="#/">الصفحة الرئيسية</a></div>`;
  }

  route();
})();
