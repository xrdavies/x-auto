import { XAutoError } from '../core/errors.js';
import { checkText } from '../core/text.js';
import { requireAvailableProfile } from '../core/profiles.js';
import { firstVisible } from '../browser/dom.js';
import { openSession } from '../browser/session.js';

const extractTweetId = (payload: unknown) => {
  const data = payload as { data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string; legacy?: { id_str?: string } } } } } };
  const result = data?.data?.create_tweet?.tweet_results?.result;
  return [result?.rest_id, result?.legacy?.id_str].find((value) => typeof value === 'string' && /^\d+$/.test(value));
};

export const post = async ({ profileId, handle, text, headed = false }: { profileId: string; handle: string; text: string; headed?: boolean }) => {
  const checked = checkText(text);
  const profile = await requireAvailableProfile(profileId);
  const session = await openSession(profile.profilePath, handle, !headed);
  try {
    const composer = await firstVisible(session.page, ['[data-testid="tweetTextarea_0"]', 'div[contenteditable="true"][role="textbox"]']);
    if (!composer) throw new XAutoError('ACTION_NOT_AVAILABLE', '找不到推文输入框');
    await composer.click();
    await composer.type(checked.text, { delay: 10 });
    await composer.dispose();

    const button = await firstVisible(session.page, ['[data-testid="tweetButtonInline"]', '[data-testid="tweetButton"]']);
    if (!button) throw new XAutoError('ACTION_NOT_AVAILABLE', '找不到发布按钮');
    const disabled = await button.evaluate((element) => element.getAttribute('aria-disabled') === 'true');
    if (disabled) {
      await button.dispose();
      throw new XAutoError('PUBLISH_FAILED', 'X 发布按钮不可用，请检查内容或账号状态');
    }

    const responsePromise = session.page.waitForResponse(
      (response) => /\/CreateTweet(?:$|\?|\/)/.test(response.url()) && response.request().method() === 'POST',
      { timeout: 20_000 },
    ).catch(() => null);
    await button.click();
    await button.dispose();
    const response = await responsePromise;
    if (!response) throw new XAutoError('PUBLISH_UNKNOWN', '未收到 X 发布响应，推文可能已经发布，请人工检查', { retryable: false });
    if (!response.ok()) throw new XAutoError('PUBLISH_FAILED', `X 发布请求失败：HTTP ${response.status()}`, { retryable: false });
    const tweetId = extractTweetId(await response.json().catch(() => null));
    if (!tweetId) throw new XAutoError('PUBLISH_UNKNOWN', 'X 返回成功但未能解析 tweet id，请人工检查', { retryable: false });
    return { tweetId, url: `https://x.com/${session.handle}/status/${tweetId}`, weightedLength: checked.weightedLength };
  } finally {
    await session.browser.close();
  }
};
