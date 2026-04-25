import nodemailer from "nodemailer";

export const sendEmail = async ({ to, subject, text, html }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: true, // 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });


  await transporter.sendMail({
    from: `"ma3llc" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });

  
};