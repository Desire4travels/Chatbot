import { NextResponse } from 'next/server';
import { queryServicesByCity } from "@/app/lib/query";
import qs from 'querystring';
import axios from 'axios';

// IMPROVED: Better distance calculation with complete coverage verification
async function getDistancesBetweenLocations(attractions: string[], city: string) {
  if (attractions.length < 2) {
    console.log(`⚠️ Only ${attractions.length} attraction(s) in ${city}, skipping distance calculation`);
    return [];
  }

  // Remove duplicates and clean attraction names
  const cleanAttractions = Array.from(new Set(attractions.map(name => name.trim())));

  if (cleanAttractions.length !== attractions.length) {
    console.log(`🧹 Removed ${attractions.length - cleanAttractions.length} duplicate attractions in ${city}`);
  }

  const apiKey = process.env.GOOGLE_DISTANCE_MATRIX_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("Distance Matrix: No API key found");
    return [];
  }

  console.log(`🗺️ Calculating distances for ${cleanAttractions.length} unique attractions in ${city}`);
  console.log(`📍 Attractions: ${cleanAttractions.join(', ')}`);

  const distanceInfo: string[] = [];
  const processedPairs = new Set<string>(); // Track which pairs we've calculated

  // Strategy: Process ALL attractions as hubs to ensure complete coverage
  const totalPairs = (cleanAttractions.length * (cleanAttractions.length - 1)) / 2;
  console.log(`🎯 Target: ${totalPairs} unique distance pairs for ${city}`);

  for (let hubIndex = 0; hubIndex < cleanAttractions.length; hubIndex++) {
    const hubLocation = cleanAttractions[hubIndex];

    // Get all other attractions (excluding the hub)
    const otherAttractions = cleanAttractions.filter((_, index) => index !== hubIndex);

    // Process in batches (max 24 destinations per hub to stay under 25 element limit)
    const BATCH_SIZE = 24;

    for (let batchStart = 0; batchStart < otherAttractions.length; batchStart += BATCH_SIZE) {
      const batchDestinations = otherAttractions.slice(batchStart, batchStart + BATCH_SIZE);

      console.log(`📍 Hub ${hubIndex + 1}/${cleanAttractions.length}: ${hubLocation} → ${batchDestinations.length} destinations`);

      const batchDistances = await getHubToDestinationsDistances(
        hubLocation,
        batchDestinations,
        city,
        apiKey,
        processedPairs
      );

      distanceInfo.push(...batchDistances);

      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Verify coverage
  const uniqueDistanceInfo = Array.from(new Set(distanceInfo));
  console.log(`✅ Calculated ${uniqueDistanceInfo.length} unique distances out of ${totalPairs} possible pairs for ${city}`);

  if (uniqueDistanceInfo.length < totalPairs * 0.8) { // If less than 80% coverage
    console.log(`⚠️ Coverage below 80% for ${city}. Some locations might be unreachable.`);
  }

  if (uniqueDistanceInfo.length > 0) {
    console.log(`\n🗺️ DISTANCE DATA FOR ${city.toUpperCase()} (${uniqueDistanceInfo.length} connections):`);
    uniqueDistanceInfo.forEach(info => console.log(`  ${info}`));
    console.log("");
  } else {
    console.log(`⚠️ No distance data retrieved for ${city}`);
  }

  return uniqueDistanceInfo;
}

// IMPROVED: Hub to destinations with pair tracking
async function getHubToDestinationsDistances(
  hubLocation: string,
  destinations: string[],
  city: string,
  apiKey: string,
  processedPairs: Set<string>
): Promise<string[]> {

  if (destinations.length === 0) return [];

  const origins = `${hubLocation}, ${city}`;
  const destinationsStr = destinations.map(name => `${name}, ${city}`).join('|');

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${qs.stringify({
    origins,
    destinations: destinationsStr,
    mode: 'driving',
    units: 'metric',
    avoid: 'tolls', // Avoid tolls for more realistic routes
    key: apiKey
  })}`;

  try {
    const res = await axios.get(url);
    const data = res.data;

    if (!data.rows || data.status !== 'OK') {
      console.error(`❌ Distance Matrix API failed for ${hubLocation}: ${data.status}`);
      return [];
    }

    const distanceInfo: string[] = [];
    const row = data.rows[0];

    if (row && row.elements) {
      row.elements.forEach((el: any, j: number) => {
        const destination = destinations[j];

        // Create normalized pair key to avoid duplicates
        const pairKey = [hubLocation, destination].sort().join('↔');

        if (el.status === 'OK' && !processedPairs.has(pairKey)) {
          // Validate the distance makes sense (not 1m between major attractions)
          const distanceValue = el.distance.value; // in meters
          const durationValue = el.duration.value; // in seconds

          if (distanceValue > 50 && durationValue > 30) { // At least 50m and 30 seconds
            distanceInfo.push(`${hubLocation} → ${destination}: ${el.distance.text}, ~${el.duration.text}`);
            processedPairs.add(pairKey);
          } else {
            console.warn(`🚫 Suspicious distance filtered: ${hubLocation} → ${destination}: ${el.distance.text}`);
          }
        } else if (el.status !== 'OK') {
          console.warn(`⚠️ No route found: ${hubLocation} → ${destination} (${el.status})`);
        }
      });
    }

    return distanceInfo;

  } catch (error: any) {
    console.error(`❌ Distance API error for ${hubLocation}:`, error?.message || error);
    return [];
  }
}

// IMPROVED: Gemini prompt to avoid duplicates
async function getLocationNamesFromGemini(responses: Record<string, any>): Promise<{ city: string, attractions: string[] }[]> {
  const travelers = responses["How many people are going for the trip?"] || { adults: 2, kids: 0, seniors: 0 };
  const tripType = responses["What type of trip are you looking for (you can select multiple options)?"] || "Leisure";
  const duration = responses["For how many days are you planning for this trip? Days/Nights"] || { days: 3 };
  const cities = responses["Where do you want to go? Add all the locations that you are planning to visit (you can select multiple options)."] || [];
  const specificRequests = responses["Any specific destinations, activities you want to include?"] || "popular tourist spots";

  const prompt = `
    Based on the following detailed user preferences for a trip to ${cities.join(', ')}, suggest 10 to 12 specific, well-known tourist attractions or points of interest for each city.
    
    IMPORTANT RULES:
    1. Each attraction name must be unique (no duplicates like "Hadimba Temple" and "Hidimba Temple")
    2. Use the most commonly known name for each attraction
    3. Ensure attractions are actually located in the specified city
    4. Focus on major, accessible tourist attractions

    **Trip Details:**
    - Travelers: ${travelers.adults} adults, ${travelers.kids} kids, ${travelers.seniors} seniors.
    - Trip Type: ${Array.isArray(tripType) ? tripType.join(', ') : tripType}.
    - Duration: ${duration.days} days.
    - Specific Requests: ${specificRequests}.

    IMPORTANT: Your entire response must be ONLY a single, valid JSON array with this exact structure:
    [
      {
        "city": "CityName1",
        "attractions": ["Attraction1", "Attraction2", "Attraction3", ...]
      },
      {
        "city": "CityName2", 
        "attractions": ["Attraction1", "Attraction2", "Attraction3", ...]
      }
    ]

    Do not add any introductory text, explanations, or markdown.
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

    const parsed = JSON.parse(text);

    // Additional validation and cleaning
    if (Array.isArray(parsed)) {
      return parsed.map(cityData => ({
        city: cityData.city,
        attractions: Array.from(new Set(cityData.attractions.map((attr: string) => attr.trim())))
      }));
    } else {
      throw new Error("Invalid response structure from Gemini");
    }

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

      // Helper function to find the most frequent value in an array
      function findMostFrequent(arr: (string | undefined)[]): string | undefined {
        const freq: Record<string, number> = {};
        let maxCount = 0;
        let mostFrequent: string | undefined = undefined;
        for (const item of arr) {
          if (!item) continue;
          freq[item] = (freq[item] || 0) + 1;
          if (freq[item] > maxCount) {
            maxCount = freq[item];
            mostFrequent = item;
          }
        }
        return mostFrequent;
      }
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

    // UPDATED: Main logic section in your route handler
    // =================================================================
    // LOGIC TO GET TIMINGS AND DISTANCES (UPDATED FOR NEW STRUCTURE)
    // =================================================================
    let locationInfoContext = '';
    let distanceInfoContext = '';

    try {
      console.log(`Getting location details for the trip...`);

      const cityAttractions = await getLocationNamesFromGemini(responses);

      if (cityAttractions.length > 0) {
        let allLocationDetails: string[] = [];
        let allDistanceInfo: string[] = [];

        // Process each city separately
        for (const cityData of cityAttractions) {
          const { city, attractions } = cityData;

          console.log(`\n🏙️ Processing ${city} with ${attractions.length} attractions...`);

          // Get timings for all attractions in this city
          const timingPromises = attractions.map(name => getPlaceTimings(name, city));
          const timings = await Promise.all(timingPromises);

          // Add city header and location details
          allLocationDetails.push(`\n**${city.toUpperCase()} ATTRACTIONS:**`);
          const cityLocationDetails = attractions.map((name, index) => {
            return `**${name}:** ${timings[index].summary}`;
          });
          allLocationDetails.push(...cityLocationDetails);

          // Get distances for attractions within this city
          try {
            const cityDistances = await getDistancesBetweenLocations(attractions, city);

            if (cityDistances.length > 0) {
              allDistanceInfo.push(`\n**${city.toUpperCase()} DISTANCES:**`);
              allDistanceInfo.push(...cityDistances);
            }
          } catch (distanceError: any) {
            console.error(`Distance calculation failed for ${city}:`, distanceError?.message || distanceError);
          }

          // Add delay between cities to be respectful to APIs
          if (cityAttractions.indexOf(cityData) < cityAttractions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // Build context strings
        if (allLocationDetails.length > 0) {
          locationInfoContext = `
---
**LOCATION TIMINGS:**
*This is a summary of typical opening hours. You MUST use this information to create a practical schedule. Assume timings can vary on public holidays.
If for certain locations you receive "Hours not available" use your own knowledge and estimate a generic idea of the spot's visit timings, think of this smartly.
Example - If a Park's timings are not available estimate that it might open in the morning and in evening.*
${allLocationDetails.join('\n')}

`;
        }

        if (allDistanceInfo.length > 0) {
          distanceInfoContext = `
---
**LOCATION DISTANCES:**
*Use this distance and travel time information to create an efficient, geographically logical itinerary. Group nearby locations together and minimize travel time between activities. 
IMPORTANT: These distances are ONLY within the same city - do not use this data for intercity travel planning.*

${allDistanceInfo.join('\n')}

`;
        }

        console.log("\n--- Passing Following Location Data to Gemini ---");
        console.log(locationInfoContext);
        if (distanceInfoContext) {
          console.log(distanceInfoContext);
        }
        console.log("----------------------------------------------------\n");

      } else {
        console.warn("Could not get location names, proceeding without timings and distances.");
      }
    } catch (e) {
      console.error("An error occurred while getting location details, proceeding without them.", e);
    }
    // =================================================================

    const prompt = `You are an expert travel planner bot for "Desire4Travels". Your primary goal is to generate a highly detailed, practical, and personalized travel itinerary using the rules and data below.

**CORE INSTRUCTIONS**

1.  **Itinerary Generation:** Use your extensive knowledge of **${targetCityForPrompt}** to create a rich, day-by-day plan.
    * Strictly refer to USER TRIP DETAILS given below. 
     **Crucially, if a "LOCATION TIMINGS" section is provided below, you MUST use those timings to build a realistic schedule.**
     **CRITICALLY IMPORTANT: If "LOCATION DISTANCES" information is provided, you MUST use it to create a geographically efficient itinerary. Group nearby locations together in the same time slots and 
      arrange the daily schedule to minimize travel time. For example, if Location A is only 2km from Location B but 15km from Location C, schedule A and B together, not A and C.**
     **Account for all the user's preferences you have been given below and use both locationInfoContext and distanceInfoContext to make a foolproof, time-efficient itinerary**

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

7. **Geographical Clustering & Efficiency**
    You MUST use the distance information provided to create the most efficient route possible. Follow these rules:
    - **Same-Day Clustering:** Activities scheduled on the same day should be geographically close (ideally within 5-10km of each other)
    - **Logical Sequencing:** Arrange the day's activities in a route that minimizes backtracking
    - **Travel Time Buffers:** Include realistic travel time between locations based on the distance data provided
    - **Morning-to-Evening Flow:** Start from one area and move logically through the city rather than jumping across town multiple times

8. Engaging "Travel Guide" Descriptions
    Adopt the persona of an enthusiastic local guide. For each location, provide a concise (1-2 sentence) description that captures its essence, historical or cultural significance, and a unique feature. The goal is to make the traveler excited to visit each spot.

9. **Flexible Itinerary with Backup Options (LOCATION-AWARE)**
    For each day, provide 1-2 unique backup activities that are:
    - Suitable for the same time slot as the main suggestion
    - **Geographically close to the main activities of that day** (use distance data to ensure this)
    - Unique (not repeated as main or backup options on other days)
    - Easily substitutable without disrupting the day's geographical flow

10. Fallback Logic for Missing Timings
    If location timings are marked as "Hours not available" you MUST use your general knowledge to estimate a logical time slot for the visit. For example, assume parks are open during daylight hours and temples may close midday. Always add a note for the traveler to verify the hours locally.---

--- CRITICAL ITINERARY LOGIC (NON-NEGOTIABLE) ---
You are a route-optimization engine first. Before generating any text, you MUST adhere to these core rules. Failure to follow them will result in an incorrect output.
1. EFFICIENCY IS THE ONLY PRIORITY: Your primary directive is to create the most efficient itinerary possible. You will use the provided distance and timing data as the absolute truth. Do not deviate.
2. BUILD AROUND GEOGRAPHICAL CLUSTERS: Identify groups of attractions that are very close to each other (e.g., within 2-3 km). Each day's plan MUST focus on only ONE geographical cluster.
STRICTLY FORBIDDEN: Never mix locations from distant clusters on the same day. For example, scheduling a central Pune location, then an east Pune location, then back to central Pune is an unacceptable error.
3. ISOLATE OUTLIERS: Any location that is very far away (e.g., Sinhagad Fort, >25km) MUST be treated as a separate, dedicated trip requiring its own half-day or full-day schedule. You must explicitly mention the long travel time.
4. DATA IS LAW:
A short distance (< 1.5 km) means "schedule these attractions back-to-back." This is not a suggestion; it is a command.
Opening hours are absolute. An attraction that opens at 10:00 AM cannot be scheduled for 9:00 AM.
You must state the travel time between each location in the final itinerary.
5. MUST MENTION STARTING POINT/ CITY (PICKUP CITY) AND MODE OF TRANSPORT: Always start the itinerary with the intercity travel mention compulsorily, Eg. "Take (mode of transport user selects) from Pune to Mumbai, it will take around 3 hours, etc." or "Touch down to xyz airport/ railway station/ bus stop from (mention user's pickup city compulsorily)."
This gives user a clear starting point and personalized feel to the itinerary. Very very important, do not forget to start the itinerary with intercity travel suggestion. Also compulsorily mention the appropriate travel time it might take with respect to the distance and mode of transport we are recommending.
6. USER INPUT FOR MODE OF TRANSPORT: You will get one or more of these inputs for the choice of mode of transport: "Private Cab", "Shared Vehicle","Self-drive","Public Transport","Railway","Bus","Flight". For intercity travel, you will only recomment what the user has selected, but be smart while you do that -
If the user has selected "Private Cab" and "Flight" for intercity travel, you will suggest "Take a flight from Pune to Mumbai, it will take around 1 hour, etc." and then suggest "For local travel in Mumbai, you can suggest Private Cab services."
If the user has selected both "railway" or "bus" or "Flight", for intercity travel recommend the one which is most efficient with respect to distance, time and user's budget you also recieve as input.

**USER TRIP DETAILS:**
${JSON.stringify(responses, null, 2)}
${locationInfoContext}${distanceInfoContext}

---
**VENDOR CONTEXT:**
${context}

---
**YOUR RESPONSE STARTS HERE. FOLLOW ALL RULES, ESPECIALLY THE BOLDING AND SPACING. STRUCTURE YOUR OUTPUT EXACTLY LIKE THIS:**

**Desire4Travels: Your Custom Itinerary for ${targetCityForPrompt}**

**Itinerary**

(Calculate the date for each day and display it before Day N in format [DD Mon] with abbreviated month name like Sep instead of 09, **DO NOT SHOW YEAR and compulsarily display [] square brackets around the date**)
**[DD Mon] Day 1 - [Day 1 Theme]** (each day should have a minimum of 3 main activities/ travel locations)
- **Morning (Time):** [Touch down to xyz airport/ railway station/ bus stop from (mention user's pickup city compulsorily). Check into hotel (if stay longer than 1 day), Have breakfast, 
  Activity description in 1-2 lines.]
- **Afternoon (Time):** [Activity description in 1-2 lines + suggest to have lunch [Meal suggestion here, like "at a local restaurant" or "at your hotel."]]
- **Evening (Time):** [Activity name, [time frame], description in 1-2 lines. Show more than 1 activities here in the same section with a seprate [time frame], specifically the ones very near by which should be covered in 1 day together.]
- **Night (Time):** [Activity description in 1-2 lines + suggest to have dinner [Meal suggestion here, like "at a local restaurant" or "at your hotel."]]
- **Backup Options:** (this should not be in bold, just suggest these 1 - 2 options for each day right below the night activity)
(I want you to give user some backup options for each day, like if they want to skip an activity, they can do this instead, 
so give them some backup options for each day, like 2-3 activities per day as backup + a minimum of 3 activities laid out in itinerary schedule, 
so that they can choose what they want to do, give these backup options with the same time slots as the main activities, so that they can choose what they want to do
make sure the backup option is not suggested as activity for following days, let the backups remain unique just like main itinerary. Also recommend the timings for these backup options.
eg. If I am suggested to visit abc museum with a backup of xyz park/ anything else, that xyz park & abc museum should not be suggested in the following days.)

(Continue for all days of the trip)
For each day, ensure you have a minimum of 3 main activities if they are far away & 4 to 5 if the activities are close and 1-2 backup options, all with specific time slots.
**It is important and necessary to show approximate time travel time between each activity or the distance, so that the user can plan their day accordingly.**

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
