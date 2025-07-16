import fs from "fs";
import path from "path";

// Absolute path to your .env file
const envPath = path.resolve(__dirname, ".env");

// Check if .env file exists
if (fs.existsSync(envPath)) {
    console.log("✅ .env file found at:", envPath);
    console.log("📦 .env contents:\n", fs.readFileSync(envPath, "utf-8"));
} else {
    console.error("❌ .env file NOT found!");
}
