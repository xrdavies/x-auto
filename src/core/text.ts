import { XAutoError } from './errors.js';
import twitterText from 'twitter-text';

export const maxPostCharacters = 280;

export const countCharacters = (value: string) => Array.from(value).length;

export const checkText = (value: string) => {
  const text = value.trim();
  const characters = countCharacters(text);
  const parsed = twitterText.parseTweet(text);
  if (!text) throw new XAutoError('TEXT_EMPTY', '推文内容不能为空');
  if (!parsed.valid) {
    throw new XAutoError('TEXT_TOO_LONG', `推文加权长度 ${parsed.weightedLength} 超过 ${maxPostCharacters}`, {
      details: { characters, weightedLength: parsed.weightedLength, limit: maxPostCharacters },
    });
  }
  return { text, characters, weightedLength: parsed.weightedLength, limit: maxPostCharacters };
};
