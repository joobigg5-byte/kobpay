import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// 🚀 Matches your .env file perfectly
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { prompt, history } = await req.json();

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro", // Fallback to standard pro if 3.1-preview throws access errors
      systemInstruction: "You are KobBot 2.0, the elite AI guardian of the KPC (KobPay Coins) Sovereign Rail. You help users understand the $1.00 KPC peg, track fiat depreciation in GHS, NGN, and ZAR, and navigate the dashboard. Be professional, slightly witty, and highly knowledgeable about Web3 finance. Keep answers concise."
    });

    const chat = model.startChat({
      history: history || [],
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    
    return NextResponse.json({ text: response.text() });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: "Failed to reach KobBot Core" }, { status: 500 });
  }
}