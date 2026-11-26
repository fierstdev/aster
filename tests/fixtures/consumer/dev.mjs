import { createServer } from 'vite-plus';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
process.send(server.resolvedUrls.local[0]);
