// Draws a story card onto a 1080×1920 canvas (Instagram-story size) with the same layout as the screen.
// Plain Canvas 2D instead of DOM-to-image: iOS Safari renders foreignObject unreliably.
import { fa } from '../strings.fa';
import { INK, type StoryCard } from './cards';

const Wd = 1080, Ht = 1920, PAD = 96;
const FONT = 'Vazirmatn, system-ui, sans-serif';

function font(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/** Right-aligned RTL text with word wrap; returns the y after the last line. */
function wrap(ctx: CanvasRenderingContext2D, text: string, xRight: number, y: number, maxW: number, lineH: number): number {
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, xRight, y);
        y += lineH;
        line = word;
      } else line = test;
    }
    ctx.fillText(line, xRight, y);
    y += lineH;
  }
  return y;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderCard(card: StoryCard): Promise<Blob> {
  // Make sure the weights we use are loaded before drawing (they're bundled, so this works offline).
  await Promise.all(['400', '700', '900'].map((w) => document.fonts.load(`${w} 40px Vazirmatn`))).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = Wd;
  canvas.height = Ht;
  const ctx = canvas.getContext('2d')!;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const R = Wd - PAD;
  const maxW = Wd - 2 * PAD;

  ctx.fillStyle = card.bg;
  ctx.fillRect(0, 0, Wd, Ht);
  ctx.fillStyle = INK;

  font(ctx, 700, 40);
  ctx.globalAlpha = 0.8;
  ctx.fillText(fa.wrapped.brand, R, 190);
  ctx.globalAlpha = 1;

  font(ctx, 900, 168);
  let y = wrap(ctx, card.title, R, 420, maxW, 176) + 20;

  if (card.lead) {
    font(ctx, 400, 52);
    y = wrap(ctx, card.lead, R, y + 40, maxW, 86);
  }

  if (card.hero) {
    font(ctx, 900, 190);
    ctx.fillText(card.hero.value, R, y + 170);
    const heroW = ctx.measureText(card.hero.value).width;
    font(ctx, 700, 52);
    ctx.fillText(card.hero.label, R - heroW - 36, y + 110);
    if (card.hero.sub) { font(ctx, 400, 40); ctx.fillText(card.hero.sub, R - heroW - 36, y + 170); }
    y += 230;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(PAD, y, maxW, 5);
    ctx.globalAlpha = 1;
    y += 40;
  }

  // stats: two columns
  const colW = maxW / 2;
  card.stats.forEach((s, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = R - col * colW;
    const sy = y + row * 230;
    font(ctx, 900, 96);
    ctx.fillText(s.value, x, sy + 100, colW - 24);
    font(ctx, 400, 40);
    ctx.fillText(s.label, x, sy + 160, colW - 24);
    if (s.sub) { font(ctx, 700, 36); ctx.fillText(s.sub, x, sy + 210, colW - 24); }
  });
  y += Math.ceil(card.stats.length / 2) * 230 + 40;

  if (card.box) {
    font(ctx, 400, 40);
    // measure height first
    const lines = Math.ceil(ctx.measureText(card.box.text).width / (maxW - 120)) + 1;
    const h = 120 + (card.box.value ? 110 : 0) + lines * 66 + 40;
    roundRect(ctx, PAD, y, maxW, h, 64);
    ctx.fillStyle = INK;
    ctx.fill();
    let by = y + 96;
    ctx.fillStyle = '#FFB27A';
    font(ctx, 700, 40);
    ctx.fillText(card.box.title, R - 60, by);
    if (card.box.value) {
      ctx.fillStyle = '#FFE7D4';
      font(ctx, 900, 84);
      ctx.fillText(card.box.value, R - 60, by + 100);
      by += 100;
    }
    ctx.fillStyle = '#FFE7D4';
    font(ctx, 400, 40);
    wrap(ctx, card.box.text, R - 60, by + 76, maxW - 120, 66);
  }

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

export async function shareCard(card: StoryCard, name: string): Promise<void> {
  const blob = await renderCard(card);
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
