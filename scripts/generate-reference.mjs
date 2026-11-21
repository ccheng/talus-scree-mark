import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../app/reference/', import.meta.url);
await mkdir(output, { recursive: true });

const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
const marker = (id, x, y, code) => ({ id, x, y, size: 36, code });
const anchors = [
  marker('top-left', 37, 37, ['0111', '1011', '0001', '1101']),
  marker('top-right', 575, 37, ['1110', '0100', '0101', '0010']),
  marker('bottom-right', 575, 755, ['1011', '0110', '1011', '1100']),
  marker('bottom-left', 37, 755, ['0111', '1110', '0010', '0001']),
];
const discriminator = marker('reference-revision-1', 517, 91, ['1101', '0010', '1100', '1110']);
const checks = [
  [84, 115], [276, 145], [86, 368], [526, 366],
  [69, 529], [550, 500], [310, 564], [533, 715],
].map(([x, y], index) => ({ id: `check-${index + 1}`, x, y, radius: 3.8 }));
const choice = (symbol, x, y, radius) => ({ symbol, x, y, radius });
const mc = Array.from({ length: 12 }, (_, index) => {
  const y = 155 + index * 17;
  return {
    id: `MC${index + 1}`, kind: 'mc', bounds: { x: 90, y: y - 7, width: 145, height: 14 },
    choices: ['A', 'B', 'C', 'D'].map((symbol, column) => choice(symbol, 123 + column * 33, y, 3.3)),
  };
});
const nr = [[96, 455], [344, 455], [96, 610], [344, 610]].map(([x, y], index) => {
  const id = `NR${index + 1}`;
  return {
    id, kind: 'nr', bounds: { x, y: y - 20, width: 148, height: 119 },
    slots: Array.from({ length: 4 }, (_, column) => {
      const centerX = x + 34 + 32 * column;
      const digits = Array.from({ length: 10 }, (_, digit) => choice(String(digit), centerX, y + 10 + digit * 9, 3.05));
      return {
        id: `${id}.${column + 1}`,
        choices: column === 1 || column === 2 ? [choice('.', centerX, y, 3.05), ...digits] : digits,
      };
    }),
  };
});
const profile = { id: 'scree-reference-letter', revision: 1, page, anchors, discriminator, checks, items: [...mc, ...nr] };
const profileText = JSON.stringify(profile, null, 2) + '\n';
const profileDigest = createHash('sha256').update(profileText).digest('hex');

const mcAnswers = ['B', 'D', 'A', 'C', 'A', 'D', 'B', 'C', null, 'D', 'C', 'A'];
const nrAnswers = ['5.3 ', '12.3', '0.25', '3008'];
const example = {
  id: 'filled-example-1',
  profile: { id: profile.id, revision: profile.revision, sha256: profileDigest },
  items: Object.fromEntries([...mc, ...nr].map((item, index) => {
    const rawText = item.kind === 'mc' ? mcAnswers[index] : nrAnswers[index - mc.length];
    return [item.id, { status: rawText === null ? 'blank' : 'single', rawText }];
  })),
};

function createDrawing() {
  const operations = ['0 G', '0 g'];
  const decimal = (value) => Number(value.toFixed(4));
  const point = (x, y) => `${decimal(x)} ${decimal(page.height - y)}`;

  return {
    text(x, y, value, size = 10) {
      const escaped = value.replace(/[\\()]/g, (character) => '\\' + character);
      operations.push(`BT /F1 ${size} Tf ${point(x, y)} Td (${escaped}) Tj ET`);
    },
    rect(x, y, width, height) {
      operations.push(`${point(x, y + height)} ${decimal(width)} ${decimal(height)} re f`);
    },
    circle(x, y, radius, fill) {
      const control = radius * .5522847498;
      operations.push(
        '0.65 w',
        `${point(x + radius, y)} m`,
        `${point(x + radius, y + control)} ${point(x + control, y + radius)} ${point(x, y + radius)} c`,
        `${point(x - control, y + radius)} ${point(x - radius, y + control)} ${point(x - radius, y)} c`,
        `${point(x - radius, y - control)} ${point(x - control, y - radius)} ${point(x, y - radius)} c`,
        `${point(x + control, y - radius)} ${point(x + radius, y - control)} ${point(x + radius, y)} c`,
        fill ? 'f' : 'S',
      );
    },
    finish() { return operations.join('\n') + '\n'; },
  };
}

function drawReference(filled) {
  const drawing = createDrawing();
  for (const { x, y, size, code } of [...anchors, discriminator]) {
    const cell = size / 6;
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 6; column++) {
        const border = row === 0 || row === 5 || column === 0 || column === 5;
        if (border || code[row - 1][column - 1] === '1') {
          drawing.rect(x - size / 2 + column * cell, y - size / 2 + row * cell, cell, cell);
        }
      }
    }
  }
  for (const check of checks) drawing.circle(check.x, check.y, check.radius, true);

  drawing.text(82, 42, 'Talus Scree Mark', 23);
  drawing.text(83, 62, 'Synthetic reference sheet  |  Letter  |  Revision 1', 11);
  drawing.text(83, 82, filled ? 'FILLED MOCK EXAMPLE' : 'BLANK MOCK TEMPLATE', 11);
  drawing.text(83, 99, 'Print actual size (100%). Keep all four corner marks in the photograph.', 9);
  drawing.text(92, 134, 'Multiple choice', 12);
  for (const option of mc[0].choices) drawing.text(option.x - 3, 145, option.symbol, 8);

  for (const [index, item] of mc.entries()) {
    const { y } = item.choices[0];
    drawing.text(91, y + 3, String(index + 1), 9);
    for (const option of item.choices) {
      drawing.circle(option.x, option.y, option.radius, false);
      if (filled && option.symbol === mcAnswers[index]) drawing.circle(option.x, option.y, option.radius * .92, true);
    }
  }
  drawing.text(309, 151, 'Mark one answer per MC row.', 10);
  drawing.text(309, 168, 'Mark one symbol in each occupied NR slot.', 10);
  drawing.text(309, 185, 'Start at slot 1. Leave unused slots on the right blank.', 10);
  drawing.text(309, 202, 'Use the decimal bubble only where printed.', 10);
  drawing.text(91, 402, 'Numerical response', 12);
  for (const [index, item] of nr.entries()) {
    drawing.text(item.bounds.x, item.bounds.y + 3, item.id, 10);
    for (const [column, slot] of item.slots.entries()) {
      drawing.text(slot.choices[0].x - 2, item.bounds.y + 3, String(column + 1), 7);
      for (const option of slot.choices) {
        drawing.circle(option.x, option.y, option.radius, false);
        drawing.text(option.x - 10, option.y + 2.4, option.symbol, 6);
        if (filled && option.symbol === nrAnswers[index][column]) drawing.circle(option.x, option.y, option.radius * .92, true);
      }
    }
  }
  drawing.text(130, 749, 'Development use only. Do not use this template for student data.', 9);
  return drawing.finish();
}

function printPdf(filled) {
  const drawing = drawReference(filled);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startXref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return pdf + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
}

await Promise.all([
  writeFile(new URL('profile.json', output), profileText),
  writeFile(new URL('profile.sha256', output), `${profileDigest}  profile.json\n`),
  writeFile(new URL('profile.js', output), `// Generated by npm run build:reference.\nexport const referenceDigest = ${JSON.stringify(profileDigest)};\nexport const referenceProfile = ${profileText.trimEnd()};\n`),
  writeFile(new URL('reference-blank.pdf', output), printPdf(false)),
  writeFile(new URL('reference-filled.pdf', output), printPdf(true)),
  writeFile(new URL('reference-key.json', output), JSON.stringify(example, null, 2) + '\n'),
]);
execFileSync('pdftoppm', [
  '-r', '200', '-png', '-singlefile',
  fileURLToPath(new URL('reference-filled.pdf', output)),
  fileURLToPath(new URL('reference-filled', output)),
]);
console.log(`Reference ${profile.id} rev ${profile.revision}: ${profileDigest}`);
