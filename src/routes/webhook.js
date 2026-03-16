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
      // In channels Telegram sends `channel_post` instead of `message`
      const message = update?.message ?? update?.channel_post;

      if (!message?.text) return;

      // Private chat — always respond
      const isPrivate = message.chat?.type === 'private';

      if (!isPrivate) {
        // Group/channel — mention OR keyword "пиздец"
        const isMentioned = isBotMentioned(message, BOT_USERNAME);
        const hasKeyword = message.text.toLowerCase().includes('пиздец');
        if (!isMentioned && !hasKeyword) return;
      }

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
function isBotMentioned(message, botUsername) {
  if (!botUsername) return true; // if not configured — pass all messages

  // In private chats check only the keyword, not the mention
  if (message.chat?.type === 'private') return true; // keyword checked separately

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
