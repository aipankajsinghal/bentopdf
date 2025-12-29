import http from 'http';
import fs from 'fs';
import path from 'path';

const port = process.env.PORT ? Number(process.env.PORT) : 5174;
const root = process.cwd();

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html';
    case '.js': return 'application/javascript';
    case '.css': return 'text/css';
    case '.json': return 'application/json';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.wasm': return 'application/wasm';
    default: return 'application/octet-stream';
  }
}

const server = http.createServer((req, res) => {
  try {
    let reqPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(root, reqPath.replace(/^\//, ''));
    if (!filePath.startsWith(root)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType(filePath));
      res.end(content);
      return;
    }
    // try index.html fallback
    const index = path.join(root, 'index.html');
    if (fs.existsSync(index)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(fs.readFileSync(index));
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}/`);
});
