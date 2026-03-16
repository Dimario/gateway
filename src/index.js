const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

const { PORT, UPLOAD_DIR } = require('./config');
const tasksRouter = require('./routes/tasks');
const filesRouter = require('./routes/files');
const setupSocket = require('./socket');

const swaggerDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, '..', 'swagger.yaml'), 'utf8')
);

// Ensure uploads directory exists
const uploadsPath = path.resolve(UPLOAD_DIR);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/tasks', tasksRouter(io));
app.use('/files', filesRouter);

setupSocket(io);

server.listen(PORT, () => {
  console.log(`[gateway] running on port ${PORT}`);
});
