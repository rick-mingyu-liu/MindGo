/**
 * Draws the synthetic benchmark: bank-app transaction lists and paper
 * receipts with known contents, each saved as a PNG next to its truth.
 *
 *   node generate.mjs            -> synthetic/*.png + synthetic/*.truth.json
 *
 * Seeded, so re-running produces identical files. Synthetic images are clean;
 * they measure the parser and the OCR on known layouts, not robustness to
 * photos. The private set of real screenshots is what measures that.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'synthetic');
export const TODAY = '2026-09-16';
const PER_STYLE = 8;

// mulberry32: small, seeded, good enough for test data.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXPENSES = [
  ['SOBEYS #1234', 'Groceries'], ['TIM HORTONS #2291', 'Dining Out'], ['PRESTO FARE', 'Transportation'],
  ['NETFLIX.COM', 'Entertainment'], ['AMAZON.CA', 'Shopping'], ['SHOPPERS DRUG MART', 'Healthcare'],
  ['UBER EATS', 'Dining Out'], ['ROGERS WIRELESS', 'Utilities'], ['W STORE UWATERLOO', 'Education'],
  ['LOCAL BAKERY', null], ['FARM BOY', 'Groceries'], ['CINEPLEX', 'Entertainment'],
];
const INCOME = [['PAYROLL DEPOSIT', 'Salary'], ['INTEREST PAID', 'Investment Returns'], ['E-TRANSFER RECEIVED', null]];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pick = (r, list) => list[Math.floor(r() * list.length)];
const cents = (r, min, max) => Math.round((min + r() * (max - min)) * 100);
const money = (c) => {
  const whole = Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${c < 0 ? '-' : ''}$${whole}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
};
const plain = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

// Days before TODAY, by integer arithmetic on September 2026 (all within it).
const dayOf = (back) => `2026-09-${String(16 - back).padStart(2, '0')}`;
const label = (day) => {
  if (day === TODAY) return 'Today';
  if (day === '2026-09-15') return 'Yesterday';
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8))}`;
};

function transactions(r, n) {
  const list = [];
  let back = 0;
  for (let i = 0; i < n; i++) {
    back += r() < 0.5 ? 0 : 1 + Math.floor(r() * 2);
    const income = r() < 0.2;
    const [description, category] = pick(r, income ? INCOME : EXPENSES);
    list.push({
      date: dayOf(Math.min(back, 15)),
      amount: cents(r, income ? 50 : 1, income ? 2500 : 150),
      type: income ? 'income' : 'expense',
      description,
      category,
    });
  }
  return list;
}

const truthRow = (t) => ({
  date: t.date, amount: plain(t.amount), type: t.type, description: t.description,
  ...(t.category === null ? {} : { category: t.category }),
});

function phone(rows) {
  const canvas = createCanvas(1170, 200 + rows * 110);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('Transactions', 40, 90);
  return { canvas, ctx };
}

function rightAligned(ctx, text, x, y) {
  ctx.fillText(text, x - ctx.measureText(text).width, y);
}

// Signed amounts under date headers.
function signedWithHeaders(r) {
  const list = transactions(r, 5 + Math.floor(r() * 5));
  const headers = new Set(list.map((t) => t.date)).size;
  const { canvas, ctx } = phone(list.length + headers);
  let y = 220;
  let current = null;
  for (const t of list) {
    if (t.date !== current) {
      current = t.date;
      ctx.font = 'bold 38px sans-serif';
      ctx.fillStyle = '#555555';
      ctx.fillText(label(t.date), 40, y);
      y += 110;
    }
    ctx.font = '42px sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(t.description, 40, y);
    ctx.fillStyle = t.type === 'income' ? '#1a7f37' : '#111111';
    rightAligned(ctx, `${t.type === 'income' ? '+' : '-'}${money(t.amount)}`, 1130, y);
    y += 110;
  }
  return { canvas, truth: list.map(truthRow) };
}

// Unsigned amounts with a running balance column, newest first.
function balanceColumn(r) {
  const list = transactions(r, 5 + Math.floor(r() * 5));
  let balance = cents(r, 500, 5000);
  const balances = [];
  for (const t of list) {
    balances.push(balance);
    balance -= t.type === 'income' ? t.amount : -t.amount;
  }
  const { canvas, ctx } = phone(list.length);
  let y = 220;
  list.forEach((t, i) => {
    ctx.font = '40px sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(`${label(t.date)}  ${t.description}`, 40, y);
    rightAligned(ctx, money(t.amount), 860, y);
    ctx.fillStyle = '#666666';
    rightAligned(ctx, money(balances[i]), 1130, y);
    y += 110;
  });
  return { canvas, truth: list.map(truthRow) };
}

// Unsigned amounts under date headers, some pending. The parser can only
// guess these rows' direction, so they exercise type_guessed.
function unsignedPending(r) {
  const list = transactions(r, 5 + Math.floor(r() * 5));
  const headers = new Set(list.map((t) => t.date)).size;
  const { canvas, ctx } = phone(list.length + headers);
  let y = 220;
  let current = null;
  for (const t of list) {
    if (t.date !== current) {
      current = t.date;
      ctx.font = 'bold 38px sans-serif';
      ctx.fillStyle = '#555555';
      ctx.fillText(label(t.date), 40, y);
      y += 110;
    }
    ctx.font = '42px sans-serif';
    ctx.fillStyle = '#111111';
    const pending = t.date === TODAY && r() < 0.7;
    ctx.fillText(`${pending ? 'Pending ' : ''}${t.description}`, 40, y);
    rightAligned(ctx, money(t.amount), 1130, y);
    y += 110;
  }
  return { canvas, truth: list.map(truthRow) };
}

const STORES = [
  ['SOBEYS', 'Groceries'], ['FARM BOY', 'Groceries'], ['TIM HORTONS', 'Dining Out'],
  ['SHOPPERS DRUG MART', 'Healthcare'], ['CAFE PYRENEES', 'Dining Out'], ['DOLLARAMA', 'Shopping'],
];
const ITEMS = ['BANANAS', 'MILK 2L', 'BREAD', 'COFFEE', 'EGGS 12', 'BAGEL', 'SHAMPOO', 'NOTEBOOK'];

function receipt(r) {
  const [store, category] = pick(r, STORES);
  const back = Math.floor(r() * 10);
  const date = dayOf(back);
  const [y4, m2, d2] = date.split('-');
  const dateText = pick(r, [`${y4}/${m2}/${d2} 12:31`, `${MONTHS[Number(m2) - 1]} ${Number(d2)}, ${y4}`, `${m2}/${d2}/${y4}`]);
  const items = Array.from({ length: 2 + Math.floor(r() * 5) }, () => [pick(r, ITEMS), cents(r, 1, 20)]);
  const subtotal = items.reduce((sum, [, c]) => sum + c, 0);
  const tax = Math.round(subtotal * 0.13);
  const tip = store.startsWith('CAFE') ? cents(r, 1, 5) : 0;
  const total = subtotal + tax + tip;

  const lines = [
    ['50px', store], ['30px', '450 Columbia St W'], ['30px', '(519) 555-0100'], ['30px', dateText], ['30px', ''],
    ...items.map(([name, c]) => ['34px', name, plain(c)]),
    ['34px', 'SUBTOTAL', plain(subtotal)],
    ['34px', 'HST 13%', plain(tax)],
    ...(tip ? [['34px', 'TIP', plain(tip)]] : []),
    ['bold 40px', 'TOTAL', plain(total)],
    ['30px', ''], ['30px', 'VISA ****1234'], ['30px', 'THANK YOU'],
  ];
  const canvas = createCanvas(800, 120 + lines.length * 70);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // A slight tilt, as a phone photo would have.
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((r() - 0.5) * 3 * Math.PI) / 180);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  ctx.fillStyle = '#222222';
  let y = 90;
  for (const [font, left, right] of lines) {
    ctx.font = `${font} monospace`;
    ctx.fillText(left, 60, y);
    if (right) rightAligned(ctx, right, 740, y);
    y += 70;
  }
  return {
    canvas,
    truth: [{ date, amount: plain(total), type: 'expense', description: store, category }],
  };
}

const STYLES = { 'bank-signed': signedWithHeaders, 'bank-balance': balanceColumn, 'bank-pending': unsignedPending, receipt };
const LAYOUT = { 'bank-signed': 'bank-list', 'bank-balance': 'bank-list', 'bank-pending': 'bank-list', receipt: 'receipt' };

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) rmSync(join(OUT, file));

let seed = 1;
for (const [style, draw] of Object.entries(STYLES)) {
  const count = style === 'receipt' ? PER_STYLE * 3 : PER_STYLE;
  for (let i = 0; i < count; i++) {
    const { canvas, truth } = draw(rng(seed++));
    const name = `${style}-${String(i + 1).padStart(2, '0')}`;
    writeFileSync(join(OUT, `${name}.png`), canvas.toBuffer('image/png'));
    writeFileSync(join(OUT, `${name}.truth.json`),
      `${JSON.stringify({ layout: LAYOUT[style], style, today: TODAY, rows: truth }, null, 2)}\n`);
  }
}
console.log(`wrote ${seed - 1} images to ${OUT}`);
