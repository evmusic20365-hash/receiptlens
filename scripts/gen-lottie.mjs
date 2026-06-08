/**
 * Generates 5 Lottie JSON animation files for the detective mascot.
 * Uses lottie image-layer (ty:2) with external PNG references.
 * Images are loaded from "/" (Next.js public dir) via assetsPath="/".
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT   = join(__dir, '..', 'public', 'lottie');
mkdirSync(OUT, { recursive: true });

// ── Easing presets ────────────────────────────────────────────────────────────
const ease   = { i: { x: [0.42], y: [1] },   o: { x: [0.58], y: [0] } };
const spring = { i: { x: [0.22], y: [1.5] },  o: { x: [0.55], y: [0] } };
const linear = { i: { x: [0.5],  y: [0.5] },  o: { x: [0.5],  y: [0.5] } };

// Keyframe factories — always include easing except on the terminal keyframe
const kp  = (t, x, y, e = ease)     => ({ ...e, t, s: [x, y, 0] });
const kr  = (t, deg, e = ease)       => ({ ...e, t, s: [deg] });
const ks  = (t, sx, sy, e = ease)   => ({ ...e, t, s: [sx, sy, 100] });
const end = (t, val)                  => ({ t, s: Array.isArray(val) ? val : [val] });

// ── Lottie builder ────────────────────────────────────────────────────────────
// Canvas: 256×256. Image anchor at center (128,128). Default pos at (128,128).
// "u":"" + assetsPath="/" in React → resolves to /mascot-*.png at runtime.
function makeLottie(nm, op, fr, imgFile, { r, p, s: sc }) {
  const layer = {
    ddd: 0, ind: 1, ty: 2, nm, refId: 'img_0', sr: 1,
    ks: {
      o: { a: 0, k: 100,              ix: 11 },
      r: r  ?? { a: 0, k: 0,          ix: 10 },
      p: p  ?? { a: 0, k: [128,128,0],ix: 2  },
      a:       { a: 0, k: [128,128,0],ix: 1  },
      s: sc ?? { a: 0, k: [100,100,100], ix: 6 },
    },
    ao: 0, ip: 0, op, st: 0, bm: 0,
  };
  return {
    v: '5.9.0', fr, ip: 0, op, w: 256, h: 256, nm, ddd: 0,
    assets: [{ id: 'img_0', w: 256, h: 256, p: imgFile, u: '', e: 0 }],
    layers: [layer],
  };
}

// ── 1. Running — fast asymmetric bob + alternating tilt ───────────────────────
// 60 frames @ 30fps = 2 s seamless loop
const running = makeLottie('mascot-running', 60, 30, 'mascot-default.png', {
  r: { a: 1, ix: 10, k: [
    kr(0,  -4),  kr(8,  4),   kr(15, -4),  kr(23,  4),
    kr(30, -4),  kr(38, 4),   kr(45, -4),  kr(53,  4),
    end(60, -4),
  ]},
  p: { a: 1, ix: 2, k: [
    kp(0,  128, 136), kp(8,  128, 118), kp(15, 128, 136), kp(23, 128, 118),
    kp(30, 128, 136), kp(38, 128, 118), kp(45, 128, 136), kp(53, 128, 118),
    end(60, [128, 136, 0]),
  ]},
  s: { a: 1, ix: 6, k: [
    ks(0,  100, 92),  ks(8,  100, 108), ks(15, 100, 92),  ks(23, 100, 108),
    ks(30, 100, 92),  ks(38, 100, 108), ks(45, 100, 92),  ks(53, 100, 108),
    end(60, [100, 92, 100]),
  ]},
});

// ── 2. Celebrating — big bouncy jumps with squish+stretch ─────────────────────
// 90 frames @ 30fps = 3 s loop (3 jumps)
const celebrating = makeLottie('mascot-celebrating', 90, 30, 'mascot-celebrating.png', {
  r: { a: 1, ix: 10, k: [
    kr(0, 0, linear),  kr(14, -10, ease), kr(20, -10, ease), kr(28, 0,  ease),
    kr(30, 0, linear), kr(44, 10,  ease), kr(50, 10,  ease), kr(58, 0,  ease),
    kr(60, 0, linear), kr(74, -10, ease), kr(80, -10, ease), kr(88, 0,  ease),
    end(90, 0),
  ]},
  p: { a: 1, ix: 2, k: [
    kp(0,  128, 140, linear), kp(5,  128, 144, ease),   kp(12, 128, 80, spring),
    kp(20, 128, 80,  ease),   kp(26, 128, 144, ease),   kp(30, 128, 140, linear),
    kp(35, 128, 144, ease),   kp(42, 128, 80,  spring), kp(50, 128, 80, ease),
    kp(56, 128, 144, ease),   kp(60, 128, 140, linear), kp(65, 128, 144, ease),
    kp(72, 128, 80,  spring), kp(80, 128, 80,  ease),   kp(86, 128, 144, ease),
    end(90, [128, 140, 0]),
  ]},
  s: { a: 1, ix: 6, k: [
    ks(0,  100, 100, linear), ks(5,  112, 84,  ease),  ks(12, 90, 118,  spring),
    ks(20, 90,  118, ease),   ks(26, 112, 84,  ease),  ks(30, 100, 100, linear),
    ks(35, 112, 84,  ease),   ks(42, 90, 118,  spring),ks(50, 90, 118,  ease),
    ks(56, 112, 84,  ease),   ks(60, 100, 100, linear),ks(65, 112, 84,  ease),
    ks(72, 90,  118, spring), ks(80, 90,  118, ease),  ks(86, 112, 84,  ease),
    end(90, [100, 100, 100]),
  ]},
});

// ── 3. Confused — slow side-to-side tilt + sway ───────────────────────────────
// 80 frames @ 30fps ≈ 2.7 s loop
const confused = makeLottie('mascot-confused', 80, 30, 'mascot-confused.png', {
  r: { a: 1, ix: 10, k: [
    kr(0, 0),  kr(16, -14), kr(32, 0), kr(48, 14), kr(64, 0), end(80, 0),
  ]},
  p: { a: 1, ix: 2, k: [
    kp(0, 128, 128), kp(16, 118, 128), kp(32, 128, 128),
    kp(48, 138, 128), kp(64, 128, 128), end(80, [128, 128, 0]),
  ]},
});

// ── 4. Thinking — slow gentle float + mild sway ───────────────────────────────
// 90 frames @ 30fps = 3 s loop
const thinking = makeLottie('mascot-thinking', 90, 30, 'mascot-default.png', {
  r: { a: 1, ix: 10, k: [
    kr(0, 0), kr(22, -5), kr(45, 0), kr(67, 5), end(90, 0),
  ]},
  p: { a: 1, ix: 2, k: [
    kp(0, 128, 130), kp(22, 128, 118), kp(45, 128, 134),
    kp(67, 128, 118), end(90, [128, 130, 0]),
  ]},
});

// ── 5. Thumbsup — perky bob with gentle lean ─────────────────────────────────
// 60 frames @ 30fps = 2 s loop
const thumbsup = makeLottie('mascot-thumbsup', 60, 30, 'mascot-thumbsup.png', {
  r: { a: 1, ix: 10, k: [
    kr(0, 0), kr(15, -6), kr(30, 0), kr(45, 6), end(60, 0),
  ]},
  p: { a: 1, ix: 2, k: [
    kp(0, 128, 132), kp(15, 128, 116), kp(30, 128, 132),
    kp(45, 128, 116), end(60, [128, 132, 0]),
  ]},
  s: { a: 1, ix: 6, k: [
    ks(0, 100, 100), ks(15, 104, 95), ks(30, 100, 105),
    ks(45, 104, 95), end(60, [100, 100, 100]),
  ]},
});

// ── Write files ───────────────────────────────────────────────────────────────
const files = { running, celebrating, confused, thinking, thumbsup };
for (const [name, data] of Object.entries(files)) {
  const file = join(OUT, `mascot-${name}.json`);
  writeFileSync(file, JSON.stringify(data));
  console.log(`✓ public/lottie/mascot-${name}.json  (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}
