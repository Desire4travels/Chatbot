import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata for SEO, social sharing, and thumbnail
export const metadata: Metadata = {
  title: "Desire4Travels Saarthi | Instantly Build Your Dream Trip Itinerary",
  description:
    "Use Saarthi AI by Desire4Travels to plan your dream trip step by step. Customize your requirements quickly to generate a perfect, personalized itinerary in just a few clicks using AI.",
  keywords: [
    "Desire4Travels",
    "Saarthi",
    "travel itinerary planner",
    "trip planning tool",
    "personalized itinerary",
    "easy travel planner",
    "family trip planner",
    "Desire4travels saarthi",
    "AI Travel planner",
    "Saarthi AI",
    "Desire4travels AI Travel planner",
    "AI Itinerary planner",
  ],
  openGraph: {
    title: "Desire4Travels Saarthi | Instantly Build Your Dream Trip Itinerary",
    description:
      "Use Saarthi AI by Desire4Travels to plan your dream trip step by step...",
    url: "https://saarthi.desire4travels.com/", // replace with your actual website URL
    siteName: "Desire4Travels Saarthi",
    images: [
      {
        url: "/web-app-manifest-192x192.png", // <-- your thumbnail URL
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
