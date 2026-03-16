const redis = require('../redis');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`[socket] provider connected: ${socket.id}`);

    /**
     * Subscribe to task types.
     * Client emits: { types: string[] }
     * Server responds with all currently waiting tasks for those types.
     */
    socket.on('subscribe', async ({ types } = {}) => {
      if (!Array.isArray(types) || types.length === 0) {
        return socket.emit('error', { message: 'types must be a non-empty array' });
      }

      for (const type of types) {
        socket.join(`type:${type}`);
      }

      console.log(`[socket] ${socket.id} subscribed to: ${types.join(', ')}`);

      // Send all waiting tasks for subscribed types
      for (const type of types) {
        const tasks = await redis.getWaitingTasksByType(type);
        for (const task of tasks) {
          socket.emit('task:new', task);
        }
      }
    });

    /**
     * Claim a task (atomic).
     * Client emits: { taskId: string }
     * Ack: { success: true, task } | { success: false, error: string }
     */
    socket.on('task:claim', async ({ taskId } = {}, ack) => {
      if (!taskId) return ack?.({ success: false, error: 'taskId is required' });

      const result = await redis.claimTask(taskId, socket.id);

      if (result === null) {
        return ack?.({ success: false, error: 'Task not found' });
      }
      if (result === false) {
        return ack?.({ success: false, error: 'Task already claimed' });
      }

      console.log(`[socket] ${socket.id} claimed task ${taskId}`);
      ack?.({ success: true, task: result });
    });

    /**
     * Mark task as complete — deletes it from the queue.
     * Client emits: { taskId: string }
     * Ack: { success: true } | { success: false, error: string }
     */
    socket.on('task:complete', async ({ taskId } = {}, ack) => {
      if (!taskId) return ack?.({ success: false, error: 'taskId is required' });

      const task = await redis.getTask(taskId);
      if (!task) return ack?.({ success: false, error: 'Task not found' });
      if (task.provider !== socket.id) {
        return ack?.({ success: false, error: 'Not your task' });
      }

      await redis.deleteTask(task);
      console.log(`[socket] task ${taskId} completed by ${socket.id}`);
      ack?.({ success: true });
    });

    /**
     * Mark task as failed.
     * Client emits: { taskId: string, reason?: string }
     * Ack: { success: true } | { success: false, error: string }
     */
    socket.on('task:fail', async ({ taskId, reason } = {}, ack) => {
      if (!taskId) return ack?.({ success: false, error: 'taskId is required' });

      const task = await redis.getTask(taskId);
      if (!task) return ack?.({ success: false, error: 'Task not found' });
      if (task.provider !== socket.id) {
        return ack?.({ success: false, error: 'Not your task' });
      }

      task.status = 'failed';
      task.date = new Date().toISOString();
      if (reason) task.error = reason;

      await redis.set(`task:${taskId}`, JSON.stringify(task));
      console.log(`[socket] task ${taskId} failed: ${reason ?? 'no reason'}`);
      ack?.({ success: true });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] provider disconnected: ${socket.id}`);
    });
  });
};
