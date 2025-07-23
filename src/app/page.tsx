"use client";
import { useState } from "react";
import axios from "axios";
import "./app.css";
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [responses, setResponses] = useState<Record<number, string | string[]>>({});
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cityList, setCityList] = useState<string[]>([""]);

  const questions: string[] = [
    "List how many kids, adults and seniors are travelling?",
    "What are your tentative travel dates?",
    "Where are you starting from (pickup location)?",
    "What is your destination city or preferred route?",
    "Is it a round trip or one-way?",
    "How many days do you want the trip to be?",
    "What type of stay do you prefer?",
    "What type of transport you would prefer?",
    "What type of trip are you looking for?",
    "What is your total approximate budget for the trip?",
    "Any specific destinations, activities you want to include?",
    "Any other preferences or special requests?",
  ];

  const optionsMap: Record<number, string[] | null> = {
    4: ["Round Trip", "One Way"],
    6: ["Camping", "Hotel", "Resorts", "Homestays"],
    7: ["Private Cab", "Shared Vehicle", "Self-drive", "Public Transport"],
    8: ["Relax/Leisure", "Adventure", "Pilgrimage", "Couple"],
  };

  const isMultiSelect = (index: number) => [6, 7, 8].includes(index);
  const isSingleChoice = (index: number) => [4].includes(index);

  const handleEdit = (index: number) => {
    setStep(index);
    const value = responses[index];
    if (typeof value === "string") {
      setMessage(value);
    } else if (index === 3 && Array.isArray(value)) {
      setCityList(value);
    }
    setItinerary("");
  };

  const handleMultiSelect = (value: string) => {
    const current = Array.isArray(responses[step])
      ? (responses[step] as string[])
      : [];
    if (current.includes(value)) {
      setResponses({
        ...responses,
        [step]: current.filter((v) => v !== value),
      });
    } else {
      setResponses({ ...responses, [step]: [...current, value] });
    }
  };

  const handleCityChange = (value: string, idx: number) => {
    const newCities = [...cityList];
    newCities[idx] = value;
    setCityList(newCities);
  };

  const addCityField = () => {
    setCityList([...cityList, ""]);
  };

  const isStepValid = () => {
    if (step === 3) return cityList.some((c) => c.trim() !== "");
    if (isSingleChoice(step)) return !!responses[step];
    if (isMultiSelect(step)) return Array.isArray(responses[step]) && responses[step].length > 0;
    return !!message.trim();
  };

  const handleNext = () => {
    if (step === 3) {
      setResponses({
        ...responses,
        [step]: cityList.filter((c) => c.trim() !== ""),
      });
    } else if (!isSingleChoice(step) && !isMultiSelect(step)) {
      setResponses({ ...responses, [step]: message });
    }
    setStep(step + 1);
    setMessage("");
    setError("");
  };

  const handleBack = () => {
    const previousStep = step - 1;
    setStep(previousStep);
    const prev = responses[previousStep];
    if (typeof prev === "string") {
      setMessage(prev);
    } else if (previousStep === 3 && Array.isArray(prev)) {
      setCityList(prev);
    } else {
      setMessage("");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const structuredResponses = Object.fromEntries(
        Object.entries(responses).map(([key, val]) => [questions[+key], val])
      );
      const res = await axios.post("/api/gemini", {
        responses: structuredResponses,
      });
      setItinerary(res.data.itinerary || "⚠ No itinerary returned.");
      if (res.data.error) setError(res.data.error);
    } catch (err: any) {
      setError(
        err?.response?.data?.itinerary ||
        err?.response?.data?.error ||
        "❌ Error fetching itinerary."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToStart = () => {
    setResponses({});
    setStep(0);
    setMessage("");
    setItinerary("");
    setError("");
    setLoading(false);
    setCityList([""]);
  };

  const progressPercent = ((step / questions.length) * 100).toFixed(0);

  return (
    <main className="main-container">
      <h1 className="main-heading">🌍 Trip Planner Assistant</h1>
      <p className="sub-heading">
        Tell us your preferences, we'll do the magic!
      </p>

      <div className="progress-bar-wrapper">
        <div
          className="progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
        <span className="progress-label">{progressPercent}% completed</span>
      </div>

      {step < questions.length && (
        <div className="question-card">
          <p className="question">{questions[step]}</p>

          {step === 3 && (
            <>
              {cityList.map((city, idx) => (
                <input
                  key={idx}
                  value={city ?? ""}
                  onChange={(e) => handleCityChange(e.target.value, idx)}
                  placeholder={`City ${idx + 1}`}
                  className="input"
                />
              ))}
              <button onClick={addCityField} className="button secondary">
                + Add another city
              </button>
            </>
          )}

          {isSingleChoice(step) && (
            <div className="option-group">
              {optionsMap[step]?.map((opt) => (
                <label
                  key={opt}
                  className={`option ${responses[step] === opt ? "selected" : ""
                    }`}
                >
                  <input
                    type="radio"
                    name={`question-${step}`}
                    value={opt}
                    checked={responses[step] === opt}
                    onChange={() => setResponses({ ...responses, [step]: opt })}
                    hidden
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}

          {isMultiSelect(step) && (
            <div className="option-group">
              {optionsMap[step]?.map((opt) => {
                const isChecked =
                  Array.isArray(responses[step]) &&
                  (responses[step] as string[]).includes(opt);
                return (
                  <label
                    key={opt}
                    className={`option ${isChecked ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      value={opt}
                      checked={isChecked}
                      onChange={() => handleMultiSelect(opt)}
                      hidden
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          )}

          {![3, 4, 6, 7, 8].includes(step) && (
            <input
              type={step === 5 || step === 9 ? "number" : "text"}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your answer"
              className="input"
            />
          )}

          <div className="button-row">
            {step > 0 && (
              <button className="button secondary" onClick={handleBack}>
                ⬅ Back
              </button>
            )}
            <button
              className="button"
              onClick={handleNext}
              disabled={loading || !isStepValid()}
            >
              {step === questions.length - 1
                ? "Review & Generate"
                : "Next ➡"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {step === questions.length && !itinerary && (
        <div className="summary-card">
          <h2>📋 Review Your Answers</h2>
          <ul className="summary-list">
            {Object.entries(responses).map(([key, value]) => (
              <li
                key={key}
                className="summary-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  alignItems: "center",
                }}
              >
                <span>
                  <strong>{questions[+key]}</strong>:{" "}
                  {Array.isArray(value) ? value.join(", ") : String(value)}
                </span>
                <button
                  className="edit-button"
                  onClick={() => handleEdit(+key)}
                >
                  ✏ Edit
                </button>
              </li>
            ))}
          </ul>
          <button onClick={handleSubmit} className="button" disabled={loading}>
            {loading ? "⏳ Generating Itinerary..." : "✅ Confirm & Generate"}
          </button>
        </div>
      )}

      {itinerary && (
        <div className="result-card">
          <h2 className="itinerary-title">🗺 Your Personalized Itinerary</h2>
          <div className="itinerary-box">
            <ReactMarkdown>{itinerary}</ReactMarkdown>
          </div>
          <button onClick={handleBackToStart} className="back-button">
            🔁 Start New Plan
          </button>
        </div>
      )}
    </main>
  );
}