import { describe, expect, it } from 'vitest';
import { binarize, estimateSkew, normalize, segmentLines, type Gray } from '../apps/web/src/platform/ocr-image';

// Synthetic "handwriting": wavy strokes of random-ish dashes inside each line band.
function page(width: number, height: number, bands: [number, number][], opts: { slope?: number; ruled?: number[]; shade?: boolean } = {}): Gray {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data[y * width + x] = opts.shade ? Math.round(250 - 120 * (x / width)) : 245;
  }
  const ink = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = 30; };
  for (const [top, bottom] of bands) {
    for (let x = 40; x < width - 60; x++) {
      if (x % 23 > 17) continue; // word/letter gaps
      const lift = Math.round((opts.slope ?? 0) * x);
      const mid = (top + bottom) / 2 + Math.sin(x / 6) * (bottom - top) * 0.35;
      for (let t = -2; t <= 2; t++) ink(x, Math.round(mid) + t - lift);
      if (x % 23 === 3) for (let y = top; y < bottom; y++) ink(x, y - lift); // vertical strokes
    }
  }
  for (const y of opts.ruled ?? []) for (let x = 0; x < width; x++) { data[y * width + x] = 90; data[(y + 1) * width + x] = 90; }
  return { data, width, height };
}

describe('handwriting line segmentation', () => {
  it('finds each written line top to bottom', () => {
    const g = page(800, 400, [[40, 90], [150, 200], [270, 320]]);
    const boxes = segmentLines(binarize(g), g.width, g.height);
    expect(boxes).toHaveLength(3);
    expect(boxes.map(b => b.y)).toEqual([...boxes.map(b => b.y)].sort((a, b) => a - b));
    for (const [i, [top, bottom]] of [[40, 90], [150, 200], [270, 320]].entries()) {
      expect(boxes[i]!.y).toBeLessThanOrEqual(top);
      expect(boxes[i]!.y + boxes[i]!.h).toBeGreaterThanOrEqual(bottom);
    }
  });

  it('ignores ruled paper lines and survives a shadowed page', () => {
    const g = normalize(page(800, 400, [[40, 90], [150, 200], [270, 320]], { ruled: [120, 240, 350], shade: true }));
    expect(segmentLines(binarize(g), g.width, g.height)).toHaveLength(3);
  });

  it('splits two lines whose strokes touch', () => {
    const g = page(800, 300, [[40, 95], [92, 147], [220, 275]]);
    expect(segmentLines(binarize(g), g.width, g.height)).toHaveLength(3);
  });

  it('returns nothing for a blank page', () => {
    const g = normalize(page(600, 300, []));
    expect(segmentLines(binarize(g), g.width, g.height)).toEqual([]);
  });

  it('estimates the slant of lines that rise to the right', () => {
    const slope = Math.tan(3 * Math.PI / 180);
    const g = page(800, 500, [[150, 190], [260, 300], [370, 410]], { slope });
    expect(estimateSkew(binarize(g), g.width, g.height)).toBeCloseTo(3, 0);
    const flat = page(800, 500, [[150, 190], [260, 300], [370, 410]]);
    expect(estimateSkew(binarize(flat), flat.width, flat.height)).toBe(0);
  });
});
