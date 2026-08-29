import type { ElementHandle, Page } from 'puppeteer-core';

export const isVisible = async (element: ElementHandle<Element>) => element.evaluate((node) => {
  const style = window.getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
}).catch(() => false);

export const firstVisible = async (page: Page, selectors: string[]) => {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (!element) continue;
    if (await isVisible(element)) return element as ElementHandle<Element>;
    await element.dispose();
  }
  return null;
};

export const visibleElements = async (page: Page, selector: string) => {
  const elements = await page.$$(selector);
  const visible: ElementHandle<Element>[] = [];
  for (const element of elements) {
    if (await isVisible(element)) visible.push(element as ElementHandle<Element>);
    else await element.dispose();
  }
  return visible;
};
