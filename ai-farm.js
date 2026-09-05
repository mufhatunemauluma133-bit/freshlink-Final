const BACKEND_ENDPOINT = "/api/farm-ai";

const FARM_KEYWORDS = [
    "farm", "farming", "crop", "crops", "soil", "irrigation", "fertilizer", "pest", "disease",
    "livestock", "cattle", "goat", "sheep", "chicken", "egg", "milk", "dairy", "aquaculture",
    "harvest", "yield", "market", "price", "greenhouse", "orchard", "vegetable", "fruit", "maize",
    "tomato", "potato", "citrus", "avocado", "herb", "spice"
];

const locationProfiles = [
    { match: ["south africa", "limpopo", "gauteng", "mpumalanga", "north west", "kwazulu", "eastern cape", "western cape"], best: ["Citrus", "Avocados", "Maize", "Tomatoes", "Poultry", "Dairy"] },
    { match: ["zimbabwe", "harare", "bulawayo"], best: ["Maize", "Groundnuts", "Cattle", "Tomatoes", "Horticulture"] },
    { match: ["kenya", "nairobi", "nakuru"], best: ["Dairy", "Avocados", "Potatoes", "Poultry", "Beans"] },
    { match: ["uganda", "kampala"], best: ["Bananas", "Coffee", "Poultry", "Fish Farming", "Dairy"] },
    { match: ["nigeria", "lagos", "abuja"], best: ["Cassava", "Rice", "Poultry", "Catfish", "Tomatoes"] },
    { match: ["india", "punjab", "maharashtra"], best: ["Rice", "Wheat", "Dairy", "Poultry", "Vegetables"] },
    { match: ["brazil", "sao paulo"], best: ["Soybeans", "Maize", "Cattle", "Poultry", "Sugarcane"] }
];

const aiQuestion = document.getElementById("aiQuestion");
const askAiBtn = document.getElementById("askAiBtn");
const aiAnswer = document.getElementById("aiAnswer");
const speakAiBtn = document.getElementById("speakAiBtn");
const stopVoiceBtn = document.getElementById("stopVoiceBtn");
const locationInput = document.getElementById("locationInput");
const detectLocationBtn = document.getElementById("detectLocationBtn");
const profitBtn = document.getElementById("profitBtn");
const profitAnswer = document.getElementById("profitAnswer");
const imagePrompt = document.getElementById("imagePrompt");
const generateImageBtn = document.getElementById("generateImageBtn");
const generatedImage = document.getElementById("generatedImage");
const imageStatus = document.getElementById("imageStatus");

function setText(el, message) {
    if (el) el.textContent = message;
}

function speakAnswer(text) {
    if (!text || !window.speechSynthesis) return false;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.pitch = 1.08;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) => /en(-|_)?(us|gb|au)/i.test(voice.lang) && /(female|samantha|victoria|zira|susan|jenny|ava|emma|hazel|jessica|rose|olivia|alice)/i.test(voice.name)) || voices.find((voice) => /en(-|_)?(us|gb|au)/i.test(voice.lang)) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
        if (stopVoiceBtn) stopVoiceBtn.style.display = "none";
    };

    utterance.onerror = () => {
        if (stopVoiceBtn) stopVoiceBtn.style.display = "none";
    };

    window.speechSynthesis.speak(utterance);
    if (stopVoiceBtn) stopVoiceBtn.style.display = "inline-block";
    return true;
}

function stopVoiceOutput() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    if (stopVoiceBtn) stopVoiceBtn.style.display = "none";
}

function getLocalFarmAnswer(question) {
    const q = String(question || "").trim();

    if (!q) {
        return "I am here to help. Ask me anything and I will answer clearly and usefully.";
    }

    const lower = q.toLowerCase();

    if (/\b(hello|hi|hey|greetings|good morning|good afternoon|good evening)\b/.test(lower)) {
        return "Hello! I am here to help with questions, ideas, explanations, planning, and problem-solving. Tell me what you need, and I will respond clearly.";
    }

    if (lower.includes("plant") || lower.includes("grow") || lower.includes("crop") || lower.includes("seed") || lower.includes("garden") || lower.includes("livestock") || lower.includes("cow") || lower.includes("goat") || lower.includes("sheep") || lower.includes("chicken") || lower.includes("pig") || lower.includes("animal")) {
        return "That is a practical question. The best answer is usually to focus on what fits your situation, the main risks, and the simplest next step. If you share your location or the exact crop or animal, I can make the guidance more specific and useful.";
    }

    if (lower.includes("business") || lower.includes("company") || lower.includes("buyer") || lower.includes("market") || lower.includes("recruit") || lower.includes("partner") || lower.includes("invest")) {
        return "That is a strong business-focused question. A helpful answer would usually cover the goal, the audience, the value being offered, and the next practical step. If you want, I can help you turn it into a clear action plan.";
    }

    return "That is a great question. The best way to answer it is to start with the core idea, explain the important details clearly, and then give the most useful next step. If you want, I can also give you a short answer, a detailed explanation, or a step-by-step plan.";
}

function getLocationRecommendations(locationText) {
    const location = String(locationText || "").toLowerCase().trim();
    if (!location) {
        return {
            label: "Unknown location",
            crops: ["Maize", "Tomatoes", "Poultry", "Leafy Vegetables", "Dairy"],
            note: "These are general options. Add your exact district for better guidance."
        };
    }

    const profile = locationProfiles.find((item) => item.match.some((m) => location.includes(m)));
    if (profile) {
        return {
            label: locationText,
            crops: profile.best,
            note: "Suggested by climate and market patterns in your region."
        };
    }

    return {
        label: locationText,
        crops: ["Vegetables", "Poultry", "Goat Farming", "Herbs and Spices", "Fruit Trees"],
        note: "Custom profile not found. These are resilient, market-friendly options for many regions."
    };
}

async function askBackendAi(question, mode = "chat") {
    const response = await fetch(BACKEND_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ question, mode })
    });

    if (!response.ok) {
        throw new Error("Backend AI request failed");
    }

    const payload = await response.json();
    return typeof payload?.answer === "string" ? payload.answer.trim() : null;
}

async function handleAskAi() {
    const question = String(aiQuestion?.value || "").trim();
    if (!question) {
        setText(aiAnswer, "Type a farming question first.");
        return;
    }

    setText(aiAnswer, "Thinking about your farm question...");

    try {
        const backendAnswer = await askBackendAi(question, "chat");
        if (backendAnswer) {
            setText(aiAnswer, backendAnswer);
            speakAnswer(backendAnswer);
            return;
        }
    } catch {
        // Fall back to local answer if the backend is unavailable.
    }

    const fallbackAnswer = getLocalFarmAnswer(question);
    setText(aiAnswer, fallbackAnswer);
    speakAnswer(fallbackAnswer);
}

async function detectLocation() {
    if (!navigator.geolocation) {
        setText(profitAnswer, "Geolocation is not supported on this device.");
        return;
    }

    setText(profitAnswer, "Detecting your location...");

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await response.json();
            const place = data?.address?.state || data?.address?.city || data?.address?.country || "Your location";
            if (locationInput) locationInput.value = place;
            setText(profitAnswer, `Location detected: ${place}. Tap \"Get profitable farm ideas\".`);
        } catch {
            setText(profitAnswer, "Could not resolve your location name. You can type it manually.");
        }
    }, (error) => {
        setText(profitAnswer, `Location permission error: ${error.message}`);
    });
}

function getProfitPlan() {
    const locationText = String(locationInput?.value || "").trim();
    const recommendation = getLocationRecommendations(locationText);
    const lines = [
        `Location: ${recommendation.label}`,
        "Top profitable options:",
        ...recommendation.crops.map((c, i) => `${i + 1}. ${c}`),
        "",
        `Why: ${recommendation.note}`,
        "Profit tip: start with one high-demand crop/livestock line, track weekly input costs, and secure buyers before harvest."
    ];

    setText(profitAnswer, lines.join("\n"));
}

async function generateImage() {
    const prompt = String(imagePrompt?.value || "").trim();
    if (!prompt) {
        setText(imageStatus, "Enter a farm image prompt first.");
        return;
    }

    setText(imageStatus, "Connecting to the farm image service...");

    try {
        const backendAnswer = await askBackendAi(prompt, "image");
        if (backendAnswer) {
            setText(imageStatus, backendAnswer);
            return;
        }
    } catch {
        // Fall back to a simple local preview message.
    }

    setText(imageStatus, "Image service is temporarily unavailable. Please try again shortly.");
}

if (askAiBtn) askAiBtn.addEventListener("click", handleAskAi);
if (speakAiBtn) {
    speakAiBtn.addEventListener("click", () => {
        const text = String(aiAnswer?.textContent || "").trim();
        if (text) speakAnswer(text);
    });
}
if (stopVoiceBtn) stopVoiceBtn.addEventListener("click", stopVoiceOutput);
if (detectLocationBtn) detectLocationBtn.addEventListener("click", detectLocation);
if (profitBtn) profitBtn.addEventListener("click", getProfitPlan);
if (generateImageBtn) generateImageBtn.addEventListener("click", generateImage);

setText(aiAnswer, "Ask any farming question to get started.");
setText(profitAnswer, "Add your location and get profitable farm ideas.");
