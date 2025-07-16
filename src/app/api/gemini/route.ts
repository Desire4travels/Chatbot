import { NextResponse } from 'next/server';
import { getGeminiEmbedding } from '@/app/lib/embed';
import { queryServicesByCity } from "@/app/lib/query";

export async function POST(req: Request) {
  try {
    const { responses } = await req.json();
    const rawCity = responses["What is your destination city or preferred route?"];
    const targetCity = capitalizeFirstLetter(rawCity || '');

    function capitalizeFirstLetter(str: string): string {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    if (!targetCity) {
      throw new Error("City not provided in responses");
    }

    // 1. Generate embedding from user input
    const userText = JSON.stringify(responses);

    const queryResult = await queryServicesByCity(userText, targetCity);
    const context = queryResult?.context ?? '';
    const matches = queryResult?.matches ?? [];

    // 5. Construct prompt
    const prompt = `
You are a smart travel planner bot for "Desire4Travels".
The user wants an itinerary for **${targetCity}**. Use the responses below to customize a travel plan. 
Make sure to include local cabs, hotels, and activities from the context below. I want you to only list the hotel/cabs/activities you get from context below nothing other than that make sure to show all of them and not only a few(emphasis on showing all service provider details you get from context).
Do not mention in your output this (Note:  Website addresses provided are for illustrative purposes only and may not be actual working websites.)
Here are the user's answers:
${JSON.stringify(responses, null, 2)}

Context from our vendor database:
${context}

Respond in structured sections:
1.  Itinerary (Day-wise plan)
2.  Hotel options (with contact)
3.  Cab services (with contact)
4.  Activities & adventures (with contact)
`;

    // 6. Call Gemini API
    console.log("Prompt sent to Gemini:\n", prompt);

    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    const data = await result.json();
    console.log(" Gemini response data (raw):", JSON.stringify(data, null, 2));

    const parts = data?.candidates?.[0]?.content?.parts;
    const reply = parts?.map((part: any) => part.text).join('\n') || '⚠️ Gemini returned no content.';

    // 7. Send final response
    return NextResponse.json({
      itinerary: reply,
      recommendations: matches.map((m: any) => ({
        id: m.id,
        score: m.score,
        type: m.metadata?.serviceType,
        title: m.metadata?.providerName,
        description: m.metadata?.notes,
        contact: m.metadata?.contactInfo,
        city: m.metadata?.city,
      })),
    });

  } catch (error) {
    console.error('❌ Gemini API error:', error);
    return NextResponse.json(
      { itinerary: '❌ Something went wrong while generating the itinerary.' },
      { status: 500 }
    );
  }
}
