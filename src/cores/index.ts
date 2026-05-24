import { parseHTML } from './parser.js';
import { compileToJS } from './compiler.js';
import { generateHTML } from './template.js';

export function compileFramework(
  sourceCode: string,
  pageTitle?: string,
): string {
  const ast = parseHTML(sourceCode);

  const jsOutput = compileToJS(ast);

  const finalHTML = generateHTML(jsOutput, pageTitle);

  return finalHTML;
}
