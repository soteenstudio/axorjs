import { Parser } from 'htmlparser2';
import { DOMNode } from './types';

export function parseHTML(htmlInput: string): DOMNode[] {
  const root: DOMNode[] = [];
  const stack: DOMNode[] = [{ type: 'tag', name: 'root', children: root }];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const currentParent = stack[stack.length - 1];
        const newNode: DOMNode = {
          type: 'tag',
          name,
          attribs,
          children: [],
        };
        currentParent.children?.push(newNode);
        stack.push(newNode);
      },
      ontext(text) {
        const trimmed = text.trim();
        if (trimmed) {
          const currentParent = stack[stack.length - 1];
          currentParent.children?.push({
            type: 'text',
            data: trimmed,
          });
        }
      },
      onclosetag() {
        stack.pop();
      },
    },
    { decodeEntities: true, lowerCaseTags: false },
  );

  parser.write(htmlInput);
  parser.end();

  return root;
}
