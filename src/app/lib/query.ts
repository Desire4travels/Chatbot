import { initPinecone } from "./pineconeClient";
import { getGeminiEmbedding } from "./embed";

export async function queryServicesByCity(userText: string, pickupCity: string, targetCity: string) {
    const index = await initPinecone();
    const embedding = await getGeminiEmbedding(userText);

    if (!embedding.length) return null;

    // ✅ Query each namespace separately with appropriate filters
    const [busResults, cabResults, hotelResults, adventureResults] = await Promise.all([
        // Bus: Filter by both pickup and target city
        index.namespace('bus').query({
            vector: embedding,
            topK: 50,
            includeMetadata: true,
            filter: {
                city: { $in: [pickupCity.trim(), targetCity.trim()] }
            }
        }),

        // Cab: Filter only by target city
        index.namespace('cab').query({
            vector: embedding,
            topK: 50,
            includeMetadata: true,
            filter: {
                city: targetCity.trim()
            }
        }),

        // Hotel: Filter only by target city
        index.namespace('hotel').query({
            vector: embedding,
            topK: 50,
            includeMetadata: true,
            filter: {
                city: targetCity.trim()
            }
        }),

        // Adventure: Filter only by target city  
        index.namespace('adventure').query({
            vector: embedding,
            topK: 50,
            includeMetadata: true,
            filter: {
                city: targetCity.trim()
            }
        })
    ]);

    // ✅ Extract matches from each result
    const buses = busResults.matches || [];
    const cabs = cabResults.matches || [];
    const hotels = hotelResults.matches || [];
    const adventures = adventureResults.matches || [];

    // ✅ Debug logging
    console.log(`🔍 Query Debug:`, {
        userText,
        pickupCity,
        targetCity,
        results: {
            buses: buses.length,
            cabs: cabs.length,
            hotels: hotels.length,
            adventures: adventures.length
        }
    });

    // ✅ Log first result from each to check data structure
    if (buses.length > 0) console.log('Bus sample:', buses[0].metadata);
    if (cabs.length > 0) console.log('Cab sample:', cabs[0].metadata);
    if (hotels.length > 0) console.log('Hotel sample:', hotels[0].metadata);
    if (adventures.length > 0) console.log('Adventure sample:', adventures[0].metadata);

    // ✅ Build combined response
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

    // ✅ Combine all matches
    const allMatches = [...buses, ...cabs, ...hotels, ...adventures];

    return {
        context: ragContext.trim(),
        matches: allMatches,
        totalResults: allMatches.length
    };
}