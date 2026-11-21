import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../app/', import.meta.url));
const mount = '/talus-scree-mark/';
const port = Number(process.env.SCREE_PORT ?? 4173);
const host = process.env.SCREE_HOST ?? '127.0.0.1';
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (pathname === mount.slice(0, -1)) {
    response.writeHead(308, { Location: mount }).end();
    return;
  }
  if (!pathname.startsWith(mount)) {
    response.writeHead(404).end('Outside the app.');
    return;
  }
  try {
    const path = resolve(root, decodeURIComponent(pathname.slice(mount.length)) || 'index.html');
    if (!path.startsWith(resolve(root) + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(path);
    response.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, host, () => console.log(`Talus Scree Mark available at http://${host}:${server.address().port}${mount}`));
