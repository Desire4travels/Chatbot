import { initPinecone } from "./pineconeClient";
import { getGeminiEmbedding } from "./embed";

export async function queryServicesByCity(userText: string, targetCity: string) {
    const index = await initPinecone();
    const embedding = await getGeminiEmbedding(userText);
    if (!embedding.length) return null;

    const searchResults = await index.query({
        vector: embedding,
        topK: 1000,
        includeMetadata: true,
        filter: { city: targetCity },
    });

    const matches = searchResults.matches || [];

    const cabs = matches.filter((m: any) => m.metadata?.serviceType?.toLowerCase() === "cab");
    const hotels = matches.filter((m: any) => m.metadata?.serviceType?.toLowerCase() === "hotel");
    const activities = matches.filter((m: any) =>
        ["activity", "adventure", "tour"].includes(m.metadata?.serviceType?.toLowerCase())
    );

    const ragContext = `
Cab Options:
${cabs.map((m: any) => `- ${m.metadata?.providerName} (${m.metadata?.contactInfo})`).join("\n") || "No cab options available."}

Hotel Options:
${hotels.map((m: any) => `- ${m.metadata?.providerName} (${m.metadata?.contactInfo})`).join("\n") || "No hotel options available."}

Activity Options:
${activities.map((m: any) => `- ${m.metadata?.providerName} (${m.metadata?.contactInfo})`).join("\n") || "No activity options available."}
`;

    return {
        context: ragContext.trim(),
        matches,
    };
}
