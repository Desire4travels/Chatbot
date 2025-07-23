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
    "List how many kids, adults and seniors are travelling?",
    "What are your tentative travel dates?",
    "Where are you starting from (pickup location)?",
    "What is your destination city or preferred route?", //give multiple adds (+ add another city)
    "Is it a round trip or one-way?",//dropdown/mcq
    "How many days do you want the trip to be?",//number option no. of days, no. of nights
    "What type of stay do you prefer?",//options in mcq& multiple selects- camping, hotel, resorts, homestays 
    "What type of transport you would prefer?",//options in mcq& multiple selects- Private cab, shared vehicle, self-drive, public transport
    "What type of trip are you looking for?",//options in mcq& multiple select- relax/leisure, adventure, pligrimage, couple.
    "What is your total approximate budget for the trip?",
    "Any specific destinations, activities you want to include?",
    "Any other preferences or special requests?",
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