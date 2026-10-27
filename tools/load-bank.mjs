// يحمّل ملفات البيانات والإعدادات كما يحمّلها المتصفح، لاستخدامها في أدوات الفحص والاختبارات.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILES = ['config.js', 'data/skills.js', 'data/sources.js', 'data/bank-tajmeeat.js', 'data/bank-tajmeeat-mufakker.js', 'data/bank-original.js'];

export function loadAll(extraFiles = []) {
  const window = {};
  const ctx = vm.createContext({ window, console });
  for (const f of [...DATA_FILES, ...extraFiles]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { bank: window.QB, config: window.APP_CONFIG };
}
