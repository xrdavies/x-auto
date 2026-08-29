import type { ElementHandle, Page } from 'puppeteer-core';
import { setTimeout as delay } from 'node:timers/promises';

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

export const firstVisibleWithin = async (root: ElementHandle<Element>, selectors: string[]) => {
  for (const selector of selectors) {
    const element = await root.$(selector);
    if (!element) continue;
    if (await isVisible(element)) return element as ElementHandle<Element>;
    await element.dispose();
  }
  return null;
};

export const waitForVisible = async (page: Page, selectors: string[], timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const element = await firstVisible(page, selectors);
    if (element) return element;
    await delay(250);
  }
  return null;
};

export const waitForVisibleElements = async (page: Page, selector: string, count: number, timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const elements = await visibleElements(page, selector);
    if (elements.length >= count) return elements;
    await Promise.all(elements.map((element) => element.dispose()));
    await delay(250);
  }
  return [];
};
