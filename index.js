const express = require('express');
const axios   = require('axios');
const app     = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN  = (process.env.PAGE_ACCESS_TOKEN  || '').trim();
const VERIFY_TOKEN       = (process.env.VERIFY_TOKEN       || '').trim();
const GEMINI_API_KEY     = (process.env.GEMINI_API_KEY     || '').trim();
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_GROUP_ID  = (process.env.TELEGRAM_GROUP_ID  || '').trim();

const SYSTEM_PROMPT = `
Bạn là trợ lý AI của nhà hàng Xúc Xắc, tên nhân vật là Lady of Dice.
Phong cách: thân thiện, chuyên nghiệp, tạo cảm giác vui vẻ muốn đến quán.
Luôn kết thúc tin nhắn bằng emoji 🎲

NGUYÊN TẮC NGÔN NGỮ:
- Khách nhắn tiếng Việt thì trả lời tiếng Việt
- Khách nhắn tiếng Anh thì trả lời tiếng Anh
- Khách nhắn tiếng Hàn thì trả lời tiếng Hàn

THÔNG TIN NHÀ HÀNG:
- Tên: Nhà hàng Xúc Xắc - Giải trí Lắc Xí Ngầu
- Địa chỉ: 246 Trần Hưng Đạo, Phường An Hải, Đà Nẵng
- SĐT: 091 168 4343
- Giờ mở cửa: 17:00 - 00:00 tất cả các ngày trong tuần
- Slogan: Nhậu có gu, gieo đúng chỗ.

MENU:
- Đồ nhậu: thịt nướng, hải sản, gà nướng, mực nướng, bò lúc lắc, các món nhậu truyền thống
- Bia: bia lon, bia tươi các loại
- Nước uống: nước ngọt, nước ép, cocktail
- Nếu khách hỏi giá cụ thể, mời xem menu đầy đủ tại quán hoặc liên hệ 091 168 4343

CÁC CHƯƠNG TRÌNH ĐẶC BIỆT:
1. Lady Challenge Night: Lady of Dice mời khách chơi Liar Dice, thắng được tặng 3-5 lon bia
2. Birthday Dice: Khách sinh nhật lắc xúc xắc đặc biệt, free bia bánh decor bàn. Cần báo trước khi đặt bàn.
3. Happy Beer Hour 22h-24h: Mua 5 bia tặng 1 hoặc giảm phần trăm bill
4. Roll the Dice Challenge TikTok: Quay video chơi xúc xắc, đăng hashtag xucxacdanang laclavui, nhiều view nhất tuần nhận voucher 200k hoặc tháp bia
5. Đấu tố giữa các bàn 20h-23h: Các bàn thách nhau chơi xúc xắc, thắng được tặng bia

THÔNG TIN TRÒ CHƠI:
- Mỗi bàn được phát bộ xúc xắc miễn phí khi đến quán
- Trò phổ biến nhất: Liar Dice Bluff, che xúc xắc, cược số lượng mặt, ai thua uống
- Lady of Dice sẽ đến bàn hướng dẫn luật chơi miễn phí
- Không có vé vào cửa, không phí chơi game

FAQ:
- Hỏi vé vào cửa: Xúc Xắc không thu phí vào cửa
- Hỏi parking đỗ xe: Có bãi đỗ xe gần quán
- Hỏi private room phòng riêng: Hiện chưa có phòng riêng, không gian mở thoáng

QUAN TRỌNG:
- Nếu khách nhắc đến đặt bàn, book bàn, reserve hoặc tiếng Hàn thì trả lời rồi thêm cụm ĐẶT_BÀN ở cuối tin nhắn.
- Không bịa thông tin không có trong hướng dẫn này. Nếu không biết thì gợi ý gọi 091 168 4343.
`;

const bookingSession      = {};
const conversationHistory = {};
const takeoverSessions    = {};
const processedMsgIds     = new Set();
const MAX_HISTORY         = 10;
const TAKEOVER_DURATION   = 30 * 60 * 1000;
const MSG_EXPIRE_MS       = 30 * 1000;

app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'page') return;

  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      if (!event.message || event.message.is_echo) continue;

      const senderId = event.sender.id;
      const text     = (event.message.text || '').trim();
      if (!text) continue;

      const msgId   = event.message.mid;
      const msgTime = event.timestamp;

      if (processedMsgIds.has(msgId)) {
        console.log('Bỏ qua tin trùng ID: ' + msgId);
        continue;
      }

      if (Date.now() - msgTime > MSG_EXPIRE_MS) {
        console.log('Bỏ qua tin cũ: ' + text);
        continue;
      }

      processedMsgIds.add(msgId);
      if (processedMsgIds.size > 1000) {
        const first = processedMsgIds.values().next().value;
        processedMsgIds.delete(first);
      }

      console.log('Tin nhắn từ ' + senderId + ': ' + text);

      if (text.toLowerCase() === '/takeover') {
        takeoverSessions[senderId] = Date.now();
        delete bookingSession[senderId];
        console.log('Nhân viên takeover: ' + senderId);
        continue;
      }

      if (text.toLowerCase() === '/release') {
        delete takeoverSessions[senderId];
        console.log('Bot tiếp quản lại: ' + senderId);
        await sendMessage(senderId, 'Xin chào! Mình là Lady of Dice. Mình có thể giúp gì cho bạn?');
        continue;
      }

      if (takeoverSessions[senderId]) {
        const elapsed = Date.now() - takeoverSessions[senderId];
        if (elapsed < TAKEOVER_DURATION) {
          console.log('Takeover mode, bỏ qua bot: ' + senderId);
          continue;
        } else {
          delete takeoverSessions[senderId];
        }
      }

      if (bookingSession[senderId]) {
        await handleBookingFlow(senderId, text);
      } else {
        await handleAIResponse(senderId, text);
      }
    }
  }
});

async function handleAIResponse(senderId, userMessage) {
  try {
    if (!conversationHistory[senderId]) {
      conversationHistory[senderId] = [];
    }

    conversationHistory[senderId].push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    if (conversationHistory[senderId].length > MAX_HISTORY) {
      conversationHistory[senderId] = conversationHistory[senderId].slice(-MAX_HISTORY);
    }

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: conversationHistory[senderId],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000
      }
    );

    const botReply = response.data.candidates[0].content.parts[0].text;

    conversationHistory[senderId].push({
      role: 'model',
      parts: [{ text: botReply }]
    });

    if (botReply.includes('DAT_BAN') || botReply.includes('ĐẶT_BÀN')) {
      const cleanReply = botReply.replace('ĐẶT_BÀN', '').replace('DAT_BAN', '').trim();
      await sendMessage(senderId, cleanReply);
      await startBookingFlow(senderId);
    } else {
      await sendMessage(senderId, botReply);
    }

  } catch (err) {
    console.error('Lỗi AI: ' + err.response?.status + ' ' + JSON.stringify(err.response?.data || err.message));
    await sendMessage(senderId, 'Xin lỗi bạn, mình gặp sự cố kỹ thuật. Vui lòng thử lại hoặc gọi 091 168 4343 nhe!');
  }
}

async function startBookingFlow(senderId) {
  bookingSession[senderId] = { step: 'name' };
  await sendMessage(senderId, 'De dat ban, cho minh hoi vai thong tin nhe:\n\nTen cua ban la gi?');
}

async function handleBookingFlow(senderId, text) {
  const session = bookingSession[senderId];

  if (session.step === 'name') {
    session.name = text;
    session.step = 'guests';
    await sendMessage(senderId, 'Chao ' + text + '!\n\nBan cho may nguoi a?');

  } else if (session.step === 'guests') {
    session.guests = text;
    session.step   = 'time';
    await sendMessage(senderId, text + ' nguoi, ghi nhan roi!\n\nDu kien den luc may gio a?');

  } else if (session.step === 'time') {
    session.time = text;
    session.step = 'phone';
    await sendMessage(senderId, text + ' OK a!\n\nCho minh xin so dien thoai de team xac nhan nhe?');

  } else if (session.step === 'phone') {
    session.phone = text;

    const confirmMsg =
      'Da nhan dat ban!\n\n' +
      'Ten: ' + session.name + '\n' +
      'So nguoi: ' + session.guests + '\n' +
      'Gio den: ' + session.time + '\n' +
      'SDT: ' + session.phone + '\n\n' +
      'Team Xuc Xac se xac nhan lai trong vong 15 phut nhe!\n' +
      'Hen gap ban toi nay!';

    await sendMessage(senderId, confirmMsg);
    await notifyTelegram(session);
    delete bookingSession[senderId];
  }
}

async function notifyTelegram(booking) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_GROUP_ID) return;

  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });

  const message =
    'DAT BAN MOI - Xuc Xac\n' +
    '==================\n' +
    'Ten khach: ' + booking.name + '\n' +
    'So nguoi: ' + booking.guests + '\n' +
    'Gio den: ' + booking.time + '\n' +
    'SDT: ' + booking.phone + '\n' +
    'Nguon: Facebook Messenger\n' +
    'Luc: ' + now + '\n' +
    '==================\n' +
    'Goi xac nhan lai cho khach!';

  try {
    await axios.post(
      'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
      { chat_id: TELEGRAM_GROUP_ID, text: message }
    );
    console.log('Da gui Telegram');
  } catch (err) {
    console.error('Loi Telegram: ' + err.message);
  }
}

async function sendMessage(recipientId, messageText) {
  try {
    await axios.post(
      'https://graph.facebook.com/v21.0/me/messages?access_token=' + PAGE_ACCESS_TOKEN,
      {
        recipient: { id: recipientId },
        message:   { text: messageText }
      }
    );
  } catch (err) {
    console.error('Loi gui tin: ' + JSON.stringify(err.response?.data || err.message));
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Xuc Xac Chatbot v5.0 dang chay tai cong ' + PORT);
});
