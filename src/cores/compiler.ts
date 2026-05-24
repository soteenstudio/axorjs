import { DOMNode } from './types.js';
import { escapeSingleQuotes } from '../utils/escapeSingleQuotes.js';
import { parseTextNode } from '../utils/parseTextNode.js';
import { processAttribute } from '../utils/processAttribute.js';
import { isComponentTag } from '../utils/isComponentTag.js';
import { MODIFIER_MAP } from '../utils/constants/MODIFIER_MAP.js';

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

      // 🔥 FIX: CUSTOM COMPONENT DENGAN SUPPORT CHILDREN & SELF-CLOSING
      if (isComponentTag(node.name)) {
        const childrenArrayVar = `children_${varName}`;
        codeOutput += `const ${childrenArrayVar} = [];\n`;

        // Jika komponen punya anak, compile anak-anaknya dulu secara lokal
        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            // Rekursi traverse tapi arahkan parentVar ke array children lokal ini
            traverse(child, childrenArrayVar);
          }
        }

        // Susun objek props, inject properti 'children' ke dalamnya
        let propsObj = '{\n';
        if (node.attribs) {
          for (const [key, value] of Object.entries(node.attribs)) {
            propsObj += `  ${key}: ${processAttribute(value as string)},\n`;
          }
        }
        propsObj += `  children: ${childrenArrayVar}\n`;
        propsObj += '}';

        // Panggil fungsi komponen dengan props yang sudah lengkap
        codeOutput += `const ${varName} = ${node.name}(${propsObj});\n`;
      } else {
        // --- SELEBIHNYA SAMA SEPERTI KODE LAMA LO (NATIVE HTML TAG) ---
        codeOutput += `const ${varName} = document.createElement('${node.name}');\n`;

        if (node.attribs) {
          let hasDynamicStyles = false;
          let dynamicListenersCode = '';
          codeOutput += `const ${varName}_backupStyles = {};\n`;

          for (const [key, value] of Object.entries(node.attribs)) {
            const processedAttr = processAttribute(value as string);
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
            }
            // ==========================================
            // 🔥 DI SINI TEMPATNYA (GANTI BLOK ELSE LAMA LO)
            // ==========================================
            else {
              // Deteksi apakah nilai atribut aslinya dibungkus kurung kurawal `{...}`
              const isDynamicAttr =
                (value as string).startsWith('{') &&
                (value as string).endsWith('}');

              if (isDynamicAttr) {
                // 1. Eksekusi pertama kali saat elemen di-mount
                codeOutput += `
                if ('${key}' in ${varName} || '${key}' === 'class' || '${key}' === 'class-name' || '${key}'.startsWith('data-')) {
                  ${varName}.setAttribute('${key}', ${processedAttr});
                } else {
                  ${varName}.style['${key}'] = ${processedAttr};
                }
                `;

                // 2. Daftarkan ke binding reaktif agar otomatis update pas ada event trigger!
                codeOutput += `
                window.axel_reactiveBindings.push(() => {
                  if ('${key}' in ${varName} || '${key}' === 'class' || '${key}' === 'class-name' || '${key}'.startsWith('data-')) {
                    ${varName}.setAttribute('${key}', ${processedAttr});
                  } else {
                    ${varName}.style['${key}'] = ${processedAttr};
                  }
                });
                `;
              } else {
                // Jika atribut statis (teks biasa), cukup jalankan sekali tanpa masuk binding reaktif
                codeOutput += `
                if ('${key}' in ${varName} || '${key}' === 'class' || '${key}' === 'class-name' || '${key}'.startsWith('data-')) {
                  ${varName}.setAttribute('${key}', ${processedAttr});
                } else {
                  ${varName}.style['${key}'] = ${processedAttr};
                }
                `;
              }
            }
          }

          if (hasDynamicStyles) {
            codeOutput += dynamicListenersCode;
          }
        }

        // Jalankan rekursi children hanya untuk native HTML tag
        if (node.children) {
          for (const child of node.children) {
            traverse(child, varName);
          }
        }
      }

      // Append ke parent DOM (atau push ke array children jika parent-nya adalah Custom Component)
      if (parentVar) {
        if (parentVar.startsWith('children_')) {
          codeOutput += `${parentVar}.push(${varName});\n`;
        } else {
          codeOutput += `${parentVar}.appendChild(${varName});\n`;
        }
      }
    }
    // 🔥 UTAMA: PENANGANAN TEXT NODE & INJECT CHILDREN OTOMATIS
    else if (node.type === 'text' && node.data && parentVar) {
      const trimmedData = node.data.trim();

      // 🌟 DETEKSI KHUSUS: Jika text node murni berisi {props.children}
      if (trimmedData === '{props.children}') {
        const isParentCustomComponent = parentVar.startsWith('children_');

        codeOutput += `
        if (Array.isArray(props && props.children)) {
          (props.children).forEach(child => {
            if (child) {
              ${isParentCustomComponent ? `${parentVar}.push(child);` : `${parentVar}.appendChild(child);`}
            }
          });
        }
        `;
      }
      // Jalankan text node biasa/reaktif jika bukan props.children
      else {
        const textMeta = parseTextNode(node.data);
        const txtVarName = `txt${textNodeCount++}`;

        codeOutput += `const ${txtVarName} = document.createTextNode(${textMeta.code});\n`;

        if (parentVar.startsWith('children_')) {
          codeOutput += `${parentVar}.push(${txtVarName});\n`;
        } else {
          codeOutput += `${parentVar}.appendChild(${txtVarName});\n`;
        }

        if (textMeta.isReactive) {
          codeOutput += `
          window.axel_reactiveBindings.push(() => {
            ${txtVarName}.textContent = \`${textMeta.rawExpression}\`;
          });\n`;
        }
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
