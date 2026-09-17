/**
 * OCR returns separate text boxes; a transaction is a visual row. Boxes whose
 * vertical extents overlap by at least half the shorter one belong to the same
 * row. Everything downstream works on rows.
 *
 * A line is `{ text, conf, box: { x, y, width, height } }` in image pixels.
 * A row is `{ text, conf, box, height, lines }`, lines sorted left to right.
 */
function groupRows(lines) {
  const usable = (lines || [])
    .filter((line) => line && typeof line.text === 'string' && line.text.trim() && line.box)
    .map((line) => ({ text: line.text.trim(), conf: line.conf, box: line.box }))
    .sort((a, b) => (a.box.y + a.box.height / 2) - (b.box.y + b.box.height / 2));

  const groups = [];
  for (const line of usable) {
    const top = line.box.y;
    const bottom = line.box.y + line.box.height;
    const last = groups[groups.length - 1];
    if (last) {
      const overlap = Math.min(bottom, last.bottom) - Math.max(top, last.top);
      if (overlap >= 0.5 * Math.min(line.box.height, last.minHeight)) {
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
    const sorted = [...members].sort((a, b) => a.box.x - b.box.x);
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

module.exports = { groupRows };
