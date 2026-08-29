import { XAutoError } from './errors.js';

export const maxPostCharacters = 280;

export const countCharacters = (value: string) => Array.from(value).length;

export const checkText = (value: string) => {
  const text = value.trim();
  const characters = countCharacters(text);
  if (!text) throw new XAutoError('TEXT_EMPTY', '推文内容不能为空');
  if (characters > maxPostCharacters) {
    throw new XAutoError('TEXT_TOO_LONG', `推文长度 ${characters} 超过 ${maxPostCharacters} 个 Unicode 字符`, {
      details: { characters, limit: maxPostCharacters },
    });
  }
  return { text, characters, limit: maxPostCharacters };
};
