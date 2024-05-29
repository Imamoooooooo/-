const { Telegraf } = require('telegraf');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/lib/file-sync');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'db.json');

const adapter = new JSONFile(file);
const db = new Low(adapter);

db.read(); // Не забываем прочитать файл, иначе данные не будут загружены в память
if (!fs.existsSync(file)) {
  db.data = { users: {}, events: { active: false, multiplier: 1 } };
  db.write();
}

const getUser = (userId) => {
  if (!db.data.users[userId]) {
    db.data.users[userId] = { diamonds: 0, lastBonus: 0, messageCount: 0, dailyMessageCount: 0, lastMessageDate: null, prefixes: [] };
  }
  return db.data.users[userId];
};

bot.on('new_chat_members', (ctx) => {
  const newMember = ctx.message.new_chat_members[0];
  const welcomeMessage = `Добро пожаловать в чат Imzmo, ${newMember.username}.\n\nПожалуйста, ознакомьтесь с нашими правилами. Помните, что незнание правил не освобождает вас от ответственности. Давайте поддерживать порядок вместе!\n\n[Магазин](https://t.me/ImzmoShopbot) | [Правила](https://t.me/ImzmoMlbb/1709)`;

  ctx.replyWithPhoto(
    { source: fs.createReadStream('shapka.png') },
    { caption: welcomeMessage, parse_mode: 'Markdown' }
  );

  ctx.deleteMessage(ctx.message.message_id);
});


// Награждение за активность и подсчет сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.message.from.id;
  const user = getUser(userId);
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // Текущая дата в формате YYYY-MM-DD

  if (user.lastMessageDate !== today) {
    user.dailyMessageCount = 0;
    user.lastMessageDate = today;
  }

  user.messageCount += 1;
  user.dailyMessageCount += 1;

  const eventMultiplier = db.data.events.active ? db.data.events.multiplier : 1;

  // Награда за каждые 1000 сообщений
  if (user.messageCount % 1000 === 0) {
    user.diamonds += 10 * eventMultiplier;
  }

  // Бонус за 5000 сообщений в сутки
  if (user.dailyMessageCount === 5000) {
    user.diamonds += 30 * eventMultiplier;
  }

  await saveDb();
});

// Команда для проверки баланса
bot.command('balance', (ctx) => {
  const userId = ctx.message.from.id;
  const user = getUser(userId);
  ctx.reply(`У вас ${user.diamonds} алмазов.`);
});

// Команда для передачи алмазов другому пользователю
bot.command('transfer', async (ctx) => {
  const [command, targetUsername, amount] = ctx.message.text.split(' ');

  if (!targetUsername || !amount || isNaN(amount)) {
    ctx.reply('Использование: /transfer <имя_пользователя> <количество>');
    return;
  }

  const targetUser = ctx.message.entities.find(entity => entity.type === 'mention' && entity.user.username === targetUsername);
  if (!targetUser) {
    ctx.reply('Пользователь не найден.');
    return;
  }

  const userId = ctx.message.from.id;
  const user = getUser(userId);
  const targetUserId = targetUser.user.id;
  const targetUserData = getUser(targetUserId);

  const amountNumber = parseInt(amount, 10);
  if (user.diamonds < amountNumber) {
    ctx.reply('У вас недостаточно алмазов.');
    return;
  }

  user.diamonds -= amountNumber;
  targetUserData.diamonds += amountNumber;

  await saveDb();
  ctx.reply(`Вы успешно передали ${amountNumber} алмазов пользователю ${targetUsername}.`);
});

// Команда для получения ежедневного бонуса
bot.command('dailybonus', async (ctx) => {
  const userId = ctx.message.from.id;
  const user = getUser(userId);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (now - user.lastBonus >= oneDay) {
    user.diamonds += 10; // Ежедневный бонус
    user.lastBonus = now;
    await saveDb();
    ctx.reply('Вы получили ежедневный бонус в размере 10 алмазов!');
  } else {
    ctx.reply('Вы уже получили ежедневный бонус. Приходите завтра!');
  }
});

// Команда для запуска и остановки ивента
bot.command('event', (ctx) => {
  const [command, action, multiplier] = ctx.message.text.split(' ');

  if (action === 'start' && !isNaN(multiplier)) {
    db.data.events.active = true;
    db.data.events.multiplier = parseFloat(multiplier);
    saveDb();
    ctx.reply(`Ивент начался! Все награды умножены на ${multiplier}.`);
  } else if (action === 'stop') {
    db.data.events.active = false;
    db.data.events.multiplier = 1;
    saveDb();
    ctx.reply('Ивент завершен.');
  } else {
    ctx.reply('Использование: /event <start|stop> [множитель]');
  }
});

// Команда для просмотра топа пользователей по количеству алмазов
bot.command('top', (ctx) => {
  const topUsers = Object.entries(db.data.users)
    .sort(([, a], [, b]) => b.diamonds - a.diamonds)
    .slice(0, 10)
    .map(([id, user], index) => `${index + 1}. ${user.username || 'User'}: ${user.diamonds} алмазов`)
    .join('\n');

  ctx.reply(`Топ пользователей по количеству алмазов:\n\n${topUsers}`);
});

// Команда для покупки виртуальных предметов
bot.command('shop', (ctx) => {
  const shopMessage = `
Добро пожаловать в магазин!

1. Префикс на неделю - 30 алмазов
2. Префикс на месяц - 80 алмазов

Используйте /buy <номер_товара> для покупки.
  `;
  ctx.reply(shopMessage);
});

// Обработка покупки
bot.command('buy', async (ctx) => {
  const [command, itemNumber] = ctx.message.text.split(' ');

  if (!itemNumber || isNaN(itemNumber)) {
    ctx.reply('Использование: /buy <номер_товара>');
    return;
  }

  const userId = ctx.message.from.id;
  const user = getUser(userId);
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;

  let responseMessage = 'Неверный номер товара.';

  switch (parseInt(itemNumber, 10)) {
    case 1:
      if (user.diamonds >= 10) {
        user.diamonds -= 10;
        responseMessage = 'Вы успешно купили виртуальную наклейку!';
      } else {
        responseMessage = 'У вас недостаточно алмазов для покупки виртуальной наклейки.';
      }
      break;
    case 2:
      if (user.diamonds >= 100) {
        user.diamonds -= 100;
        responseMessage = 'Вы успешно купили виртуальную роль!';
      } else {
        responseMessage = 'У вас недостаточно алмазов для покупки виртуальной роли.';
      }
      break;
    case 3:
      if (user.diamonds >= 50) {
        user.diamonds -= 50;
        user.prefixes.push({ prefix: 'Префикс на неделю', expires: now + oneWeek });
        responseMessage = 'Вы успешно купили префикс на неделю!';
      } else {
        responseMessage = 'У вас недостаточно алмазов для покупки префикса на неделю.';
      }
      break;
    case 4:
      if (user.diamonds >= 200) {
        user.diamonds -= 200;
        user.prefixes.push({ prefix: 'Префикс на месяц', expires: now + oneMonth });
        responseMessage = 'Вы успешно купили префикс на месяц!';
      } else {
        responseMessage = 'У вас недостаточно алмазов для покупки префикса на месяц.';
      }
      break;
  }

  await saveDb();
  ctx.reply(responseMessage);
});

// Запуск бота
bot.launch();

console.log('Bot is running...');
