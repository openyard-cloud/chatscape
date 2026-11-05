// Checks that look at pixels, the way a person sees the page, not at the DOM.
import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (r: number, g: number, b: number) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function pixels(target: Locator | Page, clip?: { x: number; y: number; width: number; height: number }) {
  const png = PNG.sync.read(await target.screenshot({ clip, animations: 'disabled' }));
  const out: number[] = [];
  for (let i = 0; i < png.data.length; i += 4) out.push(luminance(png.data[i], png.data[i + 1], png.data[i + 2]));
  return out;
}

/**
 * Contrast between the text of an element and what is behind it, from a screenshot.
 * The background is the median pixel; the text is whichever 2% extreme is farther from it.
 * WCAG asks 4.5:1 for body text and 7:1 for AAA.
 */
export async function textContrast(element: Locator) {
  const ls = (await pixels(element)).sort((a, b) => a - b);
  const pick = (q: number) => ls[Math.min(ls.length - 1, Math.floor(ls.length * q))];
  const bg = pick(0.5), dark = pick(0.02), light = pick(0.98);
  return Math.max(ratio(dark, bg), ratio(light, bg));
}

/**
 * The worst contrast anywhere in an element's text: every line of text is found with a
 * Range, cut into short pieces, and each piece is measured on its own, so a bright moon
 * behind a few words is not averaged away. Returns the 5th percentile over the pieces.
 */
export async function worstContrast(page: Page, selector: string, pieceWidth = 70) {
  const boxes: { x: number; y: number; w: number; h: number }[] = await page.evaluate(([sel, pw]) => {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    const walker = document.createTreeWalker(document.querySelector(sel as string)!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent!.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        for (let x = r.left; x + 20 < r.right; x += pw as number) out.push({ x: Math.round(x), y: Math.round(r.top), w: Math.round(Math.min(pw as number, r.right - x)), h: Math.round(r.height) });
      }
    }
    return out;
  }, [selector, pieceWidth] as const);
  const png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  const scores: number[] = [];
  for (const b of boxes) {
    const ls: number[] = [];
    for (let y = Math.max(0, b.y); y < Math.min(png.height, b.y + b.h); y++) {
      for (let x = Math.max(0, b.x); x < Math.min(png.width, b.x + b.w); x++) {
        const i = (y * png.width + x) * 4;
        ls.push(luminance(png.data[i], png.data[i + 1], png.data[i + 2]));
      }
    }
    if (ls.length < 100) continue;
    ls.sort((a, b) => a - b);
    const pick = (q: number) => ls[Math.floor(ls.length * q)];
    const bg = pick(0.5);
    scores.push(Math.max(ratio(pick(0.03), bg), ratio(pick(0.97), bg)));
  }
  scores.sort((a, b) => a - b);
  return scores.length ? scores[Math.floor(scores.length * 0.05)] : Infinity;
}

/** Average luminance of an area: lets a test compare "before" and "after". */
export async function brightness(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const ls = await pixels(page, clip);
  return ls.reduce((a, b) => a + b, 0) / ls.length;
}

/** How much an area varies: a solid painted band has almost none, a scene has plenty. */
export async function variation(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const ls = await pixels(page, clip);
  const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
  return Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length);
}

/** Types into a contenteditable composer like a person, then presses Enter. */
export async function send(page: Page, editor: string, text: string) {
  await page.locator(editor).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** The picker panel inside Chatscape's shadow root (Playwright locators pierce open shadow roots). */
export const picker = (page: Page) => page.locator('#chatscape-picker [role="dialog"]');
