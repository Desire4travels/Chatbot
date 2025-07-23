import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";

console.log("✅ Loaded ENV variables:");
console.log("PINECONE_API_KEY:", process.env.PINECONE_API_KEY);
console.log("PINECONE_ENV:", process.env.PINECONE_ENV);
console.log("PINECONE_INDEX_NAME:", process.env.PINECONE_INDEX_NAME);

const pinecone = new Pinecone();

export async function initPinecone() {
    if (!process.env.PINECONE_INDEX_NAME) {
        throw new Error("❌ PINECONE_INDEX_NAME not set");
    }
    return pinecone.index(process.env.PINECONE_INDEX_NAME);
}

// run this file from root of the folder- npx tsx src/app/lib/pineconeClient.ts