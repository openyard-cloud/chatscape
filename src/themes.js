// The theme library. Each theme is data only: an id, a name, a group, whether
// it is dark, and the layers the engine paints in order (see engine.js for
// what each layer type takes). Colours are 0xRRGGBB numbers.
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});

  const fish = (color) => ({
    color,
    frames: [['><(((°>'], ['}<(((°>']],
    left: [['<°)))><'], ['<°)))>{']],
  });

  const jelly = (color) => ({
    color,
    frames: [
      [' ,-~-, ', '(_____)', ' )(|)( ', ' ( | ) ', '  ) (  '],
      [' .-~-. ', '(_____)', ' ()|() ', ' ) | ( ', '  ( )  '],
    ],
  });

  const lantern = (color) => ({ color, frames: [[' _|_ ', '(###)', '(###)', ' "-" '], [' _|_ ', '(###)', '(###)', ' -"- ']] });

  const invader = (color) => ({ color, frames: [[' /OO\\ ', '<\\/\\/>', ' /  \\ '], [' /OO\\ ', '<\\/\\/>', ' \\  / ']] });

  CS.THEMES = [
    // Nature
    {
      id: 'cloud-drift',
      name: 'Cloud Drift',
      group: 'Nature',
      dark: false,
      layers: [
        { type: 'gradient', from: 0x4fa3e3, to: 0xc3e6f8 },
        { type: 'clouds', density: 1.2, speed: 1.1, glyphs: 'StX%stx$', fg: 0x9fc8e4, bg: 0xe9f5fc, seed: 1 },
      ],
    },
    {
      id: 'fireflies',
      name: 'Fireflies',
      group: 'Nature',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x020705, to: 0x0a1d10 },
        { type: 'grass', glyphs: ['/', '|', '\\'], from: 0x1d5a24, to: 0x4fa83a, height: 4 },
        { type: 'particles', density: 3, min: 8, glyphs: ['·', '*'], colors: [0xfff38a], dim: 0x40400f, glow: 0x3a3a0c, pulse: 2.6, vx: 0.4, wobble: 4, y1: 0.9 },
      ],
    },
    {
      id: 'bamboo',
      name: 'Bamboo Grove',
      group: 'Nature',
      dark: false,
      layers: [
        { type: 'gradient', from: 0xe4f0d6, to: 0xa9cf94 },
        { type: 'stalks', density: 1.6, glyphs: ['|', '|'], from: 0x5c8f43, to: 0x2f5a24, height: [0.75, 1], sway: 0.6 },
        { type: 'particles', density: 2.5, min: 8, glyphs: ['~', '-', ','], colors: [0x6a9a3a, 0x9bc45a, 0x4e7d2a], vx: 1.2, vy: 1.6, wobble: 2.5 },
      ],
    },
    {
      id: 'sakura',
      name: 'Sakura',
      group: 'Nature',
      dark: false,
      layers: [
        { type: 'gradient', from: 0xfbe3ec, to: 0xf3bfd0 },
        { type: 'clouds', density: 0.5, speed: 0.5, glyphs: '~-', fg: 0xf7d3df, bg: 0xfdeef3, seed: 4, y1: 0.5 },
        { type: 'particles', density: 9, min: 12, glyphs: ['*', '°', '·', ','], colors: [0xf27aa0, 0xff9fbe, 0xffffff, 0xe0608a], vx: 1.6, vy: 1.3, wobble: 2.5 },
      ],
    },

    // Water
    {
      id: 'koi-pond',
      name: 'Koi Pond',
      group: 'Water',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x0d505e, to: 0x052c38 },
        { type: 'waves', glyphs: '~', from: 0x2f8796, threshold: 1.15 },
        { type: 'sprites', mode: 'still', count: 4, items: [{ color: 0x58b04a, frames: [['(@@)', ' `` ']] }] },
        { type: 'sprites', mode: 'orbit', count: 5, speed: 0.35, fps: 4, rx: 0.36, ry: 0.36, items: [fish(0xff7a2f), fish(0xf4f1ea), fish(0xffc23d)] },
      ],
    },
    {
      id: 'jellyfish',
      name: 'Jellyfish',
      group: 'Water',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x0b2c72, to: 0x020618 },
        { type: 'particles', density: 0.6, glyphs: ['.', 'o', '°'], colors: [0x5d7fc2], vy: -2.5, wobble: 1 },
        { type: 'sprites', mode: 'rise', count: 4, speed: 1.2, sway: 3, items: [jelly(0xff8ad8), jelly(0xb98aff), jelly(0x7fe9ff), jelly(0xffb37f)] },
      ],
    },
    {
      id: 'honu-lagoon',
      name: 'Honu Lagoon',
      group: 'Water',
      dark: false,
      layers: [
        { type: 'gradient', from: 0x3ccbcc, to: 0x0e6a87 },
        { type: 'waves', glyphs: '/', from: 0x5fd9d6, to: 0x2a93a8, fx: 0.08, fy: -0.16, speed: 0.6, threshold: 1.35, y1: 0.7 },
        { type: 'stalks', density: 1, glyphs: [')', '('], from: 0x2e8b57, to: 0x1f6b44, height: [0.2, 0.45], base: 2 },
        { type: 'ground', rows: 2, from: 0xd9c085, to: 0xe6cf96, glyphs: '.,', fg: 0xb8975c, density: 0.25 },
        { type: 'particles', density: 0.4, glyphs: ['.', 'o'], colors: [0xd8fbff], vy: -3, wobble: 1, y1: 0.95 },
        {
          type: 'sprites',
          speed: 2.2,
          dir: 1,
          count: 2,
          bob: 1,
          fps: 2,
          y0: 0.15,
          y1: 0.7,
          items: [{ color: 0x7da836, frames: [['   ____', ' _/####\\_o', '  /    \\'], ['   ____', ' _/####\\_o', '  \\    /']] }],
        },
      ],
    },
    {
      id: 'paper-boats',
      name: 'Paper Boats',
      group: 'Water',
      dark: false,
      layers: [
        { type: 'gradient', from: 0xffd6a5, to: 0xff9f80, y1: 0.45 },
        { type: 'gradient', from: 0x2b5d8a, to: 0x12304f, y0: 0.45 },
        { type: 'disc', x: 0.9, y: 0.4, r: 3, bg: 0xffeaa0, glow: 0xffe2a0 },
        { type: 'waves', glyphs: '~-', from: 0x6fa3cf, to: 0x2d5f8f, fx: 0.5, fy: 0.9, speed: 2, threshold: 1.1, y0: 0.45 },
        { type: 'sprites', speed: 1.4, dir: 1, count: 4, bob: 1, y0: 0.5, y1: 0.95, items: [{ color: 0xfbfbfb, frames: [['  /\\  ', '_/__\\_', '\\____/']] }] },
      ],
    },

    // Night sky
    {
      id: 'moonlit',
      name: 'Moonlit',
      group: 'Night sky',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x060a22, to: 0x1c2555 },
        { type: 'stars', density: 0.03, glyphs: '.·*+', from: 0x2a3060, to: 0xffffff },
        { type: 'disc', x: 0.9, y: 0.2, r: 4, glyphs: '%t', fg: 0x8a8264, bg: 0xefe6c4, bite: 0.6, glow: 0x3a3f70 },
        { type: 'clouds', density: 0.5, speed: 0.6, glyphs: 'StX%stx', fg: 0x6a7cd0, bg: 0x24337a, seed: 50 },
      ],
    },
    {
      id: 'meteor-shower',
      name: 'Meteor Shower',
      group: 'Night sky',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x03041a, to: 0x161b40 },
        { type: 'stars', density: 0.035, glyphs: '.·+', from: 0x262b55, to: 0xe8ecff, speed: 1.5 },
        { type: 'meteors', count: 7, period: 4, length: 10, color: 0xfff6d8, y1: 0.8 },
      ],
    },
    {
      id: 'aurora',
      name: 'Aurora',
      group: 'Night sky',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x020814, to: 0x0a1a2a },
        { type: 'stars', density: 0.015, glyphs: '.·', from: 0x1a2a3a, to: 0xcfe7ff },
        { type: 'aurora', colors: [0x3dffa8, 0x39d0ff, 0xb26bff], glyphs: '|!:', speed: 0.35, y0: 0.05, y1: 0.6 },
        { type: 'ground', rows: 3, from: 0x08121c, to: 0x050a10 },
      ],
    },
    {
      id: 'night-city',
      name: 'Night City',
      group: 'Night sky',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x0b0f2a, to: 0x2a1840 },
        { type: 'stars', density: 0.012, glyphs: '.·', from: 0x262a50, to: 0xffffff, y1: 0.5 },
        { type: 'disc', x: 0.18, y: 0.18, r: 2.5, bg: 0xf6efd2, glow: 0x3a3360 },
        { type: 'skyline', from: 0x141629, to: 0x22223c, window: 0xffd27f, windowOff: 0x2c2c48, height: [0.15, 0.55] },
      ],
    },

    // Weather and seasons
    {
      id: 'window-rain',
      name: 'Window Rain',
      group: 'Weather',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x2b3440, to: 0x161c24 },
        { type: 'columns', density: 0.35, glyphs: '|:', color: 0x7d93ad, speed: [14, 24], length: [1, 4] },
        { type: 'particles', density: 0.8, glyphs: ['o', '.', '°'], colors: [0xa8bccf, 0x8aa1b8], vy: 0.5, wobble: 0.3 },
      ],
    },
    {
      id: 'snowfall',
      name: 'Snowfall',
      group: 'Weather',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x1b2a44, to: 0x41597e },
        { type: 'particles', density: 14, min: 20, glyphs: ['*', '·', '.'], colors: [0xffffff, 0xdfe9f5], vx: 0.5, vy: 2.2, wobble: 1.5 },
        { type: 'ground', rows: 2, from: 0xdfe7f1, to: 0xf3f6fa, glyphs: '.', fg: 0xc3cfde, density: 0.2 },
      ],
    },
    {
      id: 'sunset-beach',
      name: 'Sunset Beach',
      group: 'Weather',
      dark: false,
      layers: [
        { type: 'gradient', from: 0x6b4aa0, to: 0xffa56b, y1: 0.55 },
        { type: 'gradient', from: 0xe07a5f, to: 0x3d5a80, y0: 0.55 },
        { type: 'disc', x: 0.88, y: 0.52, r: 4, bg: 0xffd27f, glow: 0xffb36b },
        { type: 'waves', glyphs: '~-', from: 0xffc49b, to: 0x6d87a8, fx: 0.45, fy: 1.1, speed: 1.6, threshold: 1.0, y0: 0.57, y1: 0.9 },
        { type: 'ground', rows: 3, from: 0xe9c89a, to: 0xf3dcb4, glyphs: '.,', fg: 0xc9a06b, density: 0.2 },
        { type: 'sprites', speed: 3, dir: -1, count: 3, bob: 1, fps: 3, y0: 0.08, y1: 0.4, items: [{ color: 0x3b2a4f, frames: [['\\v/'], ['-v-']] }] },
      ],
    },
    {
      id: 'lanterns',
      name: 'Mid-Autumn Lanterns',
      group: 'Weather',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x1a0b2e, to: 0x3a1236 },
        { type: 'stars', density: 0.015, glyphs: '.·', from: 0x302048, to: 0xffe9c0 },
        { type: 'disc', x: 0.9, y: 0.18, r: 4.5, bg: 0xffe7a3, glow: 0x5a3050 },
        { type: 'sprites', mode: 'rise', count: 5, speed: 1.1, sway: 2, items: [lantern(0xff7a3d), lantern(0xffb03b), lantern(0xff4f5e)] },
        { type: 'particles', density: 0.4, glyphs: ['·', '*'], colors: [0xffcf7a], dim: 0x3a1236, pulse: 3, vy: -1.5, wobble: 1 },
      ],
    },

    // Tech and abstract
    {
      id: 'code-rain',
      name: 'Code Rain',
      group: 'Tech',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x1f1b18, to: 0x14110f },
        { type: 'columns', density: 0.45, glyphs: '{}()<>/=;:*+.$#', color: 0xd97757, head: 0xffd2b8, speed: [4, 12], length: [4, 14] },
      ],
    },
    {
      id: 'neon-rain',
      name: 'Neon Rain',
      group: 'Tech',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x0d0221, to: 0x261447 },
        { type: 'skyline', from: 0x120726, to: 0x1c0b38, window: 0xff2a6d, windowOff: 0x05d9e8, height: [0.2, 0.6] },
        { type: 'columns', density: 0.3, glyphs: '|', color: 0x05d9e8, speed: [18, 28], length: [2, 5] },
      ],
    },
    {
      id: 'game-of-life',
      name: 'Game of Life',
      group: 'Tech',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x0b1020, to: 0x0f1630 },
        { type: 'life', color: 0x7cf29a, step: 0.25 },
      ],
    },
    {
      id: 'retro-8bit',
      name: 'Retro 8-bit',
      group: 'Tech',
      dark: true,
      layers: [
        { type: 'gradient', from: 0x000010, to: 0x14002e },
        { type: 'particles', density: 1.5, glyphs: ['.', '·'], colors: [0xffffff, 0x8888ff], vy: 6 },
        { type: 'sprites', speed: 2, dir: 1, count: 4, fps: 2, y0: 0.08, y1: 0.45, items: [invader(0x7cff6b), invader(0xff6bd5), invader(0x6bd5ff)] },
        { type: 'sprites', mode: 'still', count: 1, y0: 0.85, y1: 0.95, items: [{ color: 0xffe66b, frames: [['  ^  ', '/[_]\\']] }] },
      ],
    },
  ];

  CS.themeById = (id) => CS.THEMES.find((theme) => theme.id === id) ?? CS.THEMES[0];
})();
