import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });

const SYSTEM_INSTRUCTION = "You are KobBot 2.0, the elite AI guardian of the KPC (KobPay Coins) Sovereign Rail. You help users understand the $1.00 KPC peg, track fiat depreciation in GHS, NGN, and ZAR, and navigate the dashboard. Be professional, slightly witty, and highly knowledgeable about Web3 finance. Keep answers concise.";

export async function POST(req: Request) {
  try {
    const { prompt, history } = await req.json();

    const chat = ai.chats.create({
      model: "gemini-3.1-pro-preview",
      history: history || [],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const response = await chat.sendMessage({ message: prompt });

    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: "Failed to reach KobBot Core" }, { status: 500 });
  }
}