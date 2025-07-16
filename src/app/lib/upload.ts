import { initPinecone } from "./pineconeClient";
import { getGeminiEmbedding } from "./embed";

export async function fetchAndUploadToPinecone() {
    const index = await initPinecone();
    const response = await fetch("https://desire4travels-1.onrender.com/services");
    const jsonData = await response.json();

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
        console.error("❌ No data fetched from services endpoint");
        return;
    }

    for (const [i, item] of jsonData.entries()) {
        const text = `${item.serviceType} - ${item.providerName} in ${item.city}. Contact: ${item.contactInfo}`;
        const embedding = await getGeminiEmbedding(text);
        if (!embedding.length) continue;

        const doc = {
            id: `doc-${i}`,
            values: embedding,
            metadata: {
                city: item.city,
                serviceType: item.serviceType,
                providerName: item.providerName,
                contactInfo: item.contactInfo,
                category: item.category,
                notes: item.notes,
                id: item.id,
            },
        };

        await index.upsert([doc]);
        console.log(`✅ Uploaded: ${item.providerName} (${item.city})`);
        await new Promise(r => setTimeout(r, 300));
    }

    console.log("🎉 All documents uploaded.");
}

fetchAndUploadToPinecone().catch((err) => {
    console.error("❌ Upload failed:", err);
});
