"""مرور كامل في متصفح فعلي على مقاسي الجوال والآيباد، مع لقطات شاشة.
التشغيل: python3 tests/e2e.py <مجلد اللقطات>
"""
import sys, os, json, threading, http.server, socketserver, functools, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'shots')
os.makedirs(SHOTS, exist_ok=True)
CREDIT = 'من تطوير : أ. افراح الحربي'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=ROOT)
srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/index.html'

fails, checks = [], 0
def check(cond, msg):
    global checks
    checks += 1
    if not cond: fails.append(msg); print('✗', msg)

def no_overflow(page, where):
    w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    check(w[0] <= w[1] + 1, f'تمرير أفقي في {where}: {w}')

def offscreen(page):
    return page.evaluate('''[...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect();
        return r.width && (r.right < 0 || r.left > innerWidth) && !e.closest('.sr-only'); }).map(e => e.className || e.tagName).slice(0, 5)''')

def common(page, where):
    off = offscreen(page)
    check(not off, f'عناصر خارج الشاشة في {where}: {off}')
    check(page.evaluate('document.documentElement.dir') == 'rtl', f'الاتجاه ليس RTL في {where}')
    check(page.locator('.credit').inner_text().strip() == CREDIT, f'عبارة الحقوق غير مطابقة في {where}')
    no_overflow(page, where)
    body = page.locator('body').inner_text()
    for bad in ['واتساب', 'whatsapp', '@', 'هاتف:', 'تويتر', 'تيك توك', 'سناب']:
        check(bad.lower() not in body.lower(), f'وسيلة تواصل ({bad}) ظاهرة في {where}')

def run(device, prefix):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(**device)
        page = ctx.new_page()
        errors, external = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('request', lambda r: (not r.url.startswith(f'http://127.0.0.1:{PORT}')) and external.append(r.url))

        # 1) الرئيسية
        page.goto(BASE)
        page.wait_for_selector('.hero')
        check(page.locator('h1').inner_text().replace('\n', ' ').strip() == 'كم باقي على هدفك؟', 'العنوان الرئيسي')
        check('ابدأ اختبار تحديد المستوى' in page.locator('.hero .btn').inner_text(), 'زر البدء')
        check(page.locator('.feature').count() == 3, 'ثلاث بطاقات تعريفية')
        check('ليس اختبارًا رسميًا' in page.locator('.note').inner_text(), 'التنويه')
        common(page, 'الرئيسية')
        page.screenshot(path=f'{SHOTS}/{prefix}-01-home.png', full_page=True)

        # 2) بيانات الاختبار
        page.click('.hero .btn')
        page.wait_for_selector('#go')
        tj = page.locator('[data-pool="tajmeeat"]')
        check(tj.get_attribute('aria-disabled') == 'false', 'التجميعات متاحة')
        check(tj.get_attribute('aria-checked') == 'true', 'التجميعات مختارة افتراضيًا')
        check('القسم اللفظي من الأسئلة التدريبية الأصلية' in tj.inner_text(), 'توضيح مصدر القسم اللفظي')
        common(page, 'بيانات الاختبار')
        page.screenshot(path=f'{SHOTS}/{prefix}-02-start.png', full_page=True)
        page.click('#go')
        page.wait_for_selector('.q-card')

        # 3) الأسئلة: لا تظهر الإجابة الصحيحة أثناء الاختبار
        bank = page.evaluate('Object.fromEntries(window.QB.questions.map(q=>[q.id,q.answer]))')
        att = page.evaluate("JSON.parse(localStorage.getItem('kbh-v1')).attempt")
        ids = att['questionIds']
        check(len(ids) == 24 and len(set(ids)) == 24, 'عدد الأسئلة 24 بلا تكرار')
        txt = page.locator('main').inner_text()
        check('الإجابة الصحيحة' not in txt and 'شرح الحل' not in txt, 'كشف الإجابة أثناء الاختبار')
        check('السؤال 1 من 24' in txt, 'رقم السؤال والعدد الكلي')
        check('من التجميعات' in txt, 'شارة مصدر السؤال')
        pools = page.evaluate("(()=>{const m=Object.fromEntries(window.QB.questions.map(q=>[q.id,q.pool+'/'+q.section]));return JSON.parse(localStorage.getItem('kbh-v1')).attempt.questionIds.map(i=>m[i]);})()")
        check(all(x in ('tajmeeat/quant','original/verbal') for x in pools), 'الكمي من التجميعات واللفظي من الأصلية')
        common(page, 'شاشة الأسئلة')
        page.screenshot(path=f'{SHOTS}/{prefix}-03-question.png', full_page=True)

        plan_correct = 0
        for i, qid in enumerate(ids):
            if i >= 20: break  # نترك 4 بلا إجابة
            order = att['optionOrder'][qid]
            want = bank[qid] if i % 3 != 2 else [o for o in order if o != bank[qid]][0]
            if want == bank[qid]: plan_correct += 1
            # إجابة أولى خاطئة ثم تصحيحها للتأكد من الاستبدال
            if i == 0:
                page.click(f'[data-opt="{[o for o in order if o != bank[qid]][0]}"]')
            page.click(f'[data-opt="{want}"]')
            if i == 5:
                page.click('#flag')
                page.wait_for_selector('.flag-btn[aria-pressed="true"]')
            if i == 7:  # التنقل للخلف ثم الأمام يحفظ الإجابة
                page.click('#prev'); page.wait_for_selector('.q-card')
                check(page.locator('.opt[aria-checked="true"]').count() == 1, 'الإجابة محفوظة بعد الرجوع')
                page.click('#next'); page.wait_for_selector('.q-card')
            if i == 10:  # إعادة تحميل الصفحة في منتصف الاختبار
                page.reload(); page.wait_for_selector('.q-card')
                check('السؤال 11 من 24' in page.locator('main').inner_text(), 'استمرار التقدم بعد إعادة التحميل')
            if i < len(ids) - 1:
                page.click('#next'); page.wait_for_selector('.q-card')
        saved = page.evaluate("JSON.parse(localStorage.getItem('kbh-v1')).attempt.answers")
        check(len(saved) == 20, f'عدد الإجابات المحفوظة 20 (الموجود {len(saved)})')

        # مراجعة قبل التسليم
        page.goto(BASE + '#/review'); page.wait_for_selector('#submit')
        check(page.locator('.grid-q.answered').count() == 20, 'شبكة المراجعة: 20 مجابًا')
        check(page.locator('.grid-q.flagged').count() == 1, 'سؤال معلَّم واحد')
        common(page, 'المراجعة')
        page.screenshot(path=f'{SHOTS}/{prefix}-04-review.png', full_page=True)
        page.click('#submit'); page.wait_for_selector('.modal')
        mt = page.locator('.modal').inner_text()
        check('4 أسئلة غير مجابة' in mt and '21، 22، 23، 24' in mt, 'تنبيه الأسئلة غير المجابة بأرقامها')
        page.screenshot(path=f'{SHOTS}/{prefix}-05-unanswered-modal.png')
        page.click('.modal [data-act="1"]')
        page.wait_for_selector('.score-hero', timeout=5000)

        # 4) النتيجة
        stats = page.locator('.stat b').all_inner_texts()
        check(stats == ['24', str(plan_correct), str(20 - plan_correct), '4'], f'أرقام النتيجة {stats} المتوقع 24/{plan_correct}/{20-plan_correct}/4')
        check('تصنيف داخلي' in page.locator('main').inner_text(), 'توضيح التصنيف الداخلي')
        check('/100' not in page.locator('main').inner_text(), 'لا درجة رسمية من 100')
        common(page, 'النتيجة')
        page.wait_for_timeout(1100)
        page.screenshot(path=f'{SHOTS}/{prefix}-06-result.png', full_page=True)

        # 5) التحليل: لا تظهر مهارات لم تُختبر
        page.click('.subnav a[href="#/analysis"]'); page.wait_for_selector('.skill-card')
        tested = set(page.evaluate("""(() => { const s = JSON.parse(localStorage.getItem('kbh-v1')).attempt;
            const m = Object.fromEntries(window.QB.questions.map(q=>[q.id, window.QB.skills[q.skill].label]));
            return s.questionIds.map(i=>m[i]); })()"""))
        shown = set(t.split('\n')[0].strip() for t in page.locator('.skill-card .top span:first-child').all_inner_texts())
        check(shown == tested, f'المهارات المعروضة = المختبرة {shown ^ tested}')
        common(page, 'التحليل')
        page.wait_for_timeout(900)
        page.screenshot(path=f'{SHOTS}/{prefix}-07-analysis.png', full_page=True)

        # 6) مراجعة الإجابات
        page.click('.subnav a[href="#/answers"]'); page.wait_for_selector('.ans-card')
        check(page.locator('.ans-card').count() == 24, 'كل الأسئلة في المراجعة')
        check(page.locator('.ans-opts li.correct').count() == 24, 'إجابة صحيحة لكل سؤال')
        check(page.locator('.src-line').count() == 24, 'مصدر لكل سؤال')
        check(page.locator('.src-line', has_text='بنوك المفكر').count() == 12, 'مرجع المفكر في الأسئلة الكمية')
        imgs = page.evaluate("Promise.all([...document.querySelectorAll('.q-fig img')].map(i=>new Promise(r=>{const x=new Image();x.onload=()=>r([x.naturalWidth>0,i.getAttribute('src')]);x.onerror=()=>r([false,i.getAttribute('src')]);x.src=i.src;})))")
        check(all(ok for ok, _ in imgs), f'صور لم تُحمّل: {[s for ok, s in imgs if not ok]}')
        page.click('[data-f="skip"]')
        check(page.locator('.ans-card').count() == 4, 'تصفية غير المجابة')
        page.click('[data-f="wrong"]')
        check(page.locator('.ans-card').count() == 20 - plan_correct, 'تصفية الخاطئة')
        common(page, 'مراجعة الإجابات')
        page.screenshot(path=f'{SHOTS}/{prefix}-08-answers.png', full_page=True)

        # 7) الخطة: التحقق من الحقول ثم الإنشاء
        page.click('.subnav a[href="#/plan"]'); page.wait_for_selector('#pf')
        page.click('#pf button[type="submit"]')
        check(page.locator('.err').count() >= 3, 'رسائل خطأ للحقول المطلوبة')
        page.screenshot(path=f'{SHOTS}/{prefix}-09-plan-form-errors.png', full_page=True)
        page.fill('#examDate', '2026-12-20')
        page.select_option('#hoursPerDay', '2')
        page.click('[data-dpw="5"]')
        page.fill('#targetScore', '85')
        page.click('[data-sp="verbal"]')
        page.click('#pf button[type="submit"]')
        page.wait_for_selector('.sessions', timeout=5000)
        ptxt = page.locator('main').inner_text()
        check('باقي' in ptxt and 'دقتها محدودة' in ptxt and 'لا تضمن' in ptxt, 'محتوى الخطة والتنبيهات')
        check(page.locator('.session').count() == 5, 'خمس جلسات أسبوعية')
        check('اللفظي' in page.locator('.session').first.inner_text(), 'البدء بالقسم المفضل')
        common(page, 'الخطة')
        page.screenshot(path=f'{SHOTS}/{prefix}-10-plan.png', full_page=True)

        # 8) الخطة التفصيلية
        page.click('#dp-btn'); page.wait_for_selector('.modal')
        mt = page.locator('.modal').inner_text()
        check('تفعيل آلية الطلب من المطوّرة' in mt, 'نافذة الخطة التفصيلية')
        check(page.locator('.modal a, .modal [href]').count() == 0, 'لا روابط في النافذة')
        page.screenshot(path=f'{SHOTS}/{prefix}-11-detailed-modal.png')
        page.click('.modal [data-act="0"]')
        check(page.locator('.sessions').count() == 1, 'الخطة باقية بعد إغلاق النافذة')

        # التنقل وإعادة التحميل لا يفقد النتيجة
        page.goto(BASE + '#/result'); page.reload(); page.wait_for_selector('.score-hero')
        check(page.locator('.stat b').all_inner_texts()[1] == str(plan_correct), 'النتيجة محفوظة بعد إعادة التحميل')
        page.goto(BASE + '#/plan'); page.wait_for_selector('.sessions')
        check(page.locator('#pf').count() == 0, 'لا يُطلب إدخال البيانات مرة أخرى')

        # 9) إعادة الاختبار
        page.goto(BASE + '#/retake'); page.wait_for_selector('#new')
        common(page, 'إعادة الاختبار')
        page.screenshot(path=f'{SHOTS}/{prefix}-12-retake.png', full_page=True)
        page.click('#new'); page.wait_for_selector('#go')
        st = page.evaluate("JSON.parse(localStorage.getItem('kbh-v1'))")
        check(st['attempt'] is None and st['profile'] is not None, 'حذف المحاولة مع إبقاء بيانات الخطة')
        page.goto(BASE + '#/result'); page.wait_for_selector('.empty')
        check('لا توجد نتيجة بعد' in page.locator('main').inner_text(), 'حالة عدم وجود نتيجة')

        # حذف كل البيانات
        page.goto(BASE + '#/retake'); page.wait_for_selector('#wipe')
        page.click('#wipe'); page.wait_for_selector('.modal'); page.click('.modal [data-act="0"]')
        page.wait_for_selector('.hero')
        check(page.evaluate("localStorage.getItem('kbh-v1')") is None, 'حذف كل البيانات')

        page.goto(BASE + '#/nope'); page.wait_for_selector('.empty')
        check('غير موجودة' in page.locator('main').inner_text(), 'صفحة غير موجودة')

        check(not errors, f'أخطاء في الكونسول: {errors}')
        check(not external, f'طلبات خارجية: {external}')
        b.close()

def run_timer():
    """المؤقت: التسليم التلقائي عند انتهاء الوقت."""
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page()
        page.route('**/config.js', lambda r: r.fulfill(body=open(os.path.join(ROOT, 'config.js')).read().replace('secondsPerQuestion: 60', 'secondsPerQuestion: 0.15'), content_type='application/javascript'))
        page.goto(BASE + '#/start'); page.wait_for_selector('#go')
        page.click('#timer-switch'); page.click('#go'); page.wait_for_selector('#timer')
        page.click('.opt >> nth=0')
        page.wait_for_selector('.score-hero', timeout=12000)
        st = page.locator('.stat b').all_inner_texts()
        check(st[0] == '24' and st[3] == '23', f'تسليم تلقائي بانتهاء الوقت {st}')
        b.close()

def run_no_bank():
    """رسالة الخطأ عند فشل تحميل بنك الأسئلة."""
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page()
        page.route('**/data/bank-original.js', lambda r: r.abort())
        page.route('**/data/skills.js', lambda r: r.abort())
        page.goto(BASE); page.wait_for_timeout(500)
        check('تعذّر تحميل' in page.locator('main').inner_text(), 'رسالة فشل التحميل')
        b.close()
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page()
        page.route('**/data/bank-original.js', lambda r: r.fulfill(body='', content_type='application/javascript'))
        page.goto(BASE + '#/start'); page.wait_for_timeout(500)
        check('غير متاح حاليًا' in page.locator('main').inner_text(), 'رسالة عدم توفر أسئلة كافية')
        b.close()

phone = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ar-SA')
ipad = dict(viewport={'width': 820, 'height': 1180}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ar-SA')
small = dict(viewport={'width': 320, 'height': 640}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ar-SA')
desktop = dict(viewport={'width': 1366, 'height': 900}, locale='ar-SA')

run(phone, 'phone')
run(ipad, 'ipad')
run(small, 'small')
run(desktop, 'desktop')
run_timer()
run_no_bank()
srv.shutdown()
print(f'\n{checks - len(fails)}/{checks} فحصًا ناجحًا')
sys.exit(1 if fails else 0)
