const express = require('express');
const { v4: uuidv4 } = require('uuid');
const redis = require('../redis');
const { BOT_USERNAME } = require('../config');

const TRIGGER_WORDS = [
  'пиздец',
  'ларл', 
  'larl', 
  'lari', 
  'денис', 
  'денчик',  
];

module.exports = (io) => {
  const router = express.Router();

  // POST /webhook/telegram — Telegram bot webhook
  router.post('/telegram', async (req, res) => {
    // Always respond 200 immediately so Telegram doesn't retry
    res.sendStatus(200);

    try {
      const update = req.body;
      // In channels Telegram sends `channel_post` instead of `message`
      const message = update?.message ?? update?.channel_post;

      if (!message?.text) return;

      const mentioned = isBotMentioned(message, BOT_USERNAME);
      const triggered = hasTriggerWord(message.text, TRIGGER_WORDS);

      if (!mentioned && !triggered) return;

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

      const from = message.from?.username ?? message.from?.first_name ?? 'channel';
      console.log(`[webhook] telegram task created: ${task.id} | chat: ${message.chat.id} | from: ${from}`);
    } catch (err) {
      console.error('[webhook] telegram error:', err);
    }
  });

  return router;
};

/**
 * Check if the bot is mentioned in the message.
 * - Private chat: always pass (no @mention needed)
 * - Group/supergroup: must have @mention entity
 */
function hasTriggerWord(text, words) {
  if (!words.length) return false;
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function isBotMentioned(message, botUsername) {
  if (!botUsername) return true;

  const entities = message.entities ?? [];
  const text = message.text ?? '';

  return entities.some((entity) => {
    if (entity.type !== 'mention') return false;
    const mention = text.substring(entity.offset, entity.offset + entity.length);
    return mention.toLowerCase() === `@${botUsername.toLowerCase()}`;
  });
}
