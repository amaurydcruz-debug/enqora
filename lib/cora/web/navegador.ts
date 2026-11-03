import "server-only";
import type { Browser } from "playwright-core";

// CORA Web Research Agent · navegador en la nube.
// En Vercel usa el Chromium liviano de @sparticuz/chromium; fuera de Vercel (desarrollo) usa el Chromium
// instalado con Playwright si existe. Nunca intenta resolver CAPTCHA ni iniciar sesión en un portal.

export const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36 ENQORA-CORA/1.0";

export async function abrirNavegador(): Promise<{ browser: Browser; version: string; launchMs: number }> {
  const t0 = Date.now();
  const { chromium: pw } = await import("playwright-core");
  let browser: Browser;
  if (process.env.VERCEL) {
    const mod = (await import("@sparticuz/chromium")) as unknown as { default: { args: string[]; executablePath: () => Promise<string>; setGraphicsMode?: boolean } };
    const chromium = mod.default;
    chromium.setGraphicsMode = false;
    browser = await pw.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  } else {
    browser = await pw.launch({ headless: true });
  }
  return { browser, version: browser.version(), launchMs: Date.now() - t0 };
}

export const memoriaMb = () => Math.round(process.memoryUsage().rss / 1048576);
