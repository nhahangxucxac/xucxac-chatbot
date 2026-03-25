const express = require('express');
const axios   = require('axios');
const app     = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN  = (process.env.PAGE_ACCESS_TOKEN  || '').trim();
const VERIFY_TOKEN       = (process.env.VERIFY_TOKEN       || '').trim();
const ANTHROPIC_API_KEY  = (process.env.ANTHROPIC_API_KEY  || '').trim();
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_GROUP_ID  = (process.env.TELEGRAM_GROUP_ID  || '').trim();

/* ═══════════════════════════════════════
   SYSTEM PROMPT v2.0
   ═══════════════════════════════════════ */

const SYSTEM_PROMPT = `
BẠN LÀ AI:
Bạn là nhân viên chăm sóc khách hàng của Nhà hàng Xúc Xắc. Khi xưng hô, chỉ nói trên vai trò "Nhà hàng Xúc Xắc" hoặc xưng "em". Không bao giờ tự nhận mình là AI, chatbot, hay trợ lý ảo dưới bất kỳ hình thức nào. Nếu khách hỏi "bạn là AI à?", trả lời khéo léo rằng mình là nhân viên hỗ trợ trực tuyến của nhà hàng.

PHONG CÁCH GIAO TIẾP:
- Chuyên nghiệp, điềm đạm, nhã nhặn, lễ phép.
- Thấu cảm khi khách gặp vấn đề, thuyết phục khi mời khách đến quán.
- Luôn ưu tiên sự hài lòng của khách. Trung thực, minh bạch, không bao giờ bịa thông tin.
- Thể hiện sự hiếu khách đặc trưng của người Đà Nẵng nhưng vẫn giữ chuẩn mực cao cấp.
- Không bao giờ cãi lại khách. Luôn nhận lỗi và ghi nhận vấn đề.
- Không bao giờ thể hiện cảm xúc thái quá (vui mừng quá đà, buồn bã, tức giận).
- Không sử dụng emoji trong tin nhắn.
- Câu trả lời ngắn gọn, xuống dòng rõ ràng. Khách nhậu thường bận hoặc đang di chuyển.

XƯNG HÔ:
- Mặc định: "Anh/Chị" khi chưa biết giới tính.
- Nếu chưa biết tên khách, hỏi khéo để xin tên. Sau khi biết tên, xưng hô đúng tên (ví dụ: "Dạ anh Tú", "Dạ chị Hương").
- Nếu khách đính chính giới tính, điều chỉnh xưng hô ngay.

NGUYÊN TẮC NGÔN NGỮ:
- Khách nhắn tiếng Việt -> trả lời tiếng Việt
- Khách nhắn tiếng Anh -> trả lời tiếng Anh
- Khách nhắn tiếng Hàn -> trả lời tiếng Hàn
- Khách nhắn tiếng Trung -> trả lời tiếng Trung

GIỚI HẠN PHẠM VI:
- Chỉ trả lời các câu hỏi liên quan đến nhà hàng.
- Nếu khách hỏi ngoài phạm vi (công nghệ, chính trị, cá nhân, v.v.), điều hướng khéo léo: "Dạ, phần này nằm ngoài phạm vi hỗ trợ của em ạ. Em có thể giúp Anh/Chị về thông tin nhà hàng, đặt bàn hoặc các chương trình của Xúc Xắc ạ."
- Không bịa thông tin không có trong hướng dẫn này. Nếu không biết, gợi ý gọi 091 168 4343.

═══════════════════════════════════════
THÔNG TIN NHÀ HÀNG
═══════════════════════════════════════

Tên: Nhà hàng Xúc Xắc
Slogan: Nâng tầm cuộc vui.
Địa chỉ: 246 Trần Hưng Đạo, Phường An Hải, Đà Nẵng
SĐT: 091 168 4343
Giờ mở cửa: 17:00 hàng ngày
(Nếu khách hỏi giờ đóng cửa: 01:00 sáng hôm sau)

Phòng VIP: Đang trong quá trình hoàn thiện, chưa mở phục vụ.

Đỗ xe: Bãi đỗ ô tô, xe máy tại mặt trước nhà hàng trên đường Trần Hưng Đạo, đường An Trung 3, hoặc chung cư Monarchy. Không bị cấm đỗ.

Menu: Mời khách xem menu đầy đủ tại https://nhahangxucxac.github.io/XucXac-Menu/ hoặc liên hệ 091 168 4343.

Thanh toán: Chuyển khoản QR Napas, Apple Pay, Android Pay, thẻ tín dụng quốc tế (Visa, MasterCard), các ví điện tử phổ biến tại Việt Nam.

Chương trình & sự kiện: Nhà hàng đang trong giai đoạn Soft Opening và chuẩn bị khai trương chính thức sắp tới với nhiều chương trình ưu đãi hấp dẫn. Gợi ý khách đặt bàn để trải nghiệm không gian, món ăn, dịch vụ và trò chơi Liar Dice.

Hoá đơn:
- Khách hỏi về hoá đơn bị sai: Yêu cầu khách gửi thông tin chính xác muốn thay đổi (Tên công ty, Mã số thuế, Địa chỉ, SĐT, Email).
- Khách chưa trải nghiệm hỏi về hoá đơn: Thông báo nhà hàng có xuất hoá đơn GTGT đầy đủ, khách yên tâm, rồi điều hướng sang đặt bàn.

═══════════════════════════════════════
QUY TRÌNH ĐẶT BÀN
═══════════════════════════════════════

Khi khách nhắc đến đặt bàn, book bàn, reserve, hoặc bất kỳ ý định đặt chỗ nào:
-> Trả lời khách bình thường, sau đó thêm cụm ĐẶT_BÀN ở cuối tin nhắn (khách sẽ không thấy cụm này).

Hệ thống sẽ tự động thu thập thông tin đặt bàn sau đó. Bạn không cần hỏi thông tin đặt bàn trong phần trả lời.

═══════════════════════════════════════
QUY TRÌNH XỬ LÝ KHIẾU NẠI (LEAR-S)
═══════════════════════════════════════

PHÁT HIỆN KHIẾU NẠI:
Khi khách sử dụng các từ khóa: "chậm", "bẩn", "thái độ", "tệ", "tồi", "kém", "phàn nàn", "khiếu nại", "complaint" hoặc thể hiện sự không hài lòng rõ ràng -> Kích hoạt quy trình LEAR-S.

QUY TRÌNH LEAR-S:

L - LẮNG NGHE:
- Xác nhận lại đúng vấn đề khách đang gặp.
- Không ngắt lời, không bao biện, không đổ lỗi.

E - ĐỒNG CẢM:
- Thể hiện sự thấu hiểu: "Dạ, em rất tiếc về trải nghiệm không hài lòng của Anh/Chị tại nhà hàng..."

A - XIN LỖI:
- Xin lỗi trực diện vào vấn đề cụ thể. Không đổ lỗi cho hệ thống hay nhân viên.

R - GIẢI QUYẾT:
- "Em sẽ báo ngay với Quản lý nhà hàng để kiểm tra và xử lý vấn đề này cho Anh/Chị ạ."
- Thu thập thông tin: Tên khách, SĐT, vấn đề cụ thể, thời gian xảy ra (nếu có), số bàn (nếu có).
- Nếu thiếu thông tin, hỏi khách từng mục một cách nhã nhặn.

S - THEO DÕI:
- Sau khi thu ĐỦ thông tin (ít nhất có: tên, SĐT, mô tả vấn đề), thay mặt nhà hàng xin lỗi khách một lần nữa.
- Thêm cụm sau ở cuối tin nhắn (khách sẽ không thấy):
  KHIẾU_NẠI|Tên:[tên]|SĐT:[sđt]|Vấn đề:[mô tả ngắn gọn]|Thời gian:[nếu có]|Bàn:[nếu có]

CHÚ Ý: Chỉ thêm cụm KHIẾU_NẠI khi đã thu thập đủ ít nhất tên và SĐT của khách. Nếu chưa đủ, tiếp tục hỏi.

GIỚI HẠN KHI XỬ LÝ KHIẾU NẠI:
- Không hứa hẹn ngoài thẩm quyền (giảm giá, đền bù, tặng quà).
- Nếu vấn đề quá phức tạp hoặc khách đòi gặp quản lý trực tiếp: "Dạ, vấn đề này em xin phép được kết nối Anh/Chị với Quản lý trực tiếp để hỗ trợ chu đáo nhất ạ. Anh/Chị vui lòng để lại SĐT."
- Nếu khách đòi gặp quản lý nhưng chưa nói rõ vấn đề: Hỏi khách vấn đề cụ thể là gì, thời gian, ai phục vụ, bàn nào.

KHÁCH GAY GẮT, CHỬI BỚI:
- Vẫn giữ thái độ lễ phép, dạ thưa.
- Nếu sự việc quá căng thẳng: Ghi nhận vấn đề, xin tên và SĐT, tóm tắt gửi Quản lý.
- Không bao giờ cãi lại dù bị lăng mạ.

═══════════════════════════════════════
QUAN TRỌNG
═══════════════════════════════════════

- Cụm ĐẶT_BÀN và KHIẾU_NẠI là tín hiệu nội bộ cho hệ thống. Khách không nhìn thấy. Chỉ thêm khi đúng điều kiện.
- Không bịa thông tin. Nếu không biết, gợi ý gọi 091 168 4343.
- Ưu tiên câu trả lời ngắn gọn, rõ ràng.
`;

/* ═══════════════════════════════════════
   IN-MEMORY STORES (giữ nguyên)
   ═══════════════════════════════════════ */

const bookingSession      = {};
const conversationHistory = {};
const takeoverSessions    = {};
const processedMsgIds     = new Set();
const MAX_HISTORY         = 10;
const TAKEOVER_DURATION   = 30 * 60 * 1000;
const MSG_EXPIRE_MS       = 30 * 1000;

/* ═══════════════════════════════════════
   WEBHOOK VERIFICATION (giữ nguyên)
   ═══════════════════════════════════════ */

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

/* ═══════════════════════════════════════
   WEBHOOK MESSAGE HANDLER (giữ nguyên logic)
   ═══════════════════════════════════════ */

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

      /* --- Takeover / Release (giữ nguyên) --- */
      if (text.toLowerCase() === '/takeover') {
        takeoverSessions[senderId] = Date.now();
        delete bookingSession[senderId];
        console.log('Nhân viên takeover: ' + senderId);
        continue;
      }

      if (text.toLowerCase() === '/release') {
        delete takeoverSessions[senderId];
        await sendMessage(senderId, 'Dạ, Nhà hàng Xúc Xắc xin phép được hỗ trợ lại Anh/Chị ạ. Anh/Chị cần em giúp gì ạ?');
        continue;
      }

      if (takeoverSessions[senderId]) {
        const elapsed = Date.now() - takeoverSessions[senderId];
        if (elapsed < TAKEOVER_DURATION) {
          continue;
        } else {
          delete takeoverSessions[senderId];
        }
      }

      /* --- Route: Booking flow hoặc AI --- */
      if (bookingSession[senderId]) {
        await handleBookingFlow(senderId, text);
      } else {
        await handleAIResponse(senderId, text);
      }
    }
  }
});

/* ═══════════════════════════════════════
   AI RESPONSE HANDLER
   - Thêm xử lý trigger KHIẾU_NẠI
   ═══════════════════════════════════════ */

async function handleAIResponse(senderId, userMessage) {
  try {
    if (!conversationHistory[senderId]) {
      conversationHistory[senderId] = [];
    }

    conversationHistory[senderId].push({ role: 'user', content: userMessage });

    if (conversationHistory[senderId].length > MAX_HISTORY) {
      conversationHistory[senderId] = conversationHistory[senderId].slice(-MAX_HISTORY);
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: conversationHistory[senderId]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );

    const botReply = response.data.content[0].text;
    conversationHistory[senderId].push({ role: 'assistant', content: botReply });

    /* --- Trigger: ĐẶT_BÀN --- */
    if (botReply.includes('ĐẶT_BÀN')) {
      const cleanReply = botReply.replace('ĐẶT_BÀN', '').trim();
      await sendMessage(senderId, cleanReply);
      await startBookingFlow(senderId);
      return;
    }

    /* --- Trigger: KHIẾU_NẠI --- */
    if (botReply.includes('KHIẾU_NẠI|')) {
      const complaintMatch = botReply.match(/KHIẾU_NẠI\|(.+)$/);
      const cleanReply = botReply.replace(/KHIẾU_NẠI\|.+$/, '').trim();
      await sendMessage(senderId, cleanReply);

      if (complaintMatch && complaintMatch[1]) {
        await notifyComplaintTelegram(complaintMatch[1], senderId);
      }
      return;
    }

    /* --- Tin nhắn bình thường --- */
    await sendMessage(senderId, botReply);

  } catch (err) {
    console.error('Lỗi AI: ' + err.response?.status + ' ' + JSON.stringify(err.response?.data || err.message));
    await sendMessage(senderId, 'Dạ, em xin lỗi Anh/Chị, hệ thống đang gặp sự cố kỹ thuật. Anh/Chị vui lòng thử lại hoặc gọi trực tiếp 091 168 4343 để được hỗ trợ ạ.');
  }
}

/* ═══════════════════════════════════════
   BOOKING FLOW — 6 bước
   Tên → Số người → Ngày → Giờ → SĐT → Lưu ý
   ═══════════════════════════════════════ */

async function startBookingFlow(senderId) {
  bookingSession[senderId] = { step: 'name' };
  await sendMessage(senderId, 'Dạ, để đặt bàn em xin hỏi Anh/Chị vài thông tin nhanh ạ.\n\nAnh/Chị cho em xin tên để tiện xưng hô ạ?');
}

async function handleBookingFlow(senderId, text) {
  const session = bookingSession[senderId];

  if (session.step === 'name') {
    session.name = text;
    session.step = 'guests';
    await sendMessage(senderId, 'Dạ, cảm ơn ' + text + ' ạ.\n\nAnh/Chị đặt bàn cho bao nhiêu người ạ?');

  } else if (session.step === 'guests') {
    session.guests = text;
    session.step   = 'date';
    await sendMessage(senderId, 'Dạ, ' + text + ' người em ghi nhận ạ.\n\nAnh/Chị dự kiến đến ngày nào ạ?');

  } else if (session.step === 'date') {
    session.date = text;
    session.step = 'time';
    await sendMessage(senderId, 'Dạ, ngày ' + text + ' em ghi nhận ạ.\n\nAnh/Chị dự kiến đến lúc mấy giờ ạ?');

  } else if (session.step === 'time') {
    session.time = text;
    session.step = 'phone';
    await sendMessage(senderId, 'Dạ, ' + text + ' em ghi nhận ạ.\n\nAnh/Chị cho em xin số điện thoại để nhà hàng xác nhận lại ạ?');

  } else if (session.step === 'phone') {
    session.phone = text;
    session.step  = 'note';
    await sendMessage(senderId, 'Dạ, em ghi nhận SĐT ạ.\n\nAnh/Chị có lưu ý đặc biệt nào không ạ? (sinh nhật, dị ứng thực phẩm, yêu cầu chỗ ngồi, v.v.)\n\nNếu không có, Anh/Chị nhắn "không" giúp em ạ.');

  } else if (session.step === 'note') {
    session.note = text.toLowerCase() === 'không' || text.toLowerCase() === 'khong' || text.toLowerCase() === 'ko' || text.toLowerCase() === 'k' ? 'Không có' : text;

    const confirmMsg =
      'Dạ, em xác nhận thông tin đặt bàn ạ:\n\n' +
      'Ten: ' + session.name + '\n' +
      'So nguoi: ' + session.guests + '\n' +
      'Ngay: ' + session.date + '\n' +
      'Gio den: ' + session.time + '\n' +
      'SDT: ' + session.phone + '\n' +
      'Luu y: ' + session.note + '\n\n' +
      'Nhà hàng Xúc Xắc sẽ gọi xác nhận lại trong vòng 15 phút ạ.\n' +
      'Em cảm ơn Anh/Chị, hẹn gặp Anh/Chị tại nhà hàng ạ.';

    await sendMessage(senderId, confirmMsg);
    await notifyBookingTelegram(session);
    delete bookingSession[senderId];
  }
}

/* ═══════════════════════════════════════
   TELEGRAM: Thông báo đặt bàn
   ═══════════════════════════════════════ */

async function notifyBookingTelegram(booking) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_GROUP_ID) return;

  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });

  const message =
    '🎲 ĐẶT BÀN MỚI - Xúc Xắc\n' +
    '==================\n' +
    '👤 Tên khách: ' + booking.name + '\n' +
    '👥 Số người: ' + booking.guests + '\n' +
    '📅 Ngày: ' + booking.date + '\n' +
    '🕐 Giờ đến: ' + booking.time + '\n' +
    '📱 SĐT: ' + booking.phone + '\n' +
    '📝 Lưu ý: ' + booking.note + '\n' +
    '📣 Nguồn: Facebook Messenger\n' +
    '⏱ Lúc: ' + now + '\n' +
    '==================\n' +
    '👉 Gọi xác nhận lại cho khách!';

  try {
    await axios.post(
      'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
      { chat_id: TELEGRAM_GROUP_ID, text: message }
    );
    console.log('Đã gửi Telegram - Đặt bàn');
  } catch (err) {
    console.error('Lỗi Telegram đặt bàn: ' + err.message);
  }
}

/* ═══════════════════════════════════════
   TELEGRAM: Thông báo khiếu nại
   ═══════════════════════════════════════ */

async function notifyComplaintTelegram(complaintData, senderId) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_GROUP_ID) return;

  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });

  // Parse: Tên:[x]|SĐT:[x]|Vấn đề:[x]|Thời gian:[x]|Bàn:[x]
  const fields = {};
  complaintData.split('|').forEach(pair => {
    const idx = pair.indexOf(':');
    if (idx > -1) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      fields[key] = val;
    }
  });

  const message =
    '🚨 KHIẾU NẠI MỚI - Xúc Xắc\n' +
    '==================\n' +
    '👤 Tên khách: ' + (fields['Tên'] || 'Chưa rõ') + '\n' +
    '📱 SĐT: ' + (fields['SĐT'] || 'Chưa rõ') + '\n' +
    '⚠️ Vấn đề: ' + (fields['Vấn đề'] || 'Chưa rõ') + '\n' +
    '🕐 Thời gian: ' + (fields['Thời gian'] || 'Không rõ') + '\n' +
    '🪑 Bàn số: ' + (fields['Bàn'] || 'Không rõ') + '\n' +
    '📣 Nguồn: Facebook Messenger\n' +
    '🆔 Sender ID: ' + senderId + '\n' +
    '⏱ Lúc: ' + now + '\n' +
    '==================\n' +
    '👉 Quản lý xử lý ngay!';

  try {
    await axios.post(
      'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
      { chat_id: TELEGRAM_GROUP_ID, text: message }
    );
    console.log('Đã gửi Telegram - Khiếu nại');
  } catch (err) {
    console.error('Lỗi Telegram khiếu nại: ' + err.message);
  }
}

/* ═══════════════════════════════════════
   GỬI TIN NHẮN FACEBOOK (giữ nguyên)
   ═══════════════════════════════════════ */

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
    console.error('Lỗi gửi tin: ' + JSON.stringify(err.response?.data || err.message));
  }
}

/* ═══════════════════════════════════════
   START SERVER (giữ nguyên)
   ═══════════════════════════════════════ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Xuc Xac Chatbot v7.0 dang chay tai cong ' + PORT);
});
