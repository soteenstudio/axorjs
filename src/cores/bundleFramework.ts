import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import { minifyHTMLStructure } from '../utils/minifyHTMLStructure.js';
import { generateHTML } from './template.js';
import { extractScriptAndHTML } from '../utils/extractScriptAndHTML.js';
import { parseHTML } from './parser.js';
import { compileToJS } from './compiler.js';

interface ClayConfig {
  entry?: string;
  routes?: Record<string, string>;
  output?: string;
  title?: string;
}

export function bundleFramework(
  args: string[],
  CONFIG_FILE_NAME: string,
): string | null {
  try {
    let outputFile = 'dist/index.html';
    let pageTitle = 'Clay Multi Component App';
    let configRoutes: Record<string, string> = {};
    let isSPA = false;
    const allGlobalVariables = new Set<string>();

    const configPath = path.resolve(process.cwd(), CONFIG_FILE_NAME);

    if (fs.existsSync(configPath)) {
      const configFileContent = fs.readFileSync(configPath, 'utf-8');
      try {
        const config: ClayConfig = JSON.parse(configFileContent);
        if (config.output) outputFile = config.output;
        if (config.title) pageTitle = config.title;

        if (config.routes && Object.keys(config.routes).length > 0) {
          configRoutes = config.routes;
          isSPA = true;
        } else if (config.entry) {
          configRoutes = { '/': config.entry };
        }
      } catch (e) {
        console.warn(
          `⚠️  Configuration Error: Failed to parse JSON in ${CONFIG_FILE_NAME}.`,
        );
      }
    }

    if (Object.keys(configRoutes).length === 0) {
      console.error(
        `❌ Build Error: No entry file or routes specified. Configure ${CONFIG_FILE_NAME}.`,
      );
      process.exit(1);
    }

    let compiledSubComponents = '';
    let routerConfigJS = 'const routes = {\n';
    const allGlobalVars = new Set<string>();

    for (const [routePath, fileRelativePath] of Object.entries(configRoutes)) {
      const fullPath = path.resolve(process.cwd(), fileRelativePath);

      if (!fs.existsSync(fullPath)) {
        console.error(`❌ Build Error: Route file not found at: "${fullPath}"`);
        process.exit(1);
      }

      const baseDir = path.dirname(fullPath);
      let pageSource = fs.readFileSync(fullPath, 'utf-8');

      const importRegex = /\/\/\s*@import\s+(\w+)\s+from\s+['"](.+?)['"]/g;
      let match;
      while ((match = importRegex.exec(pageSource)) !== null) {
        const componentName = match[1];
        const compRelativePath = match[2];
        const compFullPath = path.resolve(baseDir, compRelativePath);

        if (fs.existsSync(compFullPath)) {
          let subSource = fs.readFileSync(compFullPath, 'utf-8');
          subSource = subSource.replace(
            /\/\/\s*@import\s+\w+\s+from\s+['"].+?['"]/g,
            '',
          );
          const {
            scriptCode: subScript,
            htmlMarkup: subHtmlMarkup,
            extractedGlobals: subGlobals,
          } = extractScriptAndHTML(subSource);
          if (subGlobals) subGlobals.forEach((v) => allGlobalVariables.add(v));
          const subAst = parseHTML(subHtmlMarkup);
          const subJs = compileToJS(subAst, true);

          compiledSubComponents += `
function ${componentName}(props) {
${subScript ? `// --- Sub-Component Scope ---\n${subScript}\n` : ''}
${subJs}
}\n`;
        }
      }

      const cleanPageSource = pageSource.replace(
        /\/\/\s*@import\s+\w+\s+from\s+['"].+?['"]/g,
        '',
      );
      const {
        scriptCode: pageScript,
        htmlMarkup: pageHtmlMarkup,
        extractedGlobals: pageGlobals,
      } = extractScriptAndHTML(cleanPageSource);
      if (pageGlobals) pageGlobals.forEach((v) => allGlobalVariables.add(v));

      const pageAst = parseHTML(pageHtmlMarkup);
      const pageJs = compileToJS(pageAst, true);

      const pageFunctionName = `Route_${routePath.replace(/[^a-zA-Z0-9]/g, 'Root')}`;

      compiledSubComponents += `
function ${pageFunctionName}() {
${pageScript ? `// --- Page Route Scope ---\n${pageScript}\n` : ''}
${pageJs}
}\n`;

      routerConfigJS += `  "${routePath}": ${pageFunctionName},\n`;
    }

    routerConfigJS += '};\n';

    const isWatchMode = args.includes('--serve');
    const liveReloadRuntime = isWatchMode
      ? `
      const evs = new EventSource('/live-reload');
      evs.onmessage = (e) => {
        if (e.data === 'reload') {
          console.log('⚡ File change detected, reloading application...');
          window.location.reload();
        }
      };
    `
      : '';

    let globalDeclarationsRuntime = `\n// --- Axel Framework Global States ---\n`;
    allGlobalVariables.forEach((varName) => {
      globalDeclarationsRuntime += `
    Object.defineProperty(window, '${varName}', {
      get() { return window.axel_globalStore['${varName}']; },
      set(val) { 
        window.axel_globalStore['${varName}'] = val;
        if (typeof window.axel_triggerUpdate === 'function') window.axel_triggerUpdate();
      },
      configurable: true
    });
  `;
    });

    const clientRouterRuntime = `
${routerConfigJS}
${liveReloadRuntime}

function navigateSPA(path) {
  window.history.pushState({}, "", path);
  handleSPARouting();
}

function handleSPARouting() {
  const currentPath = window.location.pathname || "/";
  const renderTarget = document.getElementById("axel-app") || document.body;
  
  const viewFunction = routes[currentPath] || routes["/"];
  
  if (viewFunction) {
    renderTarget.innerHTML = "";
    const newPageElement = viewFunction();
    renderTarget.appendChild(newPageElement);
  }
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (link && link.getAttribute("href") && link.getAttribute("href").startsWith("/")) {
    e.preventDefault();
    navigateSPA(link.getAttribute("href"));
  }
});

window.addEventListener("popstate", handleSPARouting);
window.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("axel-app")) {
    const appWrapper = document.createElement("div");
    appWrapper.id = "axel-app";
    document.body.appendChild(appWrapper);
  }
  handleSPARouting();
});
    `;

    const rawBundleJS = `
${globalDeclarationsRuntime} 
${compiledSubComponents}
${clientRouterRuntime}
`;

    const minifiedJsResult = esbuild.transformSync(rawBundleJS, {
      minify: true,
      target: 'es2020',
    });

    const rawHtml = generateHTML(minifiedJsResult.code, pageTitle);
    const finalHtml = minifyHTMLStructure(rawHtml);

    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, finalHtml, 'utf-8');
    return outputFile;
  } catch (err: any) {
    console.error(
      '💥 Bundler Exception: Production compilation failed dramatically:',
      err.message,
    );
    return null;
  }
}
