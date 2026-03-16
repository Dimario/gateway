const express = require('express');
const { v4: uuidv4 } = require('uuid');
const redis = require('../redis');
const { BOT_USERNAME } = require('../config');

module.exports = (io) => {
  const router = express.Router();

  // POST /webhook/telegram — Telegram bot webhook
  router.post('/telegram', async (req, res) => {
    // Always respond 200 immediately so Telegram doesn't retry
    res.sendStatus(200);

    try {
      const update = req.body;
      const message = update?.message;

      if (!message?.text) return;

      // Check if bot is mentioned
      const isMentioned = isBotMentioned(message, BOT_USERNAME);
      if (!isMentioned) return;

      const task = {
        id: uuidv4(),
        type: 'telegram_message',
        content: update,
        files: [],
        provider: null,
        status: 'waiting',
        date: new Date().toISOString(),
      };

      await redis.saveTask(task);

      io.to('type:telegram_message').emit('task:new', task);

      console.log(`[webhook] telegram task created: ${task.id} | chat: ${message.chat.id} | from: ${message.from?.username ?? message.from?.first_name}`);
    } catch (err) {
      console.error('[webhook] telegram error:', err);
    }
  });

  return router;
};

/**
 * Check if the bot is mentioned in the message.
 * Uses entities for accurate detection (handles @username in text).
 */
function isBotMentioned(message, botUsername) {
  if (!botUsername) return true; // if not configured — pass all messages

  const entities = message.entities ?? [];
  const text = message.text ?? '';

  // Check via entities (most reliable)
  const hasMentionEntity = entities.some((entity) => {
    if (entity.type !== 'mention') return false;
    const mention = text.substring(entity.offset, entity.offset + entity.length);
    return mention.toLowerCase() === `@${botUsername.toLowerCase()}`;
  });

  return hasMentionEntity;
}
