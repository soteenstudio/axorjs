import { DOMNode } from './types';

function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, "\\'");
}

function parseTextNode(text: string): {
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

function processAttribute(value: string): string {
  const match = value.match(/^\{([\s\S]*)\}$/);
  if (match) {
    return match[1].trim();
  }
  return `'${escapeSingleQuotes(value)}'`;
}

function isComponentTag(tagName: string): boolean {
  return tagName[0] === tagName[0].toUpperCase();
}

const MODIFIER_MAP: Record<string, { on: string; off: string | string[] }> = {
  'hover:': { on: 'mouseenter', off: 'mouseleave' },
  'focus:': { on: 'focus', off: 'blur' },
  'active:': { on: 'mousedown', off: ['mouseup', 'mouseleave'] },
};

export function compileToJS(nodes: DOMNode[], isSubComponent = false): string {
  let elementCount = 0;
  let textNodeCount = 0;
  let codeOutput = '';
  let rootVarName: string | null = null;

  let localRegistrySetup = `
    if (!window.axel_reactiveBindings) window.axel_reactiveBindings = [];
    if (!window.axel_triggerUpdate) {
      window.axel_triggerUpdate = () => {
        if (Array.isArray(window.axel_reactiveBindings)) {
          window.axel_reactiveBindings.forEach(fn => { try { fn(); } catch(e){} });
        }
      };
    }
  `;

  function traverse(node: DOMNode, parentVar?: string): void {
    if (node.type === 'tag' && node.name) {
      const varName = `el${elementCount++}`;

      if (!parentVar && !rootVarName) {
        rootVarName = varName;
      }

      if (isComponentTag(node.name)) {
        let propsObj = '{';
        if (node.attribs) {
          for (const [key, value] of Object.entries(node.attribs)) {
            propsObj += `${key}: ${processAttribute(value)}, `;
          }
        }
        propsObj += '}';
        codeOutput += `const ${varName} = ${node.name}(${propsObj});\n`;
      } else {
        codeOutput += `const ${varName} = document.createElement('${node.name}');\n`;

        if (node.attribs) {
          let hasDynamicStyles = false;
          let dynamicListenersCode = '';
          codeOutput += `const ${varName}_backupStyles = {};\n`;

          for (const [key, value] of Object.entries(node.attribs)) {
            const processedAttr = processAttribute(value);
            const matchedPrefix = Object.keys(MODIFIER_MAP).find((prefix) =>
              key.startsWith(prefix),
            );

            if (matchedPrefix) {
              hasDynamicStyles = true;
              const actualKey = key.replace(matchedPrefix, '');
              const config = MODIFIER_MAP[matchedPrefix];
              const backupKey = `${matchedPrefix}${actualKey}`;

              const offEvents = Array.isArray(config.off)
                ? config.off
                : [config.off];
              let offListeners = '';
              offEvents.forEach((evt) => {
                offListeners += `
                ${varName}.addEventListener('${evt}', () => {
                  if (${varName}_backupStyles['${backupKey}'] !== undefined) {
                    ${varName}.style['${actualKey}'] = ${varName}_backupStyles['${backupKey}'];
                  }
                });`;
              });

              dynamicListenersCode += `
              ${varName}.addEventListener('${config.on}', () => {
                if (${varName}_backupStyles['${backupKey}'] === undefined) {
                  ${varName}_backupStyles['${backupKey}'] = ${varName}.style['${actualKey}'];
                }
                ${varName}.style['${actualKey}'] = ${processedAttr};
              });
              ${offListeners}
              `;
            } else if (key.startsWith('on')) {
              const eventName = key.substring(2).toLowerCase();
              codeOutput += `
              ${varName}.addEventListener('${eventName}', (e) => {
                (${processedAttr})(e);
                if (typeof window.axel_triggerUpdate === 'function') window.axel_triggerUpdate();
              });
              `;
            } else {
              codeOutput += `
              if ('${key}' in ${varName} || '${key}' === 'class' || '${key}' === 'class-name' || '${key}'.startsWith('data-')) {
                ${varName}.setAttribute('${key}', ${processedAttr});
              } else {
                ${varName}.style['${key}'] = ${processedAttr};
              }
              `;
            }
          }

          if (hasDynamicStyles) {
            codeOutput += dynamicListenersCode;
          }
        }
      }

      if (parentVar) {
        codeOutput += `${parentVar}.appendChild(${varName});\n`;
      }

      if (node.children) {
        for (const child of node.children) {
          traverse(child, varName);
        }
      }
    } else if (node.type === 'text' && node.data && parentVar) {
      const textMeta = parseTextNode(node.data);
      const txtVarName = `txt${textNodeCount++}`;

      codeOutput += `const ${txtVarName} = document.createTextNode(${textMeta.code});\n`;
      codeOutput += `${parentVar}.appendChild(${txtVarName});\n`;

      if (textMeta.isReactive) {
        codeOutput += `
        window.axel_reactiveBindings.push(() => {
          ${txtVarName}.textContent = \`${textMeta.rawExpression}\`;
        });\n`;
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  let finalCode = localRegistrySetup + codeOutput;

  if (rootVarName) {
    finalCode += `return ${rootVarName};\n`;
  }

  return finalCode;
}
