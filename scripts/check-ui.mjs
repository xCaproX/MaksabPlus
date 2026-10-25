// Fails the build when a migrated screen bypasses the design system.
// Scope: every file in scripts/ui-migrated.txt + everything under src/components/app/
// Files under src/components/ui/ are the primitives and are allowed raw elements.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const listFile = join(root, 'scripts', 'ui-migrated.txt');
const migrated = existsSync(listFile)
  ? readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const appFiles = walk(join(root, 'src', 'components', 'app')).filter((f) => f.endsWith('.tsx'));
const uiFiles = walk(join(root, 'src', 'components', 'ui')).filter((f) => f.endsWith('.tsx'));
const migratedFiles = migrated.map((f) => join(root, f));
const strictFiles = [...new Set([...appFiles, ...migratedFiles])];

// Rules for screens and app-level components (NOT for src/components/ui).
const strictRules = [
  [/<(table|select|textarea|button|dialog)\b/, 'raw <%1> is banned here: use the component from src/components/ui or app'],
  [/<input\b/, 'raw <input> is banned here: use Input, NumberInput, DateInput, Checkbox, etc.'],
  [/type=["']?(number|date)["']?/, 'type=number/date is banned here: use NumberInput / DateInput'],
  [/style=\{\{/, 'inline style is banned: use Tailwind classes and design tokens'],
  [/#[0-9a-fA-F]{3,8}\b/, 'hard-coded hex color is banned: use design tokens'],
  [/ج\.م/, 'hard-coded currency text is banned: use <MoneyDisplay>'],
  [/from ['"][./]*lib\/format['"][^;]*\bmoney\b/, 'importing money() is banned here: use <MoneyDisplay>'],
  [/mm\/dd\/yyyy/i, 'mm/dd/yyyy is banned: dates are dd/mm/yyyy'],
];

// Physical direction classes break RTL. Banned everywhere, including ui/.
const physical =
  /(?<![\w-])(?:-?(?:ml|mr|pl|pr)-|left-|right-|text-left|text-right|float-left|float-right|rounded-(?:l|r|tl|tr|bl|br)(?:-|\b)|border-(?:l|r)(?:-|\b)|space-x-reverse)/;
const physicalAllowed = /(?:left|right)-(?:1\/2|\[50%\])/; // centering with translate is RTL-safe

let failures = 0;
function report(file, i, msg, line) {
  failures++;
  console.error(`${file.replace(root + '/', '')}:${i + 1}  ${msg}\n    ${line.trim().slice(0, 140)}`);
}

for (const file of [...strictFiles, ...uiFiles]) {
  if (!existsSync(file)) {
    console.error(`MISSING FILE listed in ui-migrated.txt: ${file.replace(root + '/', '')}`);
    failures++;
    continue;
  }
  const isUi = file.includes(`${join('src', 'components', 'ui')}`);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('ui-check-ignore:')) return; // must carry a reason after the colon
    if (!isUi) {
      for (const [re, msg] of strictRules) {
        const m = line.match(re);
        if (m) report(file, i, msg.replace('%1', m[1] ?? ''), line);
      }
    }
    if (physical.test(line) && !physicalAllowed.test(line)) {
      report(file, i, 'physical direction class breaks RTL: use ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e', line);
    }
  });
}

if (failures) {
  console.error(`\ncheck-ui: ${failures} violation(s)`);
  process.exit(1);
}
console.log(`check-ui: OK (${strictFiles.length} strict files, ${uiFiles.length} primitives)`);
