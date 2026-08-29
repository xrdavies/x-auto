import { XAutoError } from './errors.js';

export const parseTweetTarget = (value: string) => {
  const input = value.trim();
  const direct = input.match(/^\d+$/)?.[0];
  const fromUrl = input.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:[^/]+)\/status\/(\d+)/i)?.[1];
  const tweetId = direct || fromUrl;
  if (!tweetId) throw new XAutoError('TARGET_INVALID', '目标必须是 X/Twitter Tweet URL 或数字 Tweet ID');
  return { tweetId, url: `https://x.com/i/status/${tweetId}` };
};
