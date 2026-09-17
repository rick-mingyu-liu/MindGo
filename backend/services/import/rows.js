/**
 * OCR returns separate text boxes; a transaction is a visual row. Boxes whose
 * vertical extents overlap by at least half the shorter one belong to the same
 * row. Everything downstream works on rows.
 *
 * A box must also have its middle inside the row so far. Without that, a tall
 * box straddling two lines — a chevron beside an amount and the balance under
 * it, measured 2026-09-17 — widens the row until it swallows the next line,
 * and the two amounts come back in the wrong order.
 *
 * Within a row, boxes read top line first, then left to right.
 *
 * A box holding one character that is not a letter, digit, sign or currency
 * symbol is an icon the model tried to read — a shopping bag comes back as
 * "凸", at up to 0.96 confidence (measured 2026-09-17) — and is dropped before
 * it can join a description or drag down a row's confidence. A lone Latin
 * letter or a lone digit is kept.
 *
 * A line is `{ text, conf, box: { x, y, width, height } }` in image pixels.
 * A row is `{ text, conf, box, height, lines }`, lines in reading order.
 */
const KEPT_SINGLE = /^[A-Za-z0-9\p{Sc}+\-−]$/u;
const isIcon = (text) => [...text].length === 1 && !KEPT_SINGLE.test(text);

function groupRows(lines) {
  const usable = (lines || [])
    .filter((line) => line && typeof line.text === 'string' && line.text.trim() && line.box)
    .map((line) => ({ text: line.text.trim(), conf: line.conf, box: line.box }))
    .filter((line) => !isIcon(line.text))
    .sort((a, b) => (a.box.y + a.box.height / 2) - (b.box.y + b.box.height / 2));

  const groups = [];
  for (const line of usable) {
    const top = line.box.y;
    const bottom = line.box.y + line.box.height;
    const last = groups[groups.length - 1];
    if (last) {
      const overlap = Math.min(bottom, last.bottom) - Math.max(top, last.top);
      const middle = top + line.box.height / 2;
      if (overlap >= 0.5 * Math.min(line.box.height, last.minHeight)
        && middle >= last.top && middle <= last.bottom) {
        last.lines.push(line);
        last.top = Math.min(last.top, top);
        last.bottom = Math.max(last.bottom, bottom);
        last.minHeight = Math.min(last.minHeight, line.box.height);
        continue;
      }
    }
    groups.push({ lines: [line], top, bottom, minHeight: line.box.height });
  }

  return groups.map(({ lines: members }) => {
    const sorted = readingOrder(members);
    const left = Math.min(...sorted.map((l) => l.box.x));
    const right = Math.max(...sorted.map((l) => l.box.x + l.box.width));
    const top = Math.min(...sorted.map((l) => l.box.y));
    const bottom = Math.max(...sorted.map((l) => l.box.y + l.box.height));
    return {
      text: sorted.map((l) => l.text).join(' '),
      conf: Math.min(...sorted.map((l) => l.conf)),
      box: { x: left, y: top, width: right - left, height: bottom - top },
      height: Math.max(...sorted.map((l) => l.box.height)),
      lines: sorted,
    };
  });
}

/** Splits a row into the lines it spans, top first, each left to right. */
function readingOrder(members) {
  const byMiddle = [...members].sort((a, b) => middleOf(a) - middleOf(b));
  const bands = [];
  for (const line of byMiddle) {
    const band = bands[bands.length - 1];
    const previous = band && band[band.length - 1];
    if (previous && middleOf(line) - middleOf(previous) < 0.5 * Math.min(line.box.height, previous.box.height)) {
      band.push(line);
    } else {
      bands.push([line]);
    }
  }
  return bands.flatMap((band) => band.sort((a, b) => a.box.x - b.box.x));
}

const middleOf = (line) => line.box.y + line.box.height / 2;

module.exports = { groupRows };
