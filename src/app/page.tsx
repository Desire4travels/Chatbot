"use client";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import axios from "axios";
import "./app.css";

type Travelers = {
  adults: number;
  kids: number;
  seniors: number;
};

type StepResponses = {
  0: Travelers;
  1: string;
  2: string;
  3: string[];
  4: string;
  5: { days: number; nights: number };
  6: string[];
  7: string[];
  8: string[];
  9: string;
  10: string;
  11: string;
  12: string;
};

const questions: string[] = [
  "How many people are going for the trip?",
  "When are you planning for the trip?",
  "From which location are you starting your trip?",
  "Where do you want to go? Add all the locations that you are planning to visit (you can select multiple options).",
  "Is it a round trip or one-way?",
  "For how many days are you planning for this trip? Days/Nights",
  "What type of stay do you prefer(you can select multiple options)?",
  "What type of transport you would prefer(you can select multiple options)?",
  "What type of trip are you looking for(you can select multiple options)?",
  "What is your total approximate budget for the trip?",
  "Any specific destinations or activities you’d like to include? (Optional)",
  "Any other preferences or special requests? (Optional)",
  "Please provide your 10-digit contact number",
];

const optionsMap: Record<number, string[] | null> = {
  4: ["Round Trip", "One Way"],
  6: ["Camping", "Hotel", "Resorts", "Homestays"],
  7: ["Private Cab", "Shared Vehicle", "Self-drive", "Public Transport"],
  8: ["Relax/Leisure", "Adventure", "Pilgrimage", "Couple"],
};

const isMultiSelect = (index: number) => [6, 7, 8].includes(index);
const isSingleChoice = (index: number) => [4].includes(index);

export default function Home() {
  const [responses, setResponses] = useState<Partial<StepResponses>>({});
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [loading, setLoading] = useState(false);
  const [cityList, setCityList] = useState<string[]>([""]);
  // In your component's state
  const [tripId, setTripId] = useState(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [contactNumber, setContactNumber] = useState("");
  const [contactError, setContactError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const itineraryRef = useRef<HTMLDivElement>(null);
  const itineraryModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Array.isArray(responses[3])) {
      setCityList(responses[3] as string[]);
    }
  }, [responses[3]]);

  const [error, setError] = useState("");
  // Add this function:
  const syncCityListWithResponses = () => {
    if (Array.isArray(responses[3])) {
      setCityList(responses[3] as string[]);
    }
  };
  const [isEditingAll, setIsEditingAll] = useState(false);

  const handleMultiSelect = (value: string) => {
    const current = Array.isArray(responses[step as keyof StepResponses])
      ? (responses[step as keyof StepResponses] as string[])
      : [];
    if (current.includes(value)) {
      setResponses({
        ...responses,
        [step]: current.filter((v) => v !== value),
      });
    } else {
      setResponses({
        ...responses,
        [step]: [...current, value],
      });
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
    if (step === 0) {
      const countObj = responses[0 as keyof StepResponses] as Travelers;
      return (
        countObj &&
        typeof countObj === "object" &&
        Object.values(countObj).some((val) => Number(val) > 0)
      );
    }
    if (step === 5) {
      const val = responses[5 as keyof StepResponses] as {
        days: number;
        nights: number;
      };
      return val && (val.days > 0 || val.nights > 0);
    }

    if (step === 12) {
      const phone = message.trim();
      return /^\d{10}$/.test(phone);
    }

    if (step === 3) return cityList.some((c) => c.trim());
    if (isSingleChoice(step)) return !!responses[step as keyof StepResponses];
    if (isMultiSelect(step))
      return (
        ((responses[step as keyof StepResponses] as string[])?.length ?? 0) > 0
      );
    // Make steps 10 and 11 optional
    if (step === 10 || step === 11) return true;
    return !!message.trim() || !!responses[step as keyof StepResponses];
  };

  const handleNext = () => {
    if (step === 3) {
      setResponses({
        ...responses,
        [step]: cityList.filter((c) => c.trim() !== ""),
      });
    } else if (step === 12) {
      setResponses({ ...responses, [step]: message.trim() }); // ensure number saved
    } else if (!responses[step as keyof StepResponses]) {
      setResponses({ ...responses, [step]: message });
    }
    setStep(step + 1);
    setMessage("");
    setError("");
  };

  const handleBack = () => {
    const previousStep = step - 1;
    setStep(previousStep);

    const prev = responses[previousStep as keyof StepResponses];
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

    const contactNumberFromResponse = responses[
      12 as keyof StepResponses
    ] as string;

    // Create the array of destinations directly from responses[3]
    const destinationArray = Array.isArray(responses[3 as keyof StepResponses])
      ? (responses[3 as keyof StepResponses] as string[]).filter(
          (c) => c.trim() !== ""
        )
      : [];

    const tripDate = responses[1 as keyof StepResponses] || "";
    const traveler = (responses[0 as keyof StepResponses] as Travelers) ?? {
      adults: 0,
      kids: 0,
      seniors: 0,
    };
    const numPeople = Object.values(traveler).reduce((a, b) => a + b, 0);

    try {
      const finalResponses = {
        ...responses,
        3: destinationArray, // <-- This ensures the full array is in the responses
      };
      const structuredResponses = Object.fromEntries(
        Object.entries(finalResponses).map(([key, val]) => [
          questions[+key],
          val,
        ])
      );

      let apiUrl = "https://desire4travels-1.onrender.com/trip-requests";
      let method = "POST";

      if (tripId) {
        apiUrl = `${apiUrl}/${tripId}`;
        method = "PUT";
      }

      const dbResponse = await axios({
        method,
        url: apiUrl,
        data: {
          responses: structuredResponses,
          tripDate,
          numPeople,
          destination: destinationArray,
          contactNumber: contactNumberFromResponse,
        },
      });

      if (method === "POST" && dbResponse.data._id) {
        setTripId(dbResponse.data._id);
      }

      const geminiResponse = await axios.post("/api/gemini", {
        responses: structuredResponses,
      });

      setItinerary(
        geminiResponse.data.itinerary || "⚠️ No itinerary returned."
      );
      if (geminiResponse.data.error) setError(geminiResponse.data.error);
    } catch (err: any) {
      setError(err?.response?.data?.error || "❌ Error fetching itinerary.");
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
  const traveler = (responses[0 as keyof StepResponses] as Travelers) ?? {
    adults: 0,
    kids: 0,
    seniors: 0,
  };

  // Save itinerary handler (simulate API call)
  const handleSaveItinerary = async () => {
    if (!/^\d{10}$/.test(contactNumber)) {
      setContactError("Please enter a valid 10-digit contact number.");
      return;
    }
    setContactError("");
    // Simulate save (replace with your API call if needed)
    try {
      if (!tripId) {
        setContactError("Trip ID not found. Please submit the trip first.");
        return;
      }

      // Send update to backend
      await axios.put(
        `https://desire4travels-1.onrender.com/trip-requests/${tripId}`,
        {
          contactNumber: contactNumber,
          itinerary: itinerary,
        }
      );

      setSaveSuccess(true);
      setShowSaveModal(false);
      setShowCopyModal(true);
    } catch (err: any) {
      console.error("Error saving itinerary:", err);
      setContactError("Failed to save itinerary. Please try again.");
    }
  };

  // Copy itinerary handler
  const handleCopyItinerary = async () => {
    if (itineraryRef.current) {
      const text = itineraryRef.current.innerText;
      await navigator.clipboard.writeText(text);
      setShowCopySuccess(true);
      setTimeout(() => setShowCopySuccess(false), 1500);
    }
  };

  return (
    <main className="main-container">
      <header className="nav">
        <div className="nav-logo">
          <a href="https://desire4travels.com/">
            Desire<span>4</span>Travels
          </a>
        </div>
      </header>

      {/* <h1 className="main-heading">🌍 Trip Planner Assistant</h1> */}
      <p className="sub-heading">
        In few simple steps get a perfectly planned itinerary for your dream
        trip
      </p>
      <div className="progress-container">
        <div className="progress-bar-outer">
          <div
            className="progress-bar-inner"
            style={{ width: `${progressPercent}%` }}
          >
            <span className="progress-float-label">{progressPercent}%</span>
          </div>
        </div>
        <div className="progress-subtext">Trip Planning Progress</div>
      </div>

      <div className="animated-bg"></div>

      {/* Simple Loader */}
      {loading && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            margin: "2rem 0",
          }}
        >
          <div className="simple-loader" />
          <span style={{ marginLeft: "12px", fontWeight: 500 }}>
            Generating...
          </span>
        </div>
      )}

      {/* Question UI */}
      {step < questions.length && (
        <div className="question-card">
          <p className="question">{questions[step]}</p>

          {/* Step 0 - Custom Counter */}
          {step === 0 && (
            <div className="center-content">
              <div className="counter-group">
                {["adults", "kids", "seniors"].map((category) => (
                  <div key={category} className="counter">
                    <label className="counter-label">
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </label>
                    <div className="counter-controls">
                      <button
                        className="counter-btn"
                        onClick={() =>
                          setResponses((prev) => ({
                            ...prev,
                            0: {
                              ...(prev[0 as keyof StepResponses] as Travelers),
                              [category as keyof Travelers]: Math.max(
                                0,
                                ((
                                  prev[0 as keyof StepResponses] as Travelers
                                )?.[category as keyof Travelers] || 0) - 1
                              ),
                            },
                          }))
                        }
                      >
                        ➖
                      </button>
                      <span className="counter-value">
                        {traveler[category as keyof Travelers]}
                      </span>
                      <button
                        className="counter-btn"
                        onClick={() =>
                          setResponses((prev) => ({
                            ...prev,
                            0: {
                              ...(prev[0 as keyof StepResponses] as Travelers),
                              [category as keyof Travelers]:
                                ((
                                  prev[0 as keyof StepResponses] as Travelers
                                )?.[category as keyof Travelers] || 0) + 1,
                            },
                          }))
                        }
                      >
                        ➕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 - Cities */}
          {step === 3 && (
            <div>
              {cityList.map((city, idx) => (
                <input
                  key={idx}
                  className="input"
                  value={city}
                  onChange={(e) => {
                    const newCities = [...cityList];
                    newCities[idx] = e.target.value;
                    setCityList(newCities);
                  }}
                  placeholder={`City ${idx + 1}`}
                />
              ))}
              <button
                className="button secondary"
                onClick={() => setCityList([...cityList, ""])}
              >
                + Add another city
              </button>
            </div>
          )}

          {/* Step 4 - Radio Options */}
          {isSingleChoice(step) && (
            <div className="center-content">
              <div className="option-group small">
                {optionsMap[step]?.map((opt) => (
                  <label
                    key={opt}
                    className={`option small  ${
                      responses[step as keyof StepResponses] === opt
                        ? "selected"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      value={opt}
                      name={`question-${step}`}
                      checked={responses[step as keyof StepResponses] === opt}
                      onChange={() =>
                        setResponses({ ...responses, [step]: opt })
                      }
                      hidden
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 6–8 - Multi-select */}
          {isMultiSelect(step) && (
            <div className="center-content">
              <div className="option-group small">
                {optionsMap[step]?.map((opt) => {
                  const selected =
                    (responses[step as keyof StepResponses] as
                      | string[]
                      | undefined) ?? [];
                  return (
                    <label
                      key={opt}
                      className={`option ${
                        selected.includes(opt) ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={opt}
                        checked={selected.includes(opt)}
                        onChange={() => handleMultiSelect(opt)}
                        hidden
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5 - Days/Nights input */}
          {step === 5 && (
            <div className="center-content">
              <div style={{ display: "flex", gap: "5rem" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <label>Days</label>
                  <input
                    type="number"
                    className="input"
                    style={{ width: "80px" }}
                    value={
                      (
                        responses[5 as keyof StepResponses] as {
                          days: number;
                          nights: number;
                        }
                      )?.days ?? 0
                    }
                    onChange={(e) => {
                      const newDays = Number(e.target.value);
                      setResponses({
                        ...responses,
                        5: {
                          days: newDays,
                          nights: Math.max(0, newDays - 1),
                        },
                      });
                    }}
                    min={0}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <label>Nights</label>
                  <input
                    type="number"
                    className="input"
                    style={{ width: "80px" }}
                    value={
                      (
                        responses[5 as keyof StepResponses] as {
                          days: number;
                          nights: number;
                        }
                      )?.nights ?? 0
                    }
                    onChange={(e) =>
                      setResponses({
                        ...responses,
                        5: {
                          days:
                            (responses[5 as keyof StepResponses] as any)
                              ?.days ?? 0,
                          nights: Number(e.target.value),
                        },
                      })
                    }
                    min={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Text/number input for steps 1, 2, 9, 10, 11 */}
          {![0, 3, 4, 5, 6, 7, 8].includes(step) && (
            <div className="center-content">
              {step === 1 ? (
                <input
                  type="date"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input"
                />
              ) : step === 9 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your answer"
                    className="input"
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontWeight: 500, color: "#6a8dff" }}>INR</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your answer"
                  className="input"
                />
              )}
            </div>
          )}

          <div className="button-row">
            {step > 0 && (
              <button className="button secondary" onClick={handleBack}>
                ⬅️ Back
              </button>
            )}
            <button
              className="button"
              onClick={handleNext}
              disabled={loading || !isStepValid()}
            >
              {step === questions.length - 1 ? "Review & Generate" : "Next ➡️"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Review Page */}
      {step === questions.length && !itinerary && !loading && (
        <div className="summary-card">
          <h2>
            📋 {isEditingAll ? "Edit Your Answers" : "Review Your Answers"}
          </h2>
          <ul className="summary-list">
            {Object.entries(responses).map(([key, value]) => {
              const stepIndex = Number(key);
              const question = questions[stepIndex];
              return (
                <li key={key} className="summary-item">
                  <strong>{question}</strong>:{" "}
                  {isEditingAll ? (
                    isSingleChoice(stepIndex) ? (
                      // Step 4: Single choice (radio)
                      <div className="option-group small">
                        {optionsMap[stepIndex]?.map((opt) => (
                          <label
                            key={opt}
                            className={`option ${
                              responses[stepIndex as keyof StepResponses] ===
                              opt
                                ? "selected"
                                : ""
                            }`}
                          >
                            <input
                              type="radio"
                              value={opt}
                              name={`edit-question-${stepIndex}`}
                              checked={
                                responses[stepIndex as keyof StepResponses] ===
                                opt
                              }
                              onChange={() =>
                                setResponses((prev) => ({
                                  ...prev,
                                  [stepIndex]: opt,
                                }))
                              }
                              hidden
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : isMultiSelect(stepIndex) ? (
                      // Step 6, 7, 8: Multi-select (checkbox)
                      <div className="option-group small">
                        {optionsMap[stepIndex]?.map((opt) => {
                          const selected =
                            (responses[stepIndex as keyof StepResponses] as
                              | string[]
                              | undefined) ?? [];
                          return (
                            <label
                              key={opt}
                              className={`option small  ${
                                selected.includes(opt) ? "selected" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                value={opt}
                                checked={selected.includes(opt)}
                                onChange={() => {
                                  const newSelected = selected.includes(opt)
                                    ? selected.filter((v) => v !== opt)
                                    : [...selected, opt];
                                  setResponses((prev) => ({
                                    ...prev,
                                    [stepIndex]: newSelected,
                                  }));
                                }}
                                hidden
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : typeof value === "object" && value !== null ? (
                      stepIndex === 0 ? (
                        // Step 0: Travelers
                        <div className="counter-group">
                          {(["adults", "kids", "seniors"] as const).map(
                            (category) => (
                              <div key={category} className="counter">
                                <label className="counter-label">
                                  {category.charAt(0).toUpperCase() +
                                    category.slice(1)}
                                </label>
                                <div className="counter-controls">
                                  <button
                                    className="counter-btn"
                                    onClick={() =>
                                      setResponses((prev) => ({
                                        ...prev,
                                        0: {
                                          ...(prev[
                                            0 as keyof StepResponses
                                          ] as Travelers),
                                          [category as keyof Travelers]:
                                            Math.max(
                                              0,
                                              ((
                                                prev[
                                                  0 as keyof StepResponses
                                                ] as Travelers
                                              )?.[
                                                category as keyof Travelers
                                              ] || 0) - 1
                                            ),
                                        },
                                      }))
                                    }
                                  >
                                    ➖
                                  </button>
                                  <span className="counter-value">
                                    {(
                                      responses[
                                        0 as keyof StepResponses
                                      ] as Travelers
                                    )?.[category] || 0}
                                  </span>
                                  <button
                                    className="counter-btn"
                                    onClick={() =>
                                      setResponses((prev) => ({
                                        ...prev,
                                        0: {
                                          ...(prev[
                                            0 as keyof StepResponses
                                          ] as Travelers),
                                          [category as keyof Travelers]:
                                            ((
                                              prev[
                                                0 as keyof StepResponses
                                              ] as Travelers
                                            )?.[category as keyof Travelers] ||
                                              0) + 1,
                                        },
                                      }))
                                    }
                                  >
                                    ➕
                                  </button>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      ) : stepIndex === 5 ? (
                        // Step 5: Days/Nights
                        <div style={{ display: "flex", gap: "2rem" }}>
                          <div>
                            <label>Days</label>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={
                                (value as { days: number; nights: number }).days
                              }
                              onChange={(e) =>
                                setResponses((prev) => ({
                                  ...prev,
                                  [stepIndex]: {
                                    days: Number(e.target.value),
                                    nights: Math.max(
                                      0,
                                      Number(e.target.value) - 1
                                    ),
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label>Nights</label>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={
                                (value as { days: number; nights: number })
                                  .nights
                              }
                              onChange={(e) =>
                                setResponses((prev) => ({
                                  ...prev,
                                  [stepIndex]: {
                                    days: (
                                      value as {
                                        days: number;
                                        nights: number;
                                      }
                                    ).days,
                                    nights: Number(e.target.value),
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        // Fallback object editor
                        <input
                          className="input"
                          type="text"
                          value={Object.entries(value)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(", ")}
                          onChange={(e) => {
                            const obj: any = {};
                            e.target.value.split(",").forEach((pair) => {
                              const [k, v] = pair
                                .split(":")
                                .map((x) => x.trim());
                              obj[k] = isNaN(Number(v)) ? v : Number(v);
                            });
                            setResponses((prev) => ({
                              ...prev,
                              [stepIndex]: obj,
                            }));
                          }}
                        />
                      )
                    ) : Array.isArray(value) ? (
                      // Step 3: City list
                      <div>
                        {cityList.map((city, idx) => (
                          <input
                            key={idx}
                            className="input"
                            value={city}
                            onChange={(e) => {
                              const newCities = [...cityList];
                              newCities[idx] = e.target.value;
                              setCityList(newCities);
                            }}
                            placeholder={`City ${idx + 1}`}
                          />
                        ))}
                        <button
                          className="button secondary"
                          onClick={() => setCityList([...cityList, ""])}
                        >
                          + Add another city
                        </button>
                      </div>
                    ) : (
                      // Text or number input fallback
                      <input
                        className="input"
                        type={typeof value === "number" ? "number" : "text"}
                        value={value}
                        onChange={(e) =>
                          setResponses((prev) => ({
                            ...prev,
                            [stepIndex]:
                              typeof value === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          }))
                        }
                      />
                    )
                  ) : (
                    <span>
                      {Array.isArray(value)
                        ? value.join(", ")
                        : typeof value === "object" && value !== null
                        ? Object.entries(value)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")
                        : String(value)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="button-row">
            {isEditingAll ? (
              <>
                <button
                  className="button secondary"
                  onClick={() => setIsEditingAll(false)}
                >
                  ❌ Cancel Edit
                </button>
                <button
                  onClick={() => {
                    setIsEditingAll(false);
                    // The handleSubmit function now handles both creation and editing.
                    handleSubmit();
                  }}
                  className="button"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-content">
                      <img
                        src="/Loader.gif"
                        alt="Loading..."
                        className="loading-gif"
                      />
                      Generating...
                    </span>
                  ) : (
                    "✅ Save & Generate"
                  )}
                </button>
              </>
            ) : (
              <>
                {/* When entering edit mode */}
                <button
                  className="button secondary"
                  onClick={() => {
                    setIsEditingAll(true);
                    syncCityListWithResponses();
                  }}
                >
                  ✏️ Edit
                </button>

                <button
                  onClick={() => {
                    setIsEditingAll(false);
                    setResponses((prev) => ({
                      ...prev,
                      3: cityList.filter((c) => c.trim() !== ""),
                    }));

                    // Start loading
                    setLoading(true);

                    // Call your submit function
                    handleSubmit();

                    // Stop loading after 5 seconds
                  }}
                  className="button"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-content">
                      <img
                        src="/Loader.gif"
                        alt="Loading..."
                        className="loading-gif"
                      />
                      Generating...
                    </span>
                  ) : (
                    "✅ Save & Generate"
                  )}
                </button>
              </>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Itinerary Result */}
      {itinerary && (
        <div className="result-card">
          <div className="result-card-header">
            <h2>🗺️ Your Trip Itinerary</h2>
            <button
              className="button"
              onClick={() => {
                setShowCopyModal(true); // directly open copy modal
                setShowSaveModal(false); // make sure contact modal never shows
                setContactError("");
                setSaveSuccess(false);
              }}
            >
              Save this Itinerary
            </button>
          </div>

          <div className="itinerary-box markdown-body" ref={itineraryRef}>
            <ReactMarkdown>{itinerary}</ReactMarkdown>
          </div>

          <button className="button" onClick={handleBackToStart}>
            🔄 Plan Another Trip
          </button>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Enter your 10-digit contact number</h3>
            <input
              className="input"
              type="tel"
              maxLength={10}
              value={contactNumber}
              onChange={(e) =>
                setContactNumber(e.target.value.replace(/\D/g, ""))
              }
              placeholder="Contact Number"
            />
            {contactError && <p className="error">{contactError}</p>}

            <div className="modal-actions">
              <button className="button" onClick={handleSaveItinerary}>
                Save
              </button>
              <button
                className="button secondary"
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Success Popup */}
      {showCopySuccess && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              ✅ Itinerary copied to clipboard!
              <br />
              Now you can paste this itinerary into <strong>
                WhatsApp
              </strong>{" "}
              💬, a <strong>Word file</strong> 📄, or anywhere else from your{" "}
              <strong>Clipboard</strong> 📋 for saving.
            </p>
          </div>
        </div>
      )}

      {showCopyModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Copy Your Itinerary</h3>
            <div
              className="itinerary-box"
              style={{
                maxHeight: 200,
                overflowY: "auto",
                marginBottom: "1rem",
                fontSize: "0.75rem",
              }}
            >
              <div ref={itineraryModalRef}>
                <ReactMarkdown>{itinerary}</ReactMarkdown>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="button"
                onClick={async () => {
                  if (itineraryModalRef.current) {
                    const text = itineraryModalRef.current.innerText;
                    await navigator.clipboard.writeText(text);
                    setShowCopyModal(false);
                    setShowCopySuccess(true); // show success message
                    setTimeout(() => setShowCopySuccess(false), 2500);
                  }
                }}
              >
                📋 Copy Itinerary
              </button>
              <button
                className="button secondary"
                onClick={() => setShowCopyModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
