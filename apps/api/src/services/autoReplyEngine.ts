import { prisma } from "../db/prisma.js";
import axios from "axios";
import { replyToGmbReview } from "./gmb.js";
import { generateInboxReply as openaiGenerateInboxReply } from "./openai.js";
import { generateInboxReply as groqGenerateInboxReply, isGroqAvailable } from "./groq.js";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

export interface RuleWithTemplate {
  id: string;
  dealer_id: string;
  platform: string;
  message_type: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  ai_tone: string | null;
  template_id: string | null;
  is_active: boolean;
  template?: {
    id: string;
    name: string;
    text: string;
  } | null;
}

// Score rules to find the most specific rule first
function getRuleScore(rule: RuleWithTemplate): number {
  let score = 0;
  if (rule.platform !== "all") score += 10;
  if (rule.message_type !== "all") score += 10;
  if (rule.condition_type === "contains_keywords") score += 5;
  if (rule.condition_type === "sentiment_is" || rule.condition_type === "rating_is") score += 3;
  if (rule.condition_type === "always") score += 0;
  return score;
}

// Render bracketed placeholders
export function renderTemplate(text: string, message: any, dealer: any): string {
  return text
    .replace(/\{\{customer_name\}\}/g, message.customer_name || "Customer")
    .replace(/\{\{dealer_name\}\}/g, dealer.name || "")
    .replace(/\{\{city\}\}/g, dealer.city || "")
    .replace(/\{\{phone\}\}/g, dealer.contact_phone || dealer.phone || "")
    .replace(/\{\{whatsapp\}\}/g, dealer.whatsapp_number || dealer.phone || "")
    .replace(/\{\{email_subject\}\}/g, message.email_subject || "");
}

// Helper to check conditions
function evaluateCondition(conditionType: string, conditionValue: string, message: any): boolean {
  if (conditionType === "always") return true;

  if (conditionType === "sentiment_is") {
    return message.sentiment?.toLowerCase() === conditionValue.toLowerCase();
  }

  if (conditionType === "contains_keywords") {
    const keywords = conditionValue.split(",").map((k) => k.trim().toLowerCase());
    const text = (message.message_text || "").toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  }

  if (conditionType === "rating_is") {
    // Since InboxMessage does not store numeric rating, we map 1-5 ratings to sentiment:
    // 4, 5 -> positive
    // 3 -> neutral
    // 1, 2 -> negative
    const allowedRatings = conditionValue.split(",").map((r) => r.trim());
    const sentiment = message.sentiment?.toLowerCase();
    
    return allowedRatings.some((rating) => {
      if ((rating === "5" || rating === "4") && sentiment === "positive") return true;
      if (rating === "3" && sentiment === "neutral") return true;
      if ((rating === "2" || rating === "1") && sentiment === "negative") return true;
      return false;
    });
  }

  return false;
}

// Call AI Reply generator
async function generateAIReply(
  messageText: string,
  sentiment: string,
  dealer: any,
  messageType: string,
  tone?: string
): Promise<string> {
  const normType = (messageType === "email" ? "dm" : messageType) as "comment" | "dm" | "review";
  const dealerContext = {
    name: dealer.name,
    city: dealer.city,
    brands: (dealer.brands as string[] | null) ?? [],
    phone: dealer.contact_phone ?? dealer.phone,
    whatsapp: dealer.whatsapp_number ?? dealer.phone,
    language_preferences: (dealer.language_preferences as string[] | null) ?? ["en"],
  };

  if (isGroqAvailable()) {
    try {
      return await groqGenerateInboxReply(messageText, sentiment, dealerContext, normType, tone);
    } catch (e) {
      console.warn("Groq failed, falling back to OpenAI:", e);
    }
  }
  return openaiGenerateInboxReply(messageText, sentiment, dealerContext, normType, undefined, tone);
}

// Send reply out to connection
async function sendReply(message: any, replyText: string, connection: any): Promise<boolean> {
  if (message.platform === "email") {
    // Mock sending email: log and return true
    console.log(`[MOCK EMAIL OUTBOUND] To: ${message.customer_platform_id}, Subject: Re: ${message.email_subject || "Inquiry"}, Body: ${replyText}`);
    return true;
  }

  if (!connection || !connection.is_connected) {
    console.warn(`No connected connection found for platform ${message.platform}`);
    return false;
  }

  try {
    if (connection.platform === "gmb" && message.platform_message_id) {
      await replyToGmbReview(message.platform_message_id, connection.access_token, replyText);
      return true;
    }

    if (connection.platform === "facebook" || connection.platform === "instagram") {
      if (message.message_type === "comment" && message.platform_message_id) {
        await axios.post(
          `${META_GRAPH_BASE}/${message.platform_message_id}/comments`,
          { message: replyText, access_token: connection.access_token }
        );
        return true;
      }

      if (message.customer_platform_id) {
        await axios.post(`${META_GRAPH_BASE}/me/messages`, {
          recipient: { id: message.customer_platform_id },
          message: { text: replyText },
          access_token: connection.access_token,
        });
        return true;
      }
    }
  } catch (err) {
    console.error(`Failed to send auto-reply to ${message.platform}`, err);
  }

  return false;
}

export async function processIncomingMessage(messageId: string): Promise<void> {
  const message = await prisma.inboxMessage.findUnique({
    where: { id: messageId },
  });

  if (!message) return;
  // If already replied, do nothing
  if (message.reply_text) return;

  const dealer = await prisma.dealer.findUnique({
    where: { id: message.dealer_id },
  });

  if (!dealer) return;

  // 1. Retrieve and sort active rules
  const rules = (await prisma.autoReplyRule.findMany({
    where: {
      dealer_id: dealer.id,
      is_active: true,
    },
    include: {
      template: true,
    },
  })) as RuleWithTemplate[];

  // Sort rules: more specific (platform/type specific, keyword match) comes first
  const sortedRules = rules.sort((a, b) => getRuleScore(b) - getRuleScore(a));

  // Find matching rule
  let matchedRule: RuleWithTemplate | null = null;
  for (const rule of sortedRules) {
    const platformMatches = rule.platform === "all" || rule.platform === message.platform;
    const typeMatches = rule.message_type === "all" || rule.message_type === message.message_type;
    
    if (platformMatches && typeMatches && evaluateCondition(rule.condition_type, rule.condition_value, message)) {
      matchedRule = rule;
      break;
    }
  }

  // Determine reply action
  let replyText = "";
  let toneToUse = matchedRule?.ai_tone || undefined;
  let requiresApproval = !dealer.auto_reply_enabled || matchedRule?.action_type === "manual";

  if (matchedRule) {
    if (matchedRule.action_type === "template" && matchedRule.template) {
      replyText = renderTemplate(matchedRule.template.text, message, dealer);
    } else {
      // AI action
      replyText = await generateAIReply(
        message.message_text,
        message.sentiment || "neutral",
        dealer,
        message.message_type,
        toneToUse
      );
    }
  } else {
    // Default fallback: AI reply with default tone
    replyText = await generateAIReply(
      message.message_text,
      message.sentiment || "neutral",
      dealer,
      message.message_type,
      undefined
    );
  }

  // 2. Execute reply
  if (requiresApproval) {
    // Manual mode / Review required: save as suggested reply
    await prisma.inboxMessage.update({
      where: { id: message.id },
      data: {
        ai_suggested_reply: replyText,
        requires_approval: true,
      },
    });
  } else {
    // Auto Mode: Reply automatically
    const connection = await prisma.platformConnection.findFirst({
      where: {
        dealer_id: dealer.id,
        platform: message.platform,
        is_connected: true,
      },
    });

    const sent = await sendReply(message, replyText, connection);
    
    if (sent) {
      await prisma.inboxMessage.update({
        where: { id: message.id },
        data: {
          reply_text: replyText,
          replied_at: new Date(),
          is_read: true,
          requires_approval: false,
        },
      });
    } else {
      // Fallback to manual if sending fails
      await prisma.inboxMessage.update({
        where: { id: message.id },
        data: {
          ai_suggested_reply: replyText,
          requires_approval: true,
        },
      });
    }
  }
}
