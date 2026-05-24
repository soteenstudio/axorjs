#!/usr/bin/env
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';
import { parseHTML } from './cores/parser.js';
import { compileToJS } from './cores/compiler.js';
import { generateHTML } from './cores/template.js';
import { bundleFramework } from './cores/bundleFramework.js';
import { minifyHTMLStructure } from './utils/minifyHTMLStructure.js';
import { extractScriptAndHTML } from './utils/extractScriptAndHTML.js';

const args = process.argv.slice(2);
const CONFIG_FILE_NAME = 'axel.config.json';
const PORT = 3000;

const clients: http.ServerResponse[] = [];

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
        const result = bundleFramework(args, CONFIG_FILE_NAME);
        if (result) {
          console.log(`✨ Re-bundle operation accomplished successfully.`);
          clients.forEach((client) => client.write('data: reload\n\n'));
        }
      }, 100);
    }
  });
}

const outputResult = bundleFramework(args, CONFIG_FILE_NAME);

if (outputResult) {
  if (args.includes('--serve')) {
    startDevServer(outputResult);
  } else {
    console.log(
      `\n✨ Build completed successfully! Production SPA bundle ready at: ${outputResult} 🎉`,
    );
  }
}
