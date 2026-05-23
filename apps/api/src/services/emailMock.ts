import { prisma } from "../db/prisma.js";
import { processIncomingMessage } from "./autoReplyEngine.js";

interface MockEmailTemplate {
  customerName: string;
  email: string;
  subject: string;
  body: string;
  sentiment: "positive" | "neutral" | "negative";
  tag: "lead" | "complaint" | "general" | "spam";
}

const MOCK_TEMPLATES: MockEmailTemplate[] = [
  {
    customerName: "Aarav Sharma",
    email: "aarav.sharma@gmail.com",
    subject: "Inquiry: Price Quote for Hyundai Creta SX(O)",
    body: "Hi Team, I am looking to purchase the new Hyundai Creta SX(O) Petrol Automatic this month. Could you please send me the on-road price details for Bangalore? Also, let me know if there are any exchange offers available for a 2018 Maruti Swift. Thanks!",
    sentiment: "neutral",
    tag: "lead",
  },
  {
    customerName: "Pooja Hegde",
    email: "pooja.h89@yahoo.com",
    subject: "Test Drive Request - Kia Seltos GTX+",
    body: "Hello, I would like to schedule a home test drive for the Kia Seltos GTX+ diesel on Saturday morning. I live in Indiranagar. Please confirm if someone can bring the car over. Contact number: +91 99887 76655.",
    sentiment: "positive",
    tag: "lead",
  },
  {
    customerName: "Rohan Das",
    email: "rohan.das@outlook.com",
    subject: "Complaint: Delay in registration of my Thar",
    body: "Extremely frustrated with the service. I purchased a Mahindra Thar last week (Invoice #DEAL-8899) and was promised that the registration would be done by Tuesday. It is now Friday and your team is not picking up my calls. Please resolve this urgently.",
    sentiment: "negative",
    tag: "complaint",
  },
  {
    customerName: "Meera Nair",
    email: "meera.nair@hotmail.com",
    subject: "Service Center Hours Inquiry",
    body: "Hello, are you open on Sundays for periodic maintenance service? I need to drop off my Kia Sonet for its 20,000 km general service.",
    sentiment: "neutral",
    tag: "general",
  },
  {
    customerName: "Win Cash Prize",
    email: "spammer99@spambot.ru",
    subject: "Congratulations! You won a $1000 gift card",
    body: "Claim your free gift card now by clicking this link and completing our 2 minute survey! Limit time offer.",
    sentiment: "neutral",
    tag: "spam",
  },
];

export async function generateMockEmails(dealerId: string) {
  const created = [];
  const baseTime = Date.now();

  let idx = 0;
  for (const temp of MOCK_TEMPLATES) {
    const uuid = Math.random().toString(36).substring(2, 15);
    const platformMessageId = `email_${uuid}`;

    const msg = await prisma.inboxMessage.create({
      data: {
        dealer_id: dealerId,
        platform: "email",
        message_type: "email",
        platform_message_id: platformMessageId,
        customer_name: temp.customerName,
        customer_platform_id: temp.email,
        email_subject: temp.subject,
        message_text: temp.body,
        sentiment: temp.sentiment,
        tag: temp.tag,
        is_read: false,
        received_at: new Date(baseTime - idx * 3600 * 1000), // Spaced out by 1 hour
      },
    });

    // Run the newly created mock email through the auto reply engine
    await processIncomingMessage(msg.id);

    // Fetch the updated message with reply status / suggested reply
    const updatedMsg = await prisma.inboxMessage.findUnique({
      where: { id: msg.id },
    });

    if (updatedMsg) {
      created.push(updatedMsg);
    } else {
      created.push(msg);
    }
    idx++;
  }
  return created;
}
