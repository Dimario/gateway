const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const redis = require('../redis');
const { UPLOAD_DIR } = require('../config');

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({ storage });

module.exports = (io) => {
  const router = express.Router();

  // POST /tasks - create a new task
  router.post('/', upload.array('files'), async (req, res) => {
    try {
      const { type, content } = req.body;

      if (!type) {
        return res.status(400).json({ error: 'type is required' });
      }

      let parsedContent = content ?? null;
      if (typeof content === 'string') {
        try {
          parsedContent = JSON.parse(content);
        } catch {
          // keep as plain string
        }
      }

      const files = (req.files ?? []).map((f) => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      }));

      const task = {
        id: uuidv4(),
        type,
        content: parsedContent,
        files,
        provider: null,
        status: 'waiting',
        date: new Date().toISOString(),
      };

      await redis.saveTask(task);

      // Notify providers subscribed to this type
      io.to(`type:${type}`).emit('task:new', task);

      res.status(201).json(task);
    } catch (err) {
      console.error('[tasks] POST error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /tasks - list all tasks (admin/debug)
  router.get('/', async (req, res) => {
    try {
      const keys = await redis.keys('task:*');
      const tasks = [];
      for (const key of keys) {
        const raw = await redis.get(key);
        if (raw) tasks.push(JSON.parse(raw));
      }
      tasks.sort((a, b) => new Date(b.date) - new Date(a.date));
      res.json(tasks);
    } catch (err) {
      console.error('[tasks] GET error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /tasks - delete all tasks
  router.delete('/', async (req, res) => {
    try {
      const deleted = await redis.deleteAllTasks();
      console.log(`[tasks] DELETE all: removed ${deleted} keys`);
      res.json({ deleted });
    } catch (err) {
      console.error('[tasks] DELETE error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /tasks/:id - get single task
  router.get('/:id', async (req, res) => {
    try {
      const task = await redis.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      console.error('[tasks] GET/:id error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
