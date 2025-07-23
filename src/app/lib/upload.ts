import { initPinecone } from "./pineconeClient";
import { getGeminiEmbedding } from "./embed";

export async function fetchAndUploadToPinecone() {
    const index = await initPinecone();

    let jsonData;
    try {
        const response = await fetch("https://desire4travels-1.onrender.com/service-providers");
        if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
        jsonData = await response.json();
    } catch (error) {
        console.error("❌ Error fetching data:", error);
        return;
    }

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
        console.error("❌ No data fetched or data is not an array");
        return;
    }

    for (const [i, item] of jsonData.entries()) {
        let text = "";
        let providerName = "";
        let city = "";
        let contactInfo = "";
        const namespace = item.type; // ✅ Dynamic namespace

        let metadata: Record<string, any> = {
            type: item.type,
            serviceType: item.type,
            id: item.id,
        };

        switch (item.type) {
            case "adventure":
                text = `Adventure by ${item.agencyName} in ${item.location}. Activities: ${item.activityTypes}. Contact: ${item.contactPerson} - ${item.contactMobile}`;
                providerName = item.agencyName;
                city = item.location;
                contactInfo = `${item.contactPerson}, ${item.contactMobile}`;
                metadata = {
                    ...metadata,
                    city,
                    providerName,
                    contactInfo,
                    contactPerson: item.contactPerson,
                    contactMobile: item.contactMobile,
                    agencyName: item.agencyName,
                    activityTypes: item.activityTypes,
                };
                break;

            case "bus":
                text = `Bus service by ${item.companyName} based in ${item.baseCity}. Route: ${item.routesCovered}, Type: ${item.busType}. Contact: ${item.contactPerson} - ${item.contactMobile}`;
                providerName = item.companyName;
                city = item.baseCity;
                contactInfo = `${item.contactPerson}, ${item.contactMobile}`;
                metadata = {
                    ...metadata,
                    city,
                    providerName,
                    contactInfo,
                    contactPerson: item.contactPerson,
                    contactMobile: item.contactMobile,
                    companyName: item.companyName,
                    busType: item.busType,
                    routesCovered: item.routesCovered,
                };
                break;

            case "cab":
                text = `Cab service from ${item.company} in ${item.baseCity}. Vehicle types: ${item.vehicleTypes}. Coverage: ${item.intercityCoverage}. Contact: ${item.contactPerson} - ${item.contactMobile}`;
                providerName = item.company;
                city = item.baseCity;
                contactInfo = `${item.contactPerson}, ${item.contactMobile}`;
                metadata = {
                    ...metadata,
                    city,
                    providerName,
                    contactInfo,
                    contactPerson: item.contactPerson,
                    contactMobile: item.contactMobile,
                    company: item.company,
                    vehicleTypes: item.vehicleTypes,
                };
                break;

            case "hotel":
                text = `Hotel ${item.hotelName} in ${item.city}. Book online: ${item.onlineLink}. Stay type: ${item.stayType}. Categories: ${item.roomCategories}. Facilities: ${item.facilities}. Contact: ${item.contactPerson} - ${item.contactMobile}`; // ✅ roomsAvailable removed
                providerName = item.hotelName;
                city = item.city;
                contactInfo = `${item.contactPerson}, ${item.contactMobile}`;
                metadata = {
                    ...metadata,
                    city,
                    providerName,
                    onlineLink: item.onlineLink,
                    contactInfo,
                    contactPerson: item.contactPerson,
                    hotelName: item.hotelName,
                    roomCategories: item.roomCategories,
                    facilities: item.facilities,
                };
                break;

            default:
                console.warn(`⚠️ Unknown type: ${item.type}, skipping.`);
                continue;
        }

        let embedding;
        try {
            embedding = await getGeminiEmbedding(text);
        } catch (err) {
            console.error(`❌ Embedding failed for ${providerName}:`, err);
            continue;
        }

        if (!embedding || !embedding.length) {
            console.warn(`⚠️ Empty embedding for ${providerName}, skipping.`);
            continue;
        }

        const doc = {
            id: `doc-${item.id || i}`,
            values: embedding,
            metadata,
        };

        try {
            await index.namespace(namespace).upsert([doc]);

            console.log(`✅ Uploaded: ${providerName} (${city}) to namespace: ${namespace}`);
        } catch (err) {
            console.error(`❌ Failed to upsert ${providerName}:`, err);
        }

        await new Promise(r => setTimeout(r, 300));
    }

    console.log("🎉 All documents uploaded.");
}

fetchAndUploadToPinecone().catch((err) => {
    console.error("❌ Upload failed:", err);
});
