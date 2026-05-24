import { escapeSingleQuotes } from './escapeSingleQuotes.js';

export function processAttribute(value: string): string {
  const match = value.match(/^\{([\s\S]*)\}$/);
  if (match) {
    return match[1].trim();
  }
  return `'${escapeSingleQuotes(value)}'`;
}
