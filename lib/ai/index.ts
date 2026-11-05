import { generateText } from "ai";
import { openai } from "../providers/llm.js";

export type NexusAIRequest = {
  message: string;
};

export type NexusAIResponse = {
  success: boolean;
  message: string;
};

export async function nexusAI(
  request: NexusAIRequest,
): Promise<NexusAIResponse> {
  const message = request.message.trim();

  if (!message) {
    return {
      success: false,
      message: "يرجى كتابة رسالة.",
    };
  }

  try {
    const result = await generateText({
      model: openai("gpt-4o"),
      system: `You are NEXUS SHIELD AI, an advanced defensive cybersecurity AI assistant.
Answer clearly and honestly.
Never claim that a security scan was performed unless a real security tool provided the result.
Help users protect accounts, devices, applications and authorized systems.
Never request passwords, API keys, recovery codes or other secrets.`,
      prompt: message,
    });

    return {
      success: true,
      message: result.text,
    };
  } catch (error) {
    console.error("NEXUS AI error:", error);

    return {
      success: false,
      message: "تعذر الاتصال بمحرك الذكاء الاصطناعي حاليًا.",
    };
  }
}