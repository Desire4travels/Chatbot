import { initPinecone } from "./pineconeClient";
import { getGeminiEmbedding } from "./embed";

// --- CHANGE: The function now accepts an array of strings for targetCities ---
export async function queryServicesByCity(userText: string, pickupCity: string, targetCities: string[]) {
    const index = await initPinecone();
    const embedding = await getGeminiEmbedding(userText);

    if (!embedding.length) return null;

    // --- CHANGE: All filters now use the `$in` operator to match any city in the targetCities array ---
    const [busResults, cabResults, hotelResults, adventureResults] = await Promise.all([
        // Bus: Filter by pickup city AND all destination cities
        index.namespace('bus').query({
            vector: embedding,
            topK: 25,
            includeMetadata: true,
            filter: {
                // The city can be the pickup city OR any of the destination cities
                city: { $in: [pickupCity.trim(), ...targetCities] }
            }
        }),

        // Cab: Filter by any of the destination cities
        index.namespace('cab').query({
            vector: embedding,
            topK: 20,
            includeMetadata: true,
            filter: {
                city: { $in: targetCities }
            }
        }),

        // Hotel: Filter by any of the destination cities
        index.namespace('hotel').query({
            vector: embedding,
            topK: 20,
            includeMetadata: true,
            filter: {
                city: { $in: targetCities }
            }
        }),

        // Adventure: Filter by any of the destination cities
        index.namespace('adventure').query({
            vector: embedding,
            topK: 20,
            includeMetadata: true,
            filter: {
                city: { $in: targetCities }
            }
        })
    ]);

    const buses = busResults.matches || [];
    const cabs = cabResults.matches || [];
    const hotels = hotelResults.matches || [];
    const adventures = adventureResults.matches || [];

    console.log(`🔍 Query Debug:`, {
        userText,
        pickupCity,
        targetCities, // Log the array
        results: {
            buses: buses.length,
            cabs: cabs.length,
            hotels: hotels.length,
            adventures: adventures.length
        }
    });

    // The rest of this file (building context and returning results) remains the same
    // as it correctly processes the combined query results.

    const ragContext = `
🚌 Bus Options (${buses.length} found):
${buses.map((m: any) =>
        `- ${m.metadata?.providerName || m.metadata?.companyName} (${m.metadata?.contactInfo}) — Type: ${m.metadata?.busType || "N/A"}, Routes: ${m.metadata?.routesCovered || "N/A"}`
    ).join("\n") || "No buses found."}

🚖 Cab Options (${cabs.length} found):
${cabs.map((m: any) =>
        `- ${m.metadata?.providerName || m.metadata?.company} (${m.metadata?.contactInfo}) — Vehicle: ${m.metadata?.vehicleTypes || "N/A"}`
    ).join("\n") || "No cab options found."}

🏨 Hotel Options (${hotels.length} found):
${hotels.map((m: any) =>
        `- ${m.metadata?.providerName || m.metadata?.hotelName} (${m.metadata?.contactInfo}) — Facilities: ${m.metadata?.facilities || "N/A"}, Website: ${m.metadata?.onlineLink || "N/A"}`
    ).join("\n") || "No hotels found."}

🎯 Activity Options (${adventures.length} found):
${adventures.map((m: any) =>
        `- ${m.metadata?.providerName || m.metadata?.agencyName} (${m.metadata?.contactInfo}) — Activities: ${m.metadata?.activityTypes || "N/A"}`
    ).join("\n") || "No activities found."}
`;

    const allMatches = [...buses, ...cabs, ...hotels, ...adventures];

    return {
        context: ragContext.trim(),
        matches: allMatches,
        totalResults: allMatches.length
    };
}