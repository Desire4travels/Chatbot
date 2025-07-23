import { NextResponse } from 'next/server';
import { queryServicesByCity } from "@/app/lib/query";

export async function POST(req: Request) {
  try {
    const { responses } = await req.json();
    const rawCity = responses["What is your destination city or preferred route?"];
    const targetCity = capitalizeFirstLetter(rawCity || '');

    const rawPickupCity = responses["Where are you starting from (pickup location)?"];
    const pickupCity = capitalizeFirstLetter(rawPickupCity || '');


    function capitalizeFirstLetter(str: string): string {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    if (!targetCity) {
      throw new Error("City not provided in responses");
    }

    // 1. Generate embedding from user input
    const userText = JSON.stringify(responses);

    const queryResult = await queryServicesByCity(userText, pickupCity, targetCity);
    const context = queryResult?.context ?? '';
    const matches = queryResult?.matches ?? [];

    // 5. Construct prompt
    const prompt = `
You are a smart travel planner bot for "Desire4Travels".
The user wants an itinerary for **${targetCity}**. Use the responses below to customize a travel plan. 
Make sure to include local cabs, hotels, and activities from the context below. I want you to only list the hotel/cabs/activities you get from context below nothing other than that make sure to show all of them and not only a few(emphasis on showing all service provider details you get from context).
Do not mention in your output this (Note:Website addresses provided are for illustrative purposes only and may not be actual working websites.)
Here are the user's answers:
${JSON.stringify(responses, null, 2)}

Context from our vendor database:
${context}

Respond in structured sections: (give a detailed itineary day wise, think smartly where all and how much the user can travel seeing the number of 
kids and seniors travelling, give cab services, Bus options(segregate this in 2 parts: Buses in ${pickupCity} and Buses in ${targetCity})**, hotel options, activities service provider details from context with contacts)
Itinerary. For your itenary, do not refer a lot to the context, just use it to get the service providers and their details (eg. if the user has selected adventurous type of trip
make sure to put adventure section in the itenary with a little refrence to context). Give a detailed itenary day wise (emphasis on day wise itenary) with all the details of the trip. You are the smart travel planner bot for "Desire4Travels" and you are here to help the user plan their trip to ${targetCity}.
Dont give a lot of empty spaces in the response, give it in a presentable and structured way. Even if the context is empty, you should still provide a structured response and well put itenary.
Service Providers relavent to you:  
  Bus options 
  Hotel options 
  Cab services 
  Activities 
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
      recommendations: matches.map((m: any) => {
        const metadata = m.metadata || {};
        return {
          id: m.id,
          score: m.score,
          type: metadata.serviceType,
          title: metadata.providerName,
          description: metadata.notes,
          contact: metadata.contactInfo,
          city: metadata.city,
          destinationCity: metadata.destinationCity || null,
          activityTypes: metadata.serviceType === "adventure" ? metadata.activityTypes || "N/A" : undefined,
          website: metadata.serviceType === "Hotel" ? metadata.onlineLink || "N/A" : undefined,
        };
      }),
    });

  } catch (error) {
    console.error('❌ Gemini API error:', error);
    return NextResponse.json(
      { itinerary: '❌ Something went wrong while generating the itinerary.' },
      { status: 500 }
    );
  }
}
