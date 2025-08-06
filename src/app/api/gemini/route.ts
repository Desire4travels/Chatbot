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
    const rawCityResponse = responses["Where do you want to go? Add all the locations that you are planning to visit (you can select multiple options)."];
    const rawCitiesArray = Array.isArray(rawCityResponse) ? rawCityResponse : [rawCityResponse];

    const targetCities = rawCitiesArray
      .map(city => city ? String(city).trim() : '')
      .filter(city => city !== '')
      .map(city => capitalizeFirstLetter(city));

    const rawPickupCityResponse = responses["From which location are you starting your trip?"];
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
    const prompt = `You are an expert travel planner bot for "Desire4Travels". Your primary goal is to generate a highly detailed, practical, and personalized travel itinerary using the rules and data below.

**CORE INSTRUCTIONS**

1.  **Itinerary Generation:** Use your extensive knowledge of **${targetCityForPrompt}** to create a rich, day-by-day plan. Suggest famous landmarks, hidden gems, logical routes, and types of activities.

2.  **Vendor Integration:** The "VENDOR CONTEXT" provided is your **only** source for specific business names.
    * **If a suggested activity matches a vendor**, you can suggest it in the itinerary to refer service provider list below .
    * **If no relevant vendor exists**, describe the activity generically and state: "For bookings, connect with the Desire4Travels Team at +91 79770 22583."

3.  **Personalization Rules:**
    * **Pacing:** Adjust the itinerary's pace for the specific travelers (e.g., relaxed for seniors, packed for adventurers).
    * **Logistics:** Verify location opening times. Include travel time and meal suggestions.
    * **Transportation:** Recommend transport based on distance (<5km: walk/auto, 5-15km: cab/auto, >15km: bus/train, >500km: flight).

4.  **CRITICAL Formatting Rules:**
    * a. You MUST generate **compact Markdown** with **NO unnecessary blank lines**. Use single newlines for list items and double newlines only between major sections (like Day 1 and Day 2).
    * b. **SUBHEADING STYLE: Every subheading MUST be bolded using double asterisks.** This applies to parts like "**Morning (Time):**", "**Lunch (Time):**", "**Bus Options:**", etc.
    * c. Do not add any conversational summaries or concluding remarks.

5. **Seprate the generation of itinerary and service provider details:**
    * **Itinerary:** Generate a detailed day-by-day itinerary with specific times and activities and do not mention any one or many service providers here at all. We want the user to be able use 
    this itinerary irrespective of the service providers. Build the itinerary is a friendly manner, make it seem like the user is talking to a travel guide.
    Do not mention any hotel, cab, bus or adventure service providers here. Suppose you waant to mention check in at hotel, just mention check in your hotel room and thats all, make it generic. 
    This is a very important rule, do not mention any service providers here.
    * Always make sure to think the user can is pumped to go on this trip and you are giving them a very detailed itinerary with respect to their adults/ kids/ seniors number of people, their preferences, etc.
    give them a very detailed itinerary, make it seem like you are a travel guide, each day should atleast cover 3-5 activities other than meals, with smartly managed intercity travel timings, meals, etc.
    * **Service Provider Details:** List all service providers with their contact information, website, etc.,
    Make sure to list each verder detail in a separate line, do not use bullet points here. For buses show bus providers in pickup city and destination city as prompted below.
    I need to have the each service provider name and detail on a separate line, for all cases. Not at all in one line or comma separated.

---
**USER TRIP DETAILS:**
${JSON.stringify(responses, null, 2)}

---
**VENDOR CONTEXT:**
${context}

---
**YOUR RESPONSE STARTS HERE. FOLLOW ALL RULES, ESPECIALLY THE BOLDING AND SPACING. STRUCTURE YOUR OUTPUT EXACTLY LIKE THIS:**

Desire4Travels: Your Custom Itinerary for ${targetCityForPrompt} (this is a sample title, replace with actual title make the font bold)

Detailed Day-by-Day Itinerary (this is a subtitle, make the font bold)

Day 1: [Day 1 Theme] (all days should be written in bold/ heading style)
- Morning (Time): [Activity description in 2-3 lines.]
- Lunch (Time): [Meal suggestion.]
- Afternoon (Time): [Activity description in 2-3 lines.]
- Evening (Time): [Activity description in 3-4 lines.]

Day 2: [Day 2 Theme]
- Morning (Time): [Activity description in 2-3 lines.]
- Lunch (Time): [Meal suggestion.]
- Afternoon (Time): [Activity description in 2-3 lines.]
- Evening (Time): [Activity description in 2-3 lines.]
(Continue for all days of the trip)

Service Provider Details
(This is a subtitle, make the font bold and most importantly show all the details you have about these service providers, including their contact information, website, city they operate in, and any other available information.)

Very very important: Do not use bullet points anywhere in this section. Not even for service provider categories. Bullet points break the output layout. Each service provider must be on a separate line, with all their details such as name, contact, website, service coverage, etc., listed in the same line. Use line breaks (\n) for each provider.

Bus Options:
List the available bus operators for each of the two cities—${pickupCity} and ${targetCityForPrompt}—in this format:

Buses in City Name (bolded):
[Each vendor on a separate line with complete details — name, contact, website (if any), and especially their travel route covered. If no vendors are found for a city, write: "No specific vendors found."]

Example:
Buses in Pune:
Skyline Travels (Rakesh Naik, 9876543210) (skylinepune.com, Pune to Mumbai, Pune to Nashik)
Urban Wheels (Divya Joshi, 9900887766) (urbanwheels.in, Pune to Aurangabad)
Golden Wheels Travels (Meera Kapoor, 9823456781) (goldenwheels.com, Pune to Lonavala)

Buses in ${pickupCity}:
[List providers here in the format above, each on new line, else write “No specific vendors found.”]

Buses in ${targetCityForPrompt}:
[List providers here in the format above, each on new line, else write “No specific vendors found.”]

Hotel Options:
List hotels here. Each hotel must be on a separate line in the format:
Hotel Name (Contact Person, Phone Number) (Website if any, Room types, Amenities, etc., and mention the city).
If no vendors are found, write:
No specific vendors found.
For bookings, connect with the Desire4Travels Team at +91 79770 22583.

Cab Services:
List cab service providers here. Each provider must be on a new line, in the format:
Provider Name (Contact Person, Phone Number) (City they operate in, Vehicle types, Intercity coverage, Website if available).
If no vendors are found, write: “No specific vendors found.”

Activities:
List all adventure or activity providers here. Each must be on a new line, in the format:
Activity Name or Provider (Contact Person, Phone Number) (City, Activity types, Website if available).
If no vendors are found, write: “No specific vendors found.”
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