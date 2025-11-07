let transporter = null;
let nodemailer = null;

/**
 * Initialize email transporter
 */
async function initTransporter() {
  if (transporter) {
    return transporter;
  }

  // Try to load nodemailer dynamically
  try {
    if (!nodemailer) {
      const nodemailerModule = await import('nodemailer');
      nodemailer = nodemailerModule.default;
    }
  } catch (error) {
    console.warn('⚠️  nodemailer not installed. Emails will be logged to console.');
    return null;
  }

  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  };

  // If no SMTP config, use console for dev
  if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.warn('⚠️  SMTP not configured. Emails will be logged to console.');
    return null;
  }

  transporter = nodemailer.createTransport(smtpConfig);
  return transporter;
}

/**
 * Send email invite
 * @param {string} to - Recipient email
 * @param {string} orgName - Organization name
 * @param {string} orgSlug - Organization slug
 * @param {string} token - Invite token
 * @param {string} baseUrl - Base URL (e.g., https://app.com)
 */
export async function sendInviteEmail(to, orgName, orgSlug, token, baseUrl = null) {
  const appBaseUrl = baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
  const emailFrom = process.env.EMAIL_FROM || 'HR Portal <no-reply@example.com>';

  // Build invite URL (support both subdomain and path)
  const subdomainUrl = `https://${orgSlug}.${appBaseUrl.replace(/^https?:\/\//, '')}/auth/first-login?token=${token}`;
  const pathUrl = `${appBaseUrl}/o/${orgSlug}/auth/first-login?token=${token}`;
  
  // Use subdomain if base URL doesn't have a path, otherwise use path format
  const inviteUrl = appBaseUrl.includes('/o/') ? pathUrl : subdomainUrl;

  const subject = `Welcome to ${orgName} HR Portal`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ${orgName} HR Portal</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You've been invited to join <strong>${orgName}</strong> on our HR Portal.</p>
          <p>Click the button below to set up your account and complete your onboarding:</p>
          <p style="text-align: center;">
            <a href="${inviteUrl}" class="button">Set Up Account</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #4f46e5;">${inviteUrl}</p>
          <p><strong>This link will expire in 72 hours.</strong></p>
          <p>If you didn't expect this invitation, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from ${orgName} HR Portal.</p>
          <p>If you need help, please contact your HR department.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Welcome to ${orgName} HR Portal

Hello,

You've been invited to join ${orgName} on our HR Portal.

Set up your account by clicking this link:
${inviteUrl}

This link will expire in 72 hours.

If you didn't expect this invitation, please ignore this email.

---
This is an automated message from ${orgName} HR Portal.
If you need help, please contact your HR department.
  `;

  const mailOptions = {
    from: emailFrom,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  };

  const emailTransporter = await initTransporter();
  
  if (!emailTransporter) {
    // Log to console in dev mode
    console.log('\n=== EMAIL INVITE (Dev Mode) ===');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Invite URL:', inviteUrl);
    console.log('===============================\n');
    return { success: true, message: 'Email logged to console' };
  }

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Invite email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send invite email:', error);
    throw error;
  }
}

/**
 * Verify email transporter configuration
 */
export async function verifyEmailConfig() {
  const emailTransporter = await initTransporter();
  if (!emailTransporter) {
    return { valid: false, message: 'SMTP not configured or nodemailer not installed' };
  }

  try {
    await emailTransporter.verify();
    return { valid: true, message: 'Email configuration is valid' };
  } catch (error) {
    return { valid: false, message: error.message };
  }
}

export default {
  sendInviteEmail,
  verifyEmailConfig,
};

