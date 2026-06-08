import pkg from '/Users/evansavona/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.js';
const { chromium } = pkg;
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const viewports = [
  { name: 'iphone-se-375x667',         width: 375, height: 667  },
  { name: 'iphone-14-390x844',         width: 390, height: 844  },
  { name: 'iphone-14-pro-max-430x932', width: 430, height: 932  },
  { name: 'pixel-7-412x915',           width: 412, height: 915  },
];

const outDir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();

for (const vp of viewports) {
  const ctx  = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  const client = await ctx.newCDPSession(page);
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${vp.name}.png`), Buffer.from(data, 'base64'));
  await ctx.close();
  console.log('✓', vp.name);
}

await browser.close();
