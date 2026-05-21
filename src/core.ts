import { parseHTML } from './parser';
import { compileToJS } from './compiler';
import { generateHTML } from './template';

export function compileFramework(
  sourceCode: string,
  pageTitle?: string,
): string {
  const ast = parseHTML(sourceCode);

  const jsOutput = compileToJS(ast);

  const finalHTML = generateHTML(jsOutput, pageTitle);

  return finalHTML;
}
