import * as acorn from 'acorn';

export function extractScriptAndHTML(source: string): {
  scriptCode: string;
  htmlMarkup: string;
  extractedGlobals: string[];
} {
  let jsEndIndex = 0;

  try {
    acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
    jsEndIndex = source.length;
  } catch (err: any) {
    if (err.pos !== undefined) {
      jsEndIndex = err.pos;
    } else {
      const firstTag = source.indexOf('<');
      jsEndIndex = firstTag !== -1 ? firstTag : 0;
    }
  }

  let scriptCode = source.substring(0, jsEndIndex).trim();
  let htmlMarkup = source.substring(jsEndIndex).trim();

  const persistentVars: string[] = [];
  const globalVars: string[] = [];

  let globalStoreSetup = `
    if (!window.axel_globalStore) window.axel_globalStore = {};
  `;

  if (
    scriptCode.includes('@persist') ||
    scriptCode.includes('@global') ||
    scriptCode.includes('@once') ||
    scriptCode.includes('@memo')
  ) {
    const lines = scriptCode.split('\n');

    for (let i = 0; i < lines.length - 1; i++) {
      const currentLine = lines[i];
      const nextLine = lines[i + 1].trim();

      if (currentLine.includes('//') && currentLine.includes('@persist')) {
        const varMatch = nextLine.match(
          /^(?:let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*([\s\S]+?);?$/,
        );
        if (varMatch) {
          const varName = varMatch[1];
          const initValue = varMatch[2].trim();
          persistentVars.push(varName);
          lines[i + 1] = `let ${varName} = (() => {
            const cached = localStorage.getItem('axel_persist_${varName}');
            if (cached !== null) { try { return JSON.parse(cached); } catch(e) { return cached; } }
            localStorage.setItem('axel_persist_${varName}', JSON.stringify(${initValue}));
            return ${initValue};
          })();`;
          lines[i] = '';
        }
      }

      if (currentLine.includes('//') && currentLine.includes('@global')) {
        const varMatch = nextLine.match(
          /^(?:let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*([\s\S]+?);?$/,
        );
        if (varMatch) {
          const varName = varMatch[1];
          const initValue = varMatch[2].trim();
          globalVars.push(varName);

          const fallbackValue = persistentVars.includes(varName)
            ? `(() => { const c = localStorage.getItem('axel_persist_${varName}'); return c !== null ? (typeof c === 'string' && !c.startsWith('{') && !c.startsWith('[') ? c : JSON.parse(c)) : ${initValue}; })()`
            : initValue;

          lines[i + 1] = `
            if (window.axel_globalStore['${varName}'] === undefined) {
              window.axel_globalStore['${varName}'] = ${fallbackValue};
            }
            let ${varName} = window.axel_globalStore['${varName}'];
          `;
          lines[i] = '';
        }
      }

      if (currentLine.includes('//') && currentLine.includes('@once')) {
        const funcMatch = nextLine.match(
          /^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/,
        );
        if (funcMatch) {
          const funcName = funcMatch[1];
          lines[i] =
            `let __once_ran_${funcName} = false; let __once_res_${funcName};`;
          lines[i + 1] = nextLine.replace(
            new RegExp(`\\bfunction\\s+${funcName}\\s*\\(([^)]*)\\)\\s*\\{`),
            `function ${funcName}($1) { 
               if (__once_ran_${funcName}) return __once_res_${funcName}; 
               __once_ran_${funcName} = true;
            `,
          );
        }
      }

      if (currentLine.includes('//') && currentLine.includes('@memo')) {
        const funcMatch = nextLine.match(
          /^function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/,
        );
        if (funcMatch) {
          const funcName = funcMatch[1];
          lines[i] = `const __memo_cache_${funcName} = new Map();`;
          lines[i + 1] =
            nextLine.replace(
              `function ${funcName}`,
              `function __orig_${funcName}`,
            ) +
            `\nfunction ${funcName}(...args) {
            const key = JSON.stringify(args);
            if (__memo_cache_${funcName}.has(key)) return __memo_cache_${funcName}.get(key);
            const result = __orig_${funcName}(...args);
            __memo_cache_${funcName}.set(key, result);
            return result;
          }`;
        }
      }
    }

    scriptCode = globalStoreSetup + lines.join('\n');

    try {
      const ast = acorn.parse(scriptCode, {
        ecmaVersion: 2020,
        sourceType: 'module',
      }) as any;
      const replacements: Array<{ start: number; end: number; code: string }> =
        [];

      function walk(node: any) {
        if (!node) return;

        if (
          node.type === 'UpdateExpression' &&
          node.argument.type === 'Identifier'
        ) {
          const varName = node.argument.name;
          const operation = node.operator === '++' ? '+ 1' : '- 1';

          if (
            persistentVars.includes(varName) &&
            globalVars.includes(varName)
          ) {
            replacements.push({
              start: node.start,
              end: node.end,
              code: `(window.axel_globalStore['${varName}'] = window.axel_globalStore['${varName}'] ${operation}, ${varName} = window.axel_globalStore['${varName}'], localStorage.setItem('axel_persist_${varName}', JSON.stringify(${varName})), typeof window.axel_triggerUpdate === 'function' && window.axel_triggerUpdate(), ${varName})`,
            });
          } else if (persistentVars.includes(varName)) {
            replacements.push({
              start: node.start,
              end: node.end,
              code: `(${varName} = ${varName} ${operation}, localStorage.setItem('axel_persist_${varName}', JSON.stringify(${varName})), ${varName})`,
            });
          } else if (globalVars.includes(varName)) {
            replacements.push({
              start: node.start,
              end: node.end,
              code: `(window.axel_globalStore['${varName}'] = window.axel_globalStore['${varName}'] ${operation}, ${varName} = window.axel_globalStore['${varName}'], typeof window.axel_triggerUpdate === 'function' && window.axel_triggerUpdate(), ${varName})`,
            });
          }
        }

        if (
          node.type === 'AssignmentExpression' &&
          node.left.type === 'Identifier'
        ) {
          const varName = node.left.name;
          const rightSideCode = scriptCode.substring(
            node.right.start,
            node.right.end,
          );

          if (
            persistentVars.includes(varName) &&
            globalVars.includes(varName)
          ) {
            if (node.operator === '=') {
              replacements.push({
                start: node.start,
                end: node.end,
                code: `(window.axel_globalStore['${varName}'] = ${rightSideCode}, ${varName} = window.axel_globalStore['${varName}'], localStorage.setItem('axel_persist_${varName}', JSON.stringify(${varName})), typeof window.axel_triggerUpdate === 'function' && window.axel_triggerUpdate(), window.axel_globalStore['${varName}'])`,
              });
            } else {
              const mathOp = node.operator.replace('=', '');
              replacements.push({
                start: node.start,
                end: node.end,
                code: `(window.axel_globalStore['${varName}'] = window.axel_globalStore['${varName}'] ${mathOp} (${rightSideCode}), ${varName} = window.axel_globalStore['${varName}'], localStorage.setItem('axel_persist_${varName}', JSON.stringify(${varName})), typeof window.axel_triggerUpdate === 'function' && window.axel_triggerUpdate(), window.axel_globalStore['${varName}'])`,
              });
            }
          } else if (persistentVars.includes(varName)) {
            if (node.operator === '=') {
              replacements.push({
                start: node.start,
                end: node.end,
                code: `(${varName} = ${rightSideCode}, localStorage.setItem('axel_persist_${varName}', JSON.stringify(${varName})), ${varName})`,
              });
            } else {
              const mathOp = node.operator.replace('=', '');
              replacements.push({
                start: node.start,
                end: node.end,
                code: `(${varName} = ${varName} ${mathOp} (${rightSideCode}), localStorage.setItem('axel_persist_${varName}', JSON.stringify(${varName})), ${varName})`,
              });
            }
          } else if (globalVars.includes(varName)) {
            if (node.operator === '=') {
              replacements.push({
                start: node.start,
                end: node.end,
                code: `(window.axel_globalStore['${varName}'] = ${rightSideCode}, ${varName} = window.axel_globalStore['${varName}'], typeof window.axel_triggerUpdate === 'function' && window.axel_triggerUpdate(), window.axel_globalStore['${varName}'])`,
              });
            } else {
              const mathOp = node.operator.replace('=', '');
              replacements.push({
                start: node.start,
                end: node.end,
                code: `(window.axel_globalStore['${varName}'] = window.axel_globalStore['${varName}'] ${mathOp} (${rightSideCode}), ${varName} = window.axel_globalStore['${varName}'], typeof window.axel_triggerUpdate === 'function' && window.axel_triggerUpdate(), window.axel_globalStore['${varName}'])`,
              });
            }
          }
        }

        if (node.type === 'Identifier' && globalVars.includes(node.name)) {
          const parent = replacements.find(
            (r) => node.start >= r.start && node.end <= r.end,
          );
          const sourceSnippet = scriptCode.substring(
            node.start - 15,
            node.end + 5,
          );
          const isInternalProxy =
            sourceSnippet.includes('axel_persist_') ||
            sourceSnippet.includes('axel_globalStore');

          const isDeclaration = node.parentType === 'VariableDeclarator';

          if (!parent && !isInternalProxy && !isDeclaration) {
            replacements.push({
              start: node.start,
              end: node.end,
              code: `window.axel_globalStore['${node.name}']`,
            });
          }
        }

        for (const key in node) {
          if (node[key] && typeof node[key] === 'object') {
            if (Array.isArray(node[key])) {
              node[key].forEach((child: any) => {
                if (child) child.parentType = node.type;
                walk(child);
              });
            } else {
              if (node[key]) node[key].parentType = node.type;
              walk(node[key]);
            }
          }
        }
      }

      walk(ast);

      replacements.sort((a, b) => b.start - a.start);
      const codeArray = scriptCode.split('');
      replacements.forEach((rep) => {
        codeArray.splice(rep.start, rep.end - rep.start, rep.code);
      });
      scriptCode = codeArray.join('');
    } catch (astError) {
      console.warn('⚠️ [Acorn Engine] Gagal mentransformasikan modifier baru.');
    }
  }

  return {
    scriptCode,
    htmlMarkup,
    extractedGlobals: globalVars,
  };
}
