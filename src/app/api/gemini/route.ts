import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { responses } = await req.json();

    const prompt = `
You are a smart travel planner bot for "Desire4Travels".
Based on the customer's answers, generate a day-wise itinerary and list the services (cab, hotel, permits, etc.).

Here are the answers:
${JSON.stringify(responses, null, 2)}

Respond in clean sections: Itinerary + Required Services.
`;

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
    console.log("🔍 Gemini response data (raw):", JSON.stringify(data, null, 2));

    const parts = data?.candidates?.[0]?.content?.parts;
    const reply = parts?.map((part: any) => part.text).join('\n') || '⚠️ Gemini returned no content.';

    return NextResponse.json({
      itinerary: reply,
    });
  } catch (error) {
    console.error('❌ Gemini API error:', error);
    return NextResponse.json(
      { itinerary: '❌ Something went wrong with the Gemini API.' },
      { status: 500 }
    );
  }
}
