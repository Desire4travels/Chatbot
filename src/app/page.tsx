"use client";
import { useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import "./app.css";

export default function Home() {
  const [responses, setResponses] = useState({});
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const questions = [
    "How many people are traveling?",
    "What are the age groups (kids, adults, seniors)?",
    "What are your travel dates (tentative or fixed)?",
    "Where are you starting from (pickup location)?",
    "What is your destination or preferred route?",
    "Is it a round trip or one-way?",
    "How many days do you want the trip to be?",
    "What type of stay do you prefer?",
    "Private cab, shared vehicle, self-drive, or public transport?",
    "Vehicle type preference? (Sedan, SUV, Tempo Traveller)",
    "Are you looking for a relaxing trip or an adventurous one?",
    "What kind of experiences do you prefer?",
    "What is your approximate budget (per person or total)?",
    "Any specific destinations, places, or activities you want to include?",
  ];

  const handleSubmit = async () => {
    const updatedResponses = { ...responses, [questions[step]]: message };

    if (step === questions.length - 1) {
      setResponses(updatedResponses);
      setLoading(true);
      setMessage("");
      try {
        const res = await axios.post("/api/gemini", { responses: updatedResponses });
        setItinerary(res.data.itinerary || "⚠️ No itinerary returned.");
      } catch (err) {
        setError("❌ Error fetching itinerary.");
      } finally {
        setLoading(false);
        setStep(step + 1);
      }
    } else {
      setResponses(updatedResponses);
      setMessage("");
      setStep(step + 1);
    }
  };

  // Reset all state to start over
  const handleBackToStart = () => {
    setResponses({});
    setStep(0);
    setMessage("");
    setItinerary("");
    setError("");
    setLoading(false);
  };

  return (
    <main className="main-container">
      <h1 className="heading">🧳 Trip Planner Assistant</h1>
      {step < questions.length ? (
        <>
          <p className="question">{questions[step]}</p>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="input"
            placeholder="Type your answer here"
          />
          <button
            onClick={handleSubmit}
            className="button"
            disabled={!message.trim() || loading}
          >
            Next
          </button>
        </>
      ) : (
        <>
          <h2 className="itinerary-title">📋 Your Itinerary</h2>
          {loading ? (
            <p className="loading">⏳ Generating your itinerary...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : (
            <>
              <div className="itinerary-box">
                <ReactMarkdown>{itinerary}</ReactMarkdown>
              </div>
              <button
                onClick={handleBackToStart}
                className="back-button"
              >
                Back to Start
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}