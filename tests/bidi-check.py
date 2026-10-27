"""يتحقق أن كل معادلة معروضة (span.math) في جميع أسئلة البنك تظهر من اليسار إلى اليمين بترتيبها الصحيح."""
import sys, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
shots = sys.argv[1] if len(sys.argv) > 1 else None
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.goto(f'http://127.0.0.1:{port}/index.html')
    pg.evaluate("""()=>{const ids=window.QB.questions.map(q=>q.id);const oo={};
      window.QB.questions.forEach(q=>oo[q.id]=window.Engine.optionsOf(q,window.QB).map(o=>o.id));
      localStorage.setItem('kbh-v1',JSON.stringify({v:1,attempt:{id:'t',pool:'original',questionIds:ids,optionOrder:oo,answers:{},flags:{},current:0,timer:{enabled:false},createdAt:1,submittedAt:2},profile:null,prefs:{}}));}""")
    pg.goto(f'http://127.0.0.1:{port}/index.html#/answers'); pg.reload(); pg.wait_for_selector('.ans-card')
    bad = pg.evaluate(r"""() => {
      const out = [];
      document.querySelectorAll('.math').forEach(sp => {
        const text = sp.textContent;
        const node = sp.firstChild;
        // مواضع الرموز غير العربية بالترتيب المنطقي يجب أن تتزايد من اليسار لليمين
        const xs = [];
        const tn = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT);
        let n; while ((n = tn.nextNode())) {
          for (let i = 0; i < n.length; i++) {
            const ch = n.data[i];
            if (/[\d=×÷+−()\/°²%]/.test(ch)) {
              const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
              const rc = r.getBoundingClientRect(); if (rc.width) xs.push([ch, rc.left, Math.round(rc.top)]);
            }
          }
        }
        for (let i = 1; i < xs.length; i++) if (xs[i][2] === xs[i-1][2] && xs[i][1] < xs[i-1][1] - 0.5) { out.push(text.replace(/‎/g,'')); break; }
      });
      return out;
    }""")
    total = pg.locator('.math').count()
    if shots:
        cards = pg.locator('.ans-card')
        for i in [1, 12, 13, 15, 17, 18, 27]:
            cards.nth(i).screenshot(path=f'{shots}/bidi-{i}.png')
    b.close()
srv.shutdown()
print(f'معادلات معروضة: {total}، مقلوبة: {len(bad)}')
for x in bad: print('  ✗', x)
sys.exit(1 if bad else 0)
