import 'reflect-metadata';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  const app = await createApp();
  await app.listen(PORT);
  console.log(`FormMaker API listening on http://localhost:${PORT}`);

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`${signal} received, shutting down`);
    app.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
void start();
