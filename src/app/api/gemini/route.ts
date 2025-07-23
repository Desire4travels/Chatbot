import { NextResponse } from 'next/server';
import { queryServicesByCity } from "@/app/lib/query";

export async function POST(req: Request) {
  try {
    const { responses } = await req.json();

    function capitalizeFirstLetter(str: string): string {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // --- All this logic is correct for preparing the city arrays ---
    const rawCityResponse = responses["What is your destination city or preferred route?"];
    const rawCitiesArray = Array.isArray(rawCityResponse) ? rawCityResponse : [rawCityResponse];

    const targetCities = rawCitiesArray
      .map(city => city ? String(city).trim() : '')
      .filter(city => city !== '')
      .map(city => capitalizeFirstLetter(city));

    const rawPickupCityResponse = responses["Where are you starting from (pickup location)?"];
    const pickupCityString = Array.isArray(rawPickupCityResponse) ? rawPickupCityResponse[0] : rawPickupCityResponse;
    const pickupCity = capitalizeFirstLetter(pickupCityString || '');

    if (targetCities.length === 0) {
      throw new Error("City not provided in responses");
    }
    // --- CHANGE: Removed the redundant and incorrect 'if (!targetCity)' check ---

    const userText = JSON.stringify(responses);

    // --- CHANGE: Pass the 'targetCities' array directly to the updated function ---
    const queryResult = await queryServicesByCity(userText, pickupCity, targetCities);

    const context = queryResult?.context ?? '';
    const matches = queryResult?.matches ?? [];

    // --- CHANGE: Create a human-readable string for the prompt ---
    const targetCityForPrompt = targetCities.join(', ');

    // 5. Construct prompt
    const prompt = `
You are an expert travel planner bot for "Desire4Travels". Your primary goal is to generate a highly detailed, practical, and personalized travel itinerary.

// [ACTION: Clearly define the two separate roles for the AI: Planner vs. Vendor Lister]
**Your Core Task has two parts:**
1.  **Itinerary Generation:** Use your own extensive knowledge of **${targetCityForPrompt}** to create a rich, day-by-day plan. Suggest famous landmarks, hidden gems, logical routes, and types of activities (e.g., "visit a historical fort," "try scuba diving," "explore the local markets"). The quality and detail of the itinerary itself should NOT be limited by the context below.
2.  **Vendor Integration:** The "Context from our vendor database" is your ONLY source for specific business names, contacts, and services. When you suggest an activity in the itinerary that matches a service in the context (e.g., you suggest scuba diving and the context has a scuba vendor), you MUST mention that vendor from the context. If the context is empty or lacks a relevant vendor for a suggested activity, simply describe the activity generically (e.g., "Find a local guide for a city tour") and note in the "Service Providers" section that no specific vendor was available in the database.

// [ACTION: Provide specific instructions for personalization to address problem #3]
**Personalization Rules:**
* **Pacing:** You MUST adjust the pace of the itinerary based on the travelers' details. For trips with seniors or young children, suggest fewer activities per day with more leisure time. For adventurous adults, create a more packed schedule.
* **Logistics:** Be a smart planner. Include suggestions for meal times (e.g., "Lunch at a beach shack near Baga," "Dinner in the historic city center"). Acknowledge travel time between locations.
* **Interests:** Tailor the *types* of activities to the user's declared trip type (e.g., adventurous, relaxing, family).

**User's Trip Details:**
${JSON.stringify(responses, null, 2)}

**Context from our vendor database:**
${context}

**Required Output Format:**
**CRITICAL OUTPUT DIRECTIVE: Compact & Attractive Formatting**
You MUST generate **compact Markdown**. The output should be dense and easy to read, like a summary in a travel app.
* **ELIMINATE ALL UNNECESSARY BLANK LINES.**
* Use a single newline to separate items in a list.
* Use a double newline ONLY to separate major, distinct sections (like separating the full 'Day 1' block from the 'Day 2' block, please dont leave a lot of blank space in between).
* Do NOT put blank lines between a heading and the list that follows it.

// [ACTION: Explicitly request detailed, structured sections to control output.]
Generate the response in the following structured sections.

**Desire4Travels: Your Custom Itinerary for ${targetCityForPrompt}**

**Detailed Day-by-Day Itinerary**
// [ACTION: Guide the model on how to structure the daily plan for better detail. Try giving about 4 activities per day, with a mix of morning, afternoon, and evening suggestions. Include travel details]
// [Action: Make sure the usesr gets enough info from each activity point you show, not less not a lot just adequate. A smart travel planner would put in 2 to 3 lines for each activity, not just a single line.]
(For each day, provide a thoughtful schedule. Follow this compact example:
**Day 1: Arrival and Settling In**
* **Morning:** Depart from ${pickupCity}. If a bus vendor is in the context, mention them.
* **Afternoon:** Arrive in ${targetCityForPrompt}, travel to your hotel. Consider check-in times.
* **Evening:** Suggest a relaxing first-night activity like a short walk or dinner near the hotel.

**Day 2: North Goa Adventure**
* **Morning (9 AM - 1 PM):** Visit Calangute Beach. For travel, consider hiring a cab from Goa Rides (Contact: Cristiano Dsouza).
* **Lunch (1 PM - 2 PM):** Enjoy a meal at one of the many beach shacks.
* **Afternoon (2 PM - 5 PM):** Head to Baga Beach for water sports. You can book an experience with Ocean Thrill (Contact: Meera Pillai).
* **Evening:** Watch the sunset from Vagator Hill and explore nearby cafes for dinner.)
* **night:** Go to club cubana for a night out, check out the kareoke night at Tito's near baga beach.

**Service Provider Details**
// [ACTION: Force the model to use the context strictly for this section and handle missing data gracefully.]
(List ALL relevant providers from the context. If a category is empty, explicitly state that. **Keep the list tight.**)

* **Bus Options:**
    * **In ${pickupCity}:** [List vendors from context or state "No specific vendors found in our database."]
    * **In ${targetCityForPrompt}:** [List vendors from context or state "No specific vendors found in our database."]

* **Hotel Options:**
    * [List all hotel vendors from context with all their details or state "No specific vendors found in our database."]

* **Cab Services:**
    * [List all cab vendors from context with all their details or state "No specific vendors found in our database."]

* **Activities:**
    * [List all activity vendors from context with all their details or state "No specific vendors found in our database."]

// [ACTION: Provide strict formatting rules to prevent unwanted blank spaces - solves problem #1]
**Formatting Guidelines:**
* Use single line breaks for list items.
* Use double line breaks ONLY to separate major sections (e.g., between "Day 1" and "Day 2", or between the Itinerary and Service Providers).
* Do not include any concluding notes or disclaimers that are not part of the requested structure.
`;

    // The rest of the file is standard and correct.
    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }], },], }),
      }
    );

    const data = await result.json();
    if (data.error) {
      console.error('❌ Gemini API returned an error:', data.error);
      throw new Error(data.error.message || 'Error from Gemini API');
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    const rawReply = parts?.map((part: any) => part.text).join('\n') || '⚠️ Gemini returned no content.';
    const cleanedReply = rawReply.replace(/\n{3,}/g, '\n\n');

    return NextResponse.json({
      itinerary: cleanedReply,
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

  } catch (error: any) {
    console.error('❌ API Route error:', error);
    const errorMessage = error.message || 'Something went wrong while generating the itinerary.';
    return NextResponse.json(
      { itinerary: `❌ ${errorMessage}` },
      { status: 500 }
    );
  }
}