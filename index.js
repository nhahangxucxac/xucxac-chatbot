// ============================================================
// CHATBOT XÚC XẮC — Facebook Messenger + Gemini AI + Telegram
// Phiên bản: 3.0 — Dùng Google Gemini 1.5 Flash (Free)
// ============================================================

const express = require('express');
const axios   = require('axios');
const app     = express();
app.use(express.json());

// ============================================================
// BIẾN MÔI TRƯỜNG
// Trên Render: đổi ANTHROPIC_API_KEY thành GEMINI_API_KEY
// ============================================================
const PAGE_ACCESS_TOKEN  = (process.env.PAGE_ACCESS_TOKEN  || '').trim();
const VERIFY_TOKEN       = (process.env.VERIFY_TOKEN       || '').trim();
const GEMINI_API_KEY     = (process.env.GEMINI_API_KEY     || '').trim();
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_GROUP_ID  = (process.env.TELEGRAM_GROUP_ID  || '').trim();

// ============================================================
// NÃO CỦA BOT — Chỉnh thông tin tại đây
// ============================================================
const SYSTEM_PROMPT = `
Bạn là trợ lý AI của nhà hàng Xúc Xắc, tên nhân vật là Lady of Dice.
Phong cách: thân thiện, chuyên nghiệp, tạo cảm giác vui vẻ muốn đến quán.
Luôn kết thúc tin nhắn bằng emoji 🎲

NGUYÊN TẮC NGÔN NGỮ:
- Khách nhắn tiếng Việt → trả lời tiếng Việt
- Khách nhắn tiếng Anh → trả lời tiếng Anh
- Khách nhắn tiếng Hàn → trả lời tiếng Hàn

---
THÔNG TIN NHÀ HÀNG:
- Tên: Nhà hàng Xúc Xắc — Giải trí Lắc Xí Ngầu
- Địa chỉ: 246 Trần Hưng Đạo, Phường An Hải, Đà Nẵng
- SĐT: 091 168 4343
- Giờ mở cửa: 17:00 – 00:00 (tất cả các ngày trong tuần)
- Slogan: "Nhậu có gu, gieo đúng chỗ."

---
MENU (các món chính):
- Đồ nhậu: thịt nướng, hải sản, gà nướng, mực nướng, bò lúc lắc, các món nhậu truyền thống
- Bia: bia lon, bia tươi các loại
- Nước uống: nước ngọt, nước ép, cocktail
- Nếu khách hỏi giá cụ thể, mời xem menu đầy đủ tại quán hoặc liên hệ 091 168 4343

---
CÁC CHƯƠNG TRÌNH ĐẶC BIỆT:
1. Lady Challenge Night: Lady of Dice mời khách chơi Liar Dice, thắng được tặng 3–5 lon bia
2. Birthday Dice: Khách sinh nhật lắc xúc xắc đặc biệt — free bia/bánh/decor bàn. Cần báo trước khi đặt bàn.
3. Happy Beer Hour (22h–24h): Mua 5 bia tặng 1 hoặc giảm % bill
4. Roll the Dice Challenge (TikTok): Quay video chơi xúc xắc, đăng #xucxacdanang #laclavui — nhiều view nhất tuần nhận voucher 200k hoặc tháp bia
5. Đấu tố giữa các bàn (20h–23h): Các bàn thách nhau chơi xúc xắc, thắng được tặng bia

---
THÔNG TIN TRÒ CHƠI XÚC XẮC:
- Mỗi bàn được phát bộ xúc xắc miễn phí khi đến quán
- Trò phổ biến nhất: Liar Dice (Bluff) — che xúc xắc, cược số lượng mặt, ai thua uống
- Lady of Dice sẽ đến bàn hướng dẫn luật chơi miễn phí
- Không có vé vào cửa, không phí chơi game

---
FAQ:
- Hỏi vé vào cửa: Xúc Xắc không thu phí vào cửa
- Hỏi parking/đỗ xe: Có bãi đỗ xe gần quán
- Hỏi private room: Hiện chưa có phòng riêng, không gian mở thoáng

---
QUAN TRỌNG:
- Nếu khách nhắc đến "đặt bàn", "book bàn", "reserve", "예약", hãy trả lời rồi thêm cụm ĐẶT_BÀN ở cuối.
- Không bịa thông tin không có trong hướng dẫn này. Nếu không biết, gợi ý gọi 091 168 4343.
`;

// ============================================================
// TRẠNG THÁI
// ============================================================
const bookingSession      = {};
const conversationHistory = {};
const takeoverSessions    = {};
const MAX_HISTORY         = 10;
const TAKEOVER_DURATION   = 30 * 60 * 1000;

// ============================================================
// WEBHOOK VERIFY
// ============================================================
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// NHẬN TIN NHẮN TỪ FACEBOOK
// ============================================================
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

      console.log(`📩 Tin nhắn từ ${senderId}: ${text}`);

      if (text.toLowerCase() === '/takeover') {
        takeoverSessions[senderId] = Date.now();
        delete bookingSession[senderId];
        console.log(`👤 Nhân viên takeover: ${senderId}`);
        continue;
      }

      if (text.toLowerCase() === '/release') {
        delete takeoverSessions[senderId];
        console.log(`🤖 Bot tiếp quản lại: ${senderId}`);
        await sendMessage(senderId, 'Xin chào! Mình là Lady of Dice 🎲 Mình có thể giúp gì cho bạn?');
        continue;
      }

      if (takeoverSessions[senderId]) {
        const elapsed = Date.now() - takeoverSessions[senderId];
        if (elapsed < TAKEOVER_DURATION) {
          console.log(`👤 Takeover mode, bỏ qua bot: ${senderId}`);
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

// ============================================================
// XỬ LÝ AI RESPONSE — GEMINI 1.5 FLASH
// ============================================================
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: conversationHistory[senderId],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7
        }
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

    if (botReply.includes('ĐẶT_BÀN')) {
      const cleanReply = botReply.replace('ĐẶT_BÀN', '').trim();
      await sendMessage(senderId, cleanReply);
      await startBookingFlow(senderId);
    } else {
      await sendMessage(senderId, botReply);
    }

  } catch (err) {
    console.error('❌ Lỗi AI:', err.response?.status, JSON.stringify(err.response?.data) || err.message);
    await sendMessage(senderId, 'Xin lỗi bạn, mình gặp sự cố kỹ thuật. Vui lòng thử lại hoặc gọi 091 168 4343 nhé! 🎲');
  }
}

// ============================================================
// FLOW ĐẶT BÀN
// ============================================================
async function startBookingFlow(senderId) {
  bookingSession[senderId] = { step: 'name' };
  await sendMessage(senderId, 'Để đặt bàn, cho mình hỏi vài thông tin nhé:\n\n👤 Tên của bạn là gì? 🎲');
}

async function handleBookingFlow(senderId, text) {
  const session = bookingSession[senderId];

  if (session.step === 'name') {
    session.name = text;
    session.step = 'guests';
    await sendMessage(senderId, `Chào ${text}! 🎲\n\n👥 Bàn cho mấy người ạ?`);

  } else if (session.step === 'guests') {
    session.guests = text;
    session.step   = 'time';
    await sendMessage(senderId, `👍 ${text} người — ghi nhận rồi!\n\n🕐 Dự kiến đến lúc mấy giờ ạ?`);

  } else if (session.step === 'time') {
    session.time = text;
    session.step = 'phone';
    await sendMessage(senderId, `⏰ ${text} — OK ạ!\n\n📱 Cho mình xin số điện thoại để team xác nhận nhé?`);

  } else if (session.step === 'phone') {
    session.phone = text;

    const confirmMsg =
      `✅ Đã nhận đặt bàn!\n\n` +
      `👤 Tên: ${session.name}\n` +
      `👥 Số người: ${session.guests}\n` +
      `🕐 Giờ đến: ${session.time}\n` +
      `📱 SĐT: ${session.phone}\n\n` +
      `Team Xúc Xắc sẽ xác nhận lại trong vòng 15 phút nhé!\n` +
      `Hẹn gặp bạn tối nay 🎲`;

    await sendMessage(senderId, confirmMsg);
    await notifyTelegram(session);
    delete bookingSession[senderId];
  }
}

// ============================================================
// GỬI THÔNG BÁO VÀO TELEGRAM GROUP
// ============================================================
async function notifyTelegram(booking) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_GROUP_ID) {
    console.log('⚠️ Chưa cấu hình Telegram');
    return;
  }

  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });

  const message =
    `🎲 ĐẶT BÀN MỚI — Xúc Xắc\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 Tên khách: ${booking.name}\n` +
    `👥 Số người: ${booking.guests}\n` +
    `🕐 Giờ đến: ${booking.time}\n` +
    `📱 SĐT: ${booking.phone}\n` +
    `📣 Nguồn: Facebook Messenger\n` +
    `⏱ Lúc: ${now}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👉 Gọi xác nhận lại cho khách!`;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_GROUP_ID, text: message }
    );
    console.log('✅ Đã gửi Telegram');
  } catch (err) {
    console.error('❌ Lỗi Telegram:', err.message);
  }
}

// ============================================================
// GỬI TIN NHẮN VỀ FACEBOOK
// ============================================================
async function sendMessage(recipientId, messageText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message:   { text: messageText }
      }
    );
  } catch (err) {
    console.error('❌ Lỗi gửi tin:', err.response?.data || err.message);
  }
}

// ============================================================
// KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎲 Xúc Xắc Chatbot (Gemini) đang chạy tại cổng ${PORT}`);
});
