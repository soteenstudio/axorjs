import { escapeSingleQuotes } from './escapeSingleQuotes.js';

export function parseTextNode(text: string): {
  code: string;
  isReactive: boolean;
  rawExpression: string;
} {
  const regex = /\{([\s\S]*?)\}/g;

  if (!text.match(regex)) {
    return {
      code: `'${escapeSingleQuotes(text)}'`,
      isReactive: false,
      rawExpression: '',
    };
  }

  const formattedText = text.replace(regex, (_, expression) => {
    return `\${${expression.trim()}}`;
  });

  return {
    code: `\`${formattedText}\``,
    isReactive: true,
    rawExpression: formattedText,
  };
}
