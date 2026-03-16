const Redis = require('ioredis');
const { REDIS_URL } = require('./config');

const redis = new Redis(REDIS_URL, {
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('connect', () => console.log('[redis] connected'));
redis.on('error', (err) => console.error('[redis] error:', err.message));

// Lua script for atomic claim:
// Returns the updated task JSON if claimed successfully, or false otherwise.
const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw == false then return nil end
local task = cjson.decode(raw)
if task['status'] ~= 'waiting' then return false end
task['status'] = 'in_progress'
task['provider'] = ARGV[1]
task['date'] = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(task))
return cjson.encode(task)
`;

/**
 * Atomically claim a task.
 * @returns {object|null|false} updated task, null if not found, false if already claimed
 */
redis.claimTask = async (taskId, providerId) => {
  const result = await redis.eval(
    CLAIM_SCRIPT,
    1,
    `task:${taskId}`,
    providerId,
    new Date().toISOString()
  );

  if (result === null) return null;       // task not found
  if (result === 0 || result === false) return false; // already claimed
  return JSON.parse(result);
};

redis.getTask = async (taskId) => {
  const raw = await redis.get(`task:${taskId}`);
  return raw ? JSON.parse(raw) : null;
};

redis.saveTask = async (task) => {
  await redis.set(`task:${task.id}`, JSON.stringify(task));
  await redis.sadd(`tasks:type:${task.type}`, task.id);
};

redis.deleteTask = async (task) => {
  await redis.del(`task:${task.id}`);
  await redis.srem(`tasks:type:${task.type}`, task.id);
};

redis.deleteAllTasks = async () => {
  const taskKeys = await redis.keys('task:*');
  const typeKeys = await redis.keys('tasks:type:*');
  const allKeys = [...taskKeys, ...typeKeys];
  if (allKeys.length > 0) await redis.del(...allKeys);
  return allKeys.length;
};

redis.getWaitingTasksByType = async (type) => {
  const ids = await redis.smembers(`tasks:type:${type}`);
  const tasks = [];
  for (const id of ids) {
    const task = await redis.getTask(id);
    if (task && task.status === 'waiting') tasks.push(task);
  }
  return tasks;
};

module.exports = redis;
