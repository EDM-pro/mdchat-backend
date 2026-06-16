const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * OTP doğrulama e-postası gönder
 */
const sendOTPEmail = async ({ to, username, otp }) => {
  const mailOptions = {
    from: `"MD Chat" <${process.env.GMAIL_USER}>`,
    to,
    subject: '🔐 MD Chat — E-posta Doğrulama Kodunuz',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
          .container { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #FF6B00, #FF8C42); padding: 32px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
          .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
          .body { padding: 36px 32px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 16px; }
          .otp-box { background: linear-gradient(135deg, #FFF3E0, #FFE0B2); border: 2px solid #FF6B00; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
          .otp-label { font-size: 13px; color: #FF6B00; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
          .otp-code { font-size: 42px; font-weight: 800; color: #FF6B00; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .expire { font-size: 13px; color: #888; text-align: center; margin-top: 8px; }
          .note { background: #f9f9f9; border-radius: 8px; padding: 16px; font-size: 13px; color: #666; margin-top: 24px; }
          .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #f0f0f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💬 MD Chat</h1>
            <p>Modern Sohbet Platformu</p>
          </div>
          <div class="body">
            <p class="greeting">Merhaba <strong>${username}</strong>,</p>
            <p style="color: #555; font-size: 15px;">MD Chat hesabınızı aktifleştirmek için aşağıdaki doğrulama kodunu kullanın:</p>
            <div class="otp-box">
              <div class="otp-label">Doğrulama Kodu</div>
              <div class="otp-code">${otp}</div>
            </div>
            <p class="expire">⏱ Bu kod <strong>10 dakika</strong> geçerlidir.</p>
            <div class="note">
              🔒 Bu kodu kimseyle paylaşmayın. MD Chat ekibi hiçbir zaman sizden bu kodu istemez.
            </div>
          </div>
          <div class="footer">
            Bu e-postayı siz talep etmediyseniz görmezden gelebilirsiniz. © 2024 MD Chat
          </div>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Bağlantıyı test et
 */
const verifyMailer = async () => {
  try {
    await transporter.verify();
    console.log('✅ Gmail SMTP bağlantısı doğrulandı');
  } catch (err) {
    console.warn('⚠️  Gmail SMTP bağlantısı kurulamadı:', err.message);
  }
};

module.exports = { sendOTPEmail, verifyMailer };
