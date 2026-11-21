import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const projectPath = '/talus-scree-mark/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export async function openServer(appPath) {
  const state = { appPath: resolve(appPath), fault: new Map(), requests: [], override: new Map() };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    state.requests.push({ method: request.method, url: request.url, bytes: request.headers['content-length'] });
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === projectPath.slice(0, -1)) {
      response.writeHead(308, { Location: projectPath });
      response.end();
      return;
    }
    if (url.pathname === '/' || url.pathname === '/sibling/') {
      response.writeHead(200, { 'Content-Type': mime['.html'] });
      response.end(`<!doctype html><title>Independent unrelated page</title><p>${url.pathname}</p>`);
      return;
    }
    if (!url.pathname.startsWith(projectPath)) {
      response.writeHead(404);
      response.end('Outside test project');
      return;
    }
    const relativePath = decodeURIComponent(url.pathname.slice(projectPath.length)) || 'index.html';
    const path = resolve(state.appPath, relativePath);
    if (!path.startsWith(`${state.appPath}${sep}`)) {
      response.writeHead(403);
      response.end('Outside test app');
      return;
    }
    const override = state.override.get(relativePath);
    const fault = state.fault.get(relativePath);
    try {
      if (fault?.wait) await new Promise((done) => setTimeout(done, fault.wait));
      if (fault?.redirect) {
        response.writeHead(302, { Location: fault.redirect });
        response.end();
        return;
      }
      if (fault?.status) {
        response.writeHead(fault.status);
        response.end('Independent injected fault');
        return;
      }
      const file = override ?? await readFile(path);
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
      response.end(file);
    } catch {
      response.writeHead(404);
      response.end('Missing');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  state.origin = `http://127.0.0.1:${server.address().port}`;
  state.close = async () => new Promise((done) => server.close(done));
  return state;
}
