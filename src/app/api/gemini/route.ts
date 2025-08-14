import { NextResponse } from 'next/server';
import { queryServicesByCity } from "@/app/lib/query";
import axios from 'axios';

// Helper to find the most frequent time slot in a list
function findMostFrequent(arr: (string | undefined)[]): string | undefined {
  const filteredArr = arr.filter(time => time && !time.toLowerCase().includes('closed'));
  if (!filteredArr.length) return undefined;

  const counts = filteredArr.reduce((acc, value) => {
    if (value !== undefined) {
      acc[value] = (acc[value] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
}

// HELPER FUNCTION 1: Get location names from Gemini
async function getLocationNamesFromGemini(responses: Record<string, any>): Promise<string[]> {
  const travelers = responses["How many people are going for the trip?"] || { adults: 2, kids: 0, seniors: 0 };
  const tripType = responses["What type of trip are you looking for (you can select multiple options)?"] || "Leisure";
  const duration = responses["For how many days are you planning for this trip? Days/Nights"] || { days: 3 };
  const cities = responses["Where do you want to go? Add all the locations that you are planning to visit (you can select multiple options)."] || [];
  const specificRequests = responses["Any specific destinations, activities you want to include?"] || "popular tourist spots";

  const prompt = `
    Based on the following detailed user preferences for a trip to ${cities.join(', ')}, suggest 10 to 12 specific, well-known tourist attractions or points of interest for each city.
    Also refer to the user's number of days for the trip to give out the number of locations to suggest, use other inputs aswell to suggest the locations.
    Example - for a trip to cities Mumbai & Pune,for Pune suggest 10 to 12 popular spots and for Mumbai suggest 10 to 12 popular spots, etc.

    **Trip Details:**
    - Travelers: ${travelers.adults} adults, ${travelers.kids} kids, ${travelers.seniors} seniors.
    - Trip Type: ${Array.isArray(tripType) ? tripType.join(', ') : tripType}.
    - Duration: ${duration.days} days.
    - Specific Requests: ${specificRequests}.

    IMPORTANT: Your entire response must be ONLY a single, valid JSON array of strings. Do not add any introductory text, explanations, or markdown.

    Example Response:
    ["Shaniwar Wada", "Aga Khan Palace", "Sinhagad Fort", "Raja Dinkar Kelkar Museum", "Pataleshwar Cave Temple"]
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
          }
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API failed with status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates[0]?.content.parts[0]?.text;
    console.log("Got location names from Gemini:", text);
    return JSON.parse(text) as string[];

  } catch (error) {
    console.error("Error fetching location names from Gemini:", error);
    return [];
  }
}

// HELPER FUNCTION 2 (UPDATED FOR CONCISE SUMMARY)
async function getPlaceTimings(placeName: string, cityName: string): Promise<{ summary: string; status: 'success' | 'not_found' | 'no_hours' | 'error' }> {
  try {
    const searchResponse = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: { query: `${placeName}, ${cityName}`, key: process.env.GOOGLE_PLACES_API_KEY }
    });
    const placeId = searchResponse.data.results[0]?.place_id;
    if (!placeId) return { summary: "Timings not found", status: 'not_found' };

    const detailsResponse = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id: placeId, fields: 'opening_hours/weekday_text', key: process.env.GOOGLE_PLACES_API_KEY }
    });
    const hours = detailsResponse.data.result?.opening_hours?.weekday_text;

    if (hours && Array.isArray(hours)) {
      // Extract just the time part (e.g., "9:00 AM – 5:00 PM") for each day
      const timeParts = hours.map(day => day.split(': ')[1]);

      const weekdayTimes = timeParts.slice(1, 6); // Monday to Friday
      const weekendTimes = [timeParts[6], timeParts[0]]; // Saturday and Sunday

      const commonWeekday = findMostFrequent(weekdayTimes);
      const commonWeekend = findMostFrequent(weekendTimes);

      let summary: string;
      if (commonWeekday && commonWeekday === commonWeekend) {
        summary = `All Week: ${commonWeekday}`;
      } else {
        const weekdayPart = commonWeekday ? `Weekdays: ${commonWeekday}` : 'Weekdays: Timings vary or closed';
        const weekendPart = commonWeekend ? `Weekends: ${commonWeekend}` : 'Weekends: Timings vary or closed';
        summary = `${weekdayPart} | ${weekendPart}`;
      }
      return { summary, status: 'success' };
    }

    return { summary: "Hours not available", status: 'no_hours' };

  } catch (error) {
    console.error(`Error fetching details for ${placeName}:`, error);
    return { summary: "Could not fetch timings", status: 'error' };
  }
}


// MAIN API ROUTE HANDLER
export async function POST(req: Request) {
  try {
    const { responses } = await req.json();

    function capitalizeFirstLetter(str: string): string {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

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

    const userText = JSON.stringify(responses);
    const queryResult = await queryServicesByCity(userText, pickupCity, targetCities);
    const context = queryResult?.context ?? '';
    const matches = queryResult?.matches ?? [];
    const targetCityForPrompt = targetCities.join(', ');

    // =================================================================
    // LOGIC TO GET TIMINGS (UPDATED)
    // =================================================================
    let locationInfoContext = '';
    try {
      console.log(`Getting location details for the trip...`);

      const locationNames = await getLocationNamesFromGemini(responses);

      if (locationNames.length > 0) {
        const primaryCity = targetCities[0];
        const timingPromises = locationNames.map(name => getPlaceTimings(name, primaryCity));
        // The 'timings' variable is now an array of objects: [{ summary: '...', status: '...' }]
        const timings = await Promise.all(timingPromises);

        // Use the 'summary' property from the timing object
        const locationDetailsString = locationNames.map((name, index) => {
          return `**${name}:** ${timings[index].summary}`;
        }).join('\n');

        locationInfoContext = `
---
**LOCATION TIMINGS:**
*This is a summary of typical opening hours. You MUST use this information to create a practical schedule. Assume timings can vary on public holidays.
If for certain locations you recieve "Hours not available" use your own knowledge and estimate a generic idea of the spot's visit timings, think of this smartly.
Example - If a Park's timings are not available estimate that it might open in the morning and in evening. *
${locationDetailsString}
`;

        console.log("\n--- Passing Following Location Timings to Gemini ---");
        console.log(locationInfoContext);
        console.log("----------------------------------------------------\n");

      } else {
        console.warn("Could not get location names, proceeding without timings.");
      }
    } catch (e) {
      console.error("An error occurred while getting location details, proceeding without them.", e);
    }
    // =================================================================


    const prompt = `You are an expert travel planner bot for "Desire4Travels". Your primary goal is to generate a highly detailed, practical, and personalized travel itinerary using the rules and data below.

**CORE INSTRUCTIONS**

1.  **Itinerary Generation:** Use your extensive knowledge of **${targetCityForPrompt}** to create a rich, day-by-day plan.
     **Crucially, if a "LOCATION TIMINGS" section is provided below, you MUST use those timings to build a realistic schedule.**
     **Account fot all the user's preferences you have been given below and the locationInfoContext to make a full proof itinerary**

2.  **Vendor Integration:** The "VENDOR CONTEXT" provided is your **only** source for specific business names.
    * **If a suggested activity matches a vendor**, you can suggest it in the itinerary to refer service provider list below .
    * **If no relevant vendor exists**, describe the activity generically and state: "For bookings, connect with the Desire4Travels Team at +91 79770 22583."

3.  **Personalization Rules:**
    * **Pacing:** Adjust the itinerary's pace for the specific travelers (e.g., relaxed for seniors, packed for adventurers).
    * **Logistics:** Verify location opening times using locationInfoContext function above. Include travel time and meal suggestions.
    * **Transportation:** Recommend transport based on distance (<5km: walk/auto, 5-15km: cab/auto, >15km: bus/train, >500km: flight).

4.  **CRITICAL Formatting Rules:**
    * a. You MUST generate **compact Markdown** with **NO unnecessary blank lines**.
    * b. **SUBHEADING STYLE: Every subheading MUST be bolded using double asterisks.**
    * c. Do not add any conversational summaries or concluding remarks.

5.  **Separate the generation of itinerary:**
    * **Itinerary:** Generate a detailed day-by-day itinerary with specific times and activities and do not mention any one or many service providers here at all. We want the user to be able to use this itinerary irrespective of the service providers. 
    Build the itinerary in a friendly manner, make it seem like the user is talking to a travel guide. Do not mention any hotel, cab, bus or adventure service providers here. Suppose you want to mention check in at hotel, just mention check in your hotel room and that's all, make it generic. This is a very important rule, do not mention any service providers here.
    * Always make sure to think the user is pumped to go on this trip and you are giving them a very detailed itinerary with respect to their adults/ kids/ seniors number of people, their preferences, etc. Give them a very detailed itinerary, make it seem like you are a travel guide, each day should at least cover 3-5 activities other than meals, with smartly managed intercity travel timings, meals, etc.

6. intercity travel suggest eg. If the user is traveling from Pune to Mumbai, suggest them to take a train or bus, and if they are traveling from Mumbai to Delhi, suggest them to take a flight, etc.
    *very very important - start the itinerary with the intercity travel suggestion, like if they are traveling from Pune to Mumbai, start the itinerary with "Take a train from Pune to Mumbai, it will take around 3 hours, etc." 
    "or if the user is travelling from a far away city start the itinerary by saying touch down to the nearest airport/ railway station only one of those 2 (give name of that air port or station) and then continue with the itinerary. This is a very important rule, do not forget to start the itinerary with intercity travel suggestion.*
7. Geographical Clustering & Efficiency
    You MUST group attractions that are geographically close into the same time block (e.g., morning, afternoon) to create a logical and efficient plan that minimizes travel. For instance, in Pune, Shaniwar Wada and Dagdusheth Temple are neighbors and MUST be scheduled together. Do not suggest attractions on opposite sides of a city without accounting for major travel time.

8. Engaging "Travel Guide" Descriptions
    Adopt the persona of an enthusiastic local guide. For each location, provide a concise (1-2 sentence) description that captures its essence, historical or cultural significance, and a unique feature. The goal is to make the traveler excited to visit each spot.

9. Flexible Itinerary with Backup Options
    For each day, provide 1-2 unique backup activities suitable for the same time slot as the main suggestion. An activity suggested as a backup CANNOT be repeated as a main or backup option on any other day. Backups must also be geographically sensible for that day's plan.
    Compulsory: make sure that these backup options are located close to the main activity of that day, so that the user can easily switch to these backup options if they want to skip the main activity. 

10. Fallback Logic for Missing Timings
    If location timings are marked as "Hours not available" you MUST use your general knowledge to estimate a logical time slot for the visit. For example, assume parks are open during daylight hours and temples may close midday. Always add a note for the traveler to verify the hours locally.---

**USER TRIP DETAILS:**
${JSON.stringify(responses, null, 2)}
${locationInfoContext}
---
**VENDOR CONTEXT:**
${context}

---
**YOUR RESPONSE STARTS HERE. FOLLOW ALL RULES, ESPECIALLY THE BOLDING AND SPACING. STRUCTURE YOUR OUTPUT EXACTLY LIKE THIS:**

**Desire4Travels: Your Custom Itinerary for ${targetCityForPrompt}**

**Itinerary**

**Day 1: [Day 1 Theme]** (each day should have a minimum of 3 main activities/ travel locations)
- **Morning (Time):** [Touch down to xyz airport/ railway station/ bus stop. Check into hotel (if stay longer than 1 day), Have breakfast, 
  Activity description in 1-2 lines.]
- **Afternoon (Time):** [Activity description in 1-2 lines + suggest to have lunch [Meal suggestion here, like "at a local restaurant" or "at your hotel."]]
- **Evening (Time):** [Activity description in 1-2 lines.]
- **Night (Time):** [Activity description in 1-2 lines + suggest to have dinner [Meal suggestion here, like "at a local restaurant" or "at your hotel."]]
Backup Options: (this should not be in bold, just suggest these 1 - 2 options for each day right below the night activity)
(I want you to give user some backup options for each day, like if they want to skip an activity, they can do this instead, 
so give them some backup options for each day, like 2-3 activities per day as backup + a minimum of 3 activities laid out in itinerary schedule, 
so that they can choose what they want to do, give these backup options with the same time slots as the main activities, so that they can choose what they want to do
make sure the backup option is not suggested as activity for following days, let the backups remain unique just like main itinerary.
eg. If I am suggested to visit abc museum with a backup of xyz park/ anything else, that xyz park & abc museum should not be suggested in the following days.)

(Continue for all days of the trip)

------------------------------------------------------------------------
**Service Provider Details**
(This is a subtitle, make the font bold and most importantly show all the details you have about these service providers, including their contact information, website, city they operate in, and any other available information.)

Very very important: Do not use bullet points anywhere in this section. Not even for service provider categories. Bullet points break the output layout. Each service provider must be on a separate line, with all their details such as name, contact, website, service coverage, etc., listed in the same line. Use line breaks (\\n) for each provider.

**Bus Options:**
List the available bus operators for each of the two cities—${pickupCity} and ${targetCityForPrompt}—in this format:

**Buses in City Name:**
[Each vendor on a separate line with complete details — name, contact, website (if any), and especially their travel route covered. If no vendors are found for a city, write: "No specific vendors found."]

**Buses in ${pickupCity}:**
[List providers here in the format above, each on new line, else write “No specific vendors found.”]

**Buses in ${targetCityForPrompt}:**
[List providers here in the format above, each on new line, else write “No specific vendors found.”]

**Hotel Options:**
List hotels here. Each hotel must be on a separate line in the format:
Hotel Name (Contact Person, Phone Number) (Website if any, Room types, Amenities, etc., and mention the city).
If no vendors are found, write:
No specific vendors found.
For bookings, connect with the Desire4Travels Team at +91 79770 22583.

**Cab Services:**
List cab service providers here. Each provider must be on a new line, in the format:
Provider Name (Contact Person, Phone Number) (City they operate in, Vehicle types, Intercity coverage, Website if available).
If no vendors are found, write: “No specific vendors found.”

**Activities:**
List all adventure or activity providers here. Each must be on a new line, in the format:
Activity Name or Provider (Contact Person, Phone Number) (City, Activity types, Website if available).
If no vendors are found, write: “No specific vendors found.”

---------------------------------------------------------------------
`;

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