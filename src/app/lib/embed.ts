import * as dotenv from "dotenv";
dotenv.config();

console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY);

export async function getGeminiEmbedding(text: string): Promise<number[]> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { parts: [{ text }] } }),
        }
    );

    const data = await res.json();
    const embedding = data.embedding?.values;

    if (!embedding || !Array.isArray(embedding)) {
        console.error("❌ Invalid embedding returned:", data);
        return [];
    }

    return embedding;
}

// Example usage (test):
//getGeminiEmbedding("Hello world").then((embedding) => {
//    console.log("✅ Embedding:", embedding);
//});