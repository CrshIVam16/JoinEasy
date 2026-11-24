import 'dotenv/config';
import app from './app.js';

const port = Number.parseInt(process.env.PORT || '5000', 10);
const server = app.listen(port, () => {
  console.log(`Joineazy API listening on port ${port}`);
});

server.on('error', (error) => {
  console.error('Unable to start the API server:', error);
  process.exitCode = 1;
});

function shutdown(signal) {
  console.log(`${signal} received; closing the API server`);
  server.close((error) => {
    if (error) {
      console.error('Error while closing the API server:', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
