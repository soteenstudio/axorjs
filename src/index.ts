#!/usr/bin/env
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';
import { parseHTML } from './parser';
import { compileToJS } from './compiler';
import { generateHTML } from './template';

const args = process.argv.slice(2);
const CONFIG_FILE_NAME = 'axel.config.json';
const PORT = 3000;

const clients: http.ServerResponse[] = [];

interface ClayConfig {
  entry?: string;
  routes?: Record<string, string>;
  output?: string;
  title?: string;
}

function minifyHTMLStructure(html: string): string {
  return html
    .replace(/>\s+</g, '><')
    .replace(/\s*[\r\n]\s*/g, '')
    .trim();
}

function extractScriptAndHTML(source: string): {
  scriptCode: string;
  htmlMarkup: string;
} {
  let jsEndIndex = 0;

  try {
    acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });

    return { scriptCode: source, htmlMarkup: '' };
  } catch (err: any) {
    if (err.pos !== undefined) {
      jsEndIndex = err.pos;
    } else {
      const firstTag = source.indexOf('<');
      jsEndIndex = firstTag !== -1 ? firstTag : 0;
    }
  }

  let scriptCode = source.substring(0, jsEndIndex);
  let htmlMarkup = source.substring(jsEndIndex).trim();

  scriptCode = scriptCode.trim();

  return { scriptCode, htmlMarkup };
}

function bundleFramework(): string | null {
  try {
    let outputFile = 'dist/index.html';
    let pageTitle = 'Clay Multi Component App';
    let configRoutes: Record<string, string> = {};
    let isSPA = false;

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
          const { scriptCode: subScript, htmlMarkup: subHtmlMarkup } =
            extractScriptAndHTML(subSource);
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
      const { scriptCode: pageScript, htmlMarkup: pageHtmlMarkup } =
        extractScriptAndHTML(cleanPageSource);

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

function startDevServer(targetOutputFile: string) {
  const server = http.createServer((req, res) => {
    if (req.url === '/live-reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('\n');
      clients.push(res);

      req.on('close', () => {
        const index = clients.indexOf(res);
        if (index !== -1) clients.splice(index, 1);
      });
      return;
    }

    if (fs.existsSync(targetOutputFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(targetOutputFile, 'utf-8'));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Output target file not found.');
    }
  });

  server.listen(PORT, () => {
    console.log(
      `\n🚀 Axel Dev Server is flying high at: http://localhost:${PORT}`,
    );
    console.log(`👀 Watching for file adjustments and codebase mutations...`);
  });

  let watchTimeout: NodeJS.Timeout;
  fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (
      filename.startsWith('dist') ||
      filename.startsWith('.') ||
      filename === CONFIG_FILE_NAME
    )
      return;

    if (filename.endsWith('.jsx') || filename.endsWith('.ts')) {
      clearTimeout(watchTimeout);
      watchTimeout = setTimeout(() => {
        console.log(
          `\n⚡ Mutation detected in "${filename}". Re-assembling workspace items...`,
        );
        const result = bundleFramework();
        if (result) {
          console.log(`✨ Re-bundle operation accomplished successfully.`);
          clients.forEach((client) => client.write('data: reload\n\n'));
        }
      }, 100);
    }
  });
}

const outputResult = bundleFramework();

if (outputResult) {
  if (args.includes('--serve')) {
    startDevServer(outputResult);
  } else {
    console.log(
      `\n✨ Build completed successfully! Production SPA bundle ready at: ${outputResult} 🎉`,
    );
  }
}
