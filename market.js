const symbolInput = document.getElementById("symbolInput");
const loadBtn = document.getElementById("loadBtn");
const providerSelect = document.getElementById("providerSelect");

const dataTypeChip = document.getElementById("dataTypeChip");
const marketStatusChip = document.getElementById("marketStatusChip");
const providerChip = document.getElementById("providerChip");

const symbolSuggestions = document.getElementById("symbolSuggestions");
const terminalView = document.getElementById("terminalView");
const emptyState = document.getElementById("emptyState");
const errorBox = document.getElementById("errorBox");
const loadingBox = document.getElementById("loadingBox");

const symbolTitle = document.getElementById("symbolTitle");
const symbolVenue = document.getElementById("symbolVenue");
const currentPrice = document.getElementById("currentPrice");
const priceCurrency = document.getElementById("priceCurrency");
const changeValue = document.getElementById("changeValue");
const changePercent = document.getElementById("changePercent");
const highValue = document.getElementById("highValue");
const lowValue = document.getElementById("lowValue");
const volumeValue = document.getElementById("volumeValue");
const openValue = document.getElementById("openValue");

const timestampMeta = document.getElementById("timestampMeta");
const latencyMeta = document.getElementById("latencyMeta");
const refreshMeta = document.getElementById("refreshMeta");
const vvipPanel = document.getElementById("vvipPanel");

const rangeBar = document.getElementById("rangeBar");
const chartTilt = document.getElementById("chartTilt");
const chartCanvas = document.getElementById("terminalChart");
const chartHover = document.getElementById("chartHover");

const ctx = chartCanvas ? chartCanvas.getContext("2d") : null;

const DEFAULT_SYMBOLS = [
    { symbol: "maize", label: "Maize", venue: "Food Benchmark" },
    { symbol: "wheat", label: "Wheat", venue: "Food Benchmark" },
    { symbol: "rice", label: "Rice", venue: "Food Benchmark" },
    { symbol: "coffee", label: "Coffee", venue: "Food Benchmark" },
    { symbol: "sugar", label: "Sugar", venue: "Food Benchmark" },
    { symbol: "orange", label: "Orange", venue: "Fruit Benchmark" }
];

const PRODUCE_MARKET_MAP = {
    maize: {
        label: "Maize",
        unit: "per bushel",
        benchmark: "Corn Futures",
        aliases: ["maize", "corn"],
        tw: ["CORN", "ZC", "ZC1!"],
        fh: ["CME_MINI:ZC1!", "CBOT:ZC1!", "CME:ZC1!"]
    },
    wheat: {
        label: "Wheat",
        unit: "per bushel",
        benchmark: "Wheat Futures",
        aliases: ["wheat"],
        tw: ["WHEAT", "ZW", "ZW1!"],
        fh: ["CBOT:ZW1!", "CME:ZW1!"]
    },
    rice: {
        label: "Rice",
        unit: "per cwt",
        benchmark: "Rough Rice Futures",
        aliases: ["rice"],
        tw: ["RICE", "ZR", "ZR1!"],
        fh: ["CBOT:ZR1!", "CME:ZR1!"]
    },
    soybean: {
        label: "Soybean",
        unit: "per bushel",
        benchmark: "Soybean Futures",
        aliases: ["soybean", "soy", "soya"],
        tw: ["SOYBEAN", "ZS", "ZS1!"],
        fh: ["CBOT:ZS1!", "CME:ZS1!"]
    },
    sugar: {
        label: "Sugar",
        unit: "per lb",
        benchmark: "Sugar No.11 Futures",
        aliases: ["sugar"],
        tw: ["SUGAR", "SB", "SB1!"],
        fh: ["ICE:SB1!"]
    },
    coffee: {
        label: "Coffee",
        unit: "per lb",
        benchmark: "Coffee C Futures",
        aliases: ["coffee"],
        tw: ["COFFEE", "KC", "KC1!"],
        fh: ["ICE:KC1!"]
    },
    cocoa: {
        label: "Cocoa",
        unit: "per metric ton",
        benchmark: "Cocoa Futures",
        aliases: ["cocoa"],
        tw: ["COCOA", "CC", "CC1!"],
        fh: ["ICE:CC1!"]
    },
    orange: {
        label: "Orange",
        unit: "per lb",
        benchmark: "Orange Juice Futures",
        aliases: ["orange", "oranges", "citrus"],
        tw: ["OJ", "OJ1!", "ORANGE_JUICE"],
        fh: ["ICE:OJ1!"]
    },
    banana: {
        label: "Banana",
        unit: "benchmark proxy",
        benchmark: "Sugar & Citrus Basket",
        aliases: ["banana", "bananas"],
        tw: ["SB", "OJ"],
        fh: ["ICE:SB1!", "ICE:OJ1!"]
    },
    tomato: {
        label: "Tomato",
        unit: "benchmark proxy",
        benchmark: "Vegetable Basket Proxy",
        aliases: ["tomato", "tomatoes"],
        tw: ["CORN", "WHEAT"],
        fh: ["CME_MINI:ZC1!", "CBOT:ZW1!"]
    },
    apple: {
        label: "Apple",
        unit: "benchmark proxy",
        benchmark: "Fruit Basket Proxy",
        aliases: ["apple", "apples"],
        tw: ["OJ", "SB"],
        fh: ["ICE:OJ1!", "ICE:SB1!"]
    }
};

const RANGE_CONFIG = {
    "1D": { tw: { interval: "5min", outputsize: 96 }, fh: { resolution: "5", days: 1 } },
    "1W": { tw: { interval: "30min", outputsize: 120 }, fh: { resolution: "30", days: 7 } },
    "1M": { tw: { interval: "1day", outputsize: 35 }, fh: { resolution: "D", days: 31 } },
    "6M": { tw: { interval: "1day", outputsize: 190 }, fh: { resolution: "D", days: 190 } },
    "1Y": { tw: { interval: "1week", outputsize: 56 }, fh: { resolution: "W", days: 370 } },
    "5Y": { tw: { interval: "1month", outputsize: 70 }, fh: { resolution: "M", days: 365 * 5 + 5 } }
};

const MARKET_CONFIG = {
    proxyBaseUrl: String(window.FRESHLINK_MARKET_PROXY_URL || "").trim(),
    directApiKey: String(window.FRESHLINK_MARKET_API_KEY || localStorage.getItem("freshlink_market_api_key") || "").trim(),
    provider: localStorage.getItem("freshlink_market_provider") || "twelvedata"
};

let currentSymbol = "maize";
let currentProvider = MARKET_CONFIG.provider;
let currentRange = "1D";
let autoRefreshTimer = null;
let currentArea = {
    country: "Unknown",
    city: "Unknown",
    confidence: "estimated"
};
let chartState = {
    points: [],
    aiPoints: [],
    labels: [],
    direction: "neutral",
    previousClose: null,
    hoverIndex: null,
    latestQuote: null
};

function showError(message) {
    if (!errorBox) return;
    errorBox.style.display = "block";
    errorBox.textContent = message;
}

function hideError() {
    if (!errorBox) return;
    errorBox.style.display = "none";
    errorBox.textContent = "";
}

function setLoading(loading, text = "Loading market feed...") {
    if (!loadingBox) return;
    loadingBox.style.display = loading ? "block" : "none";
    loadingBox.textContent = text;
}

function formatNumber(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return num.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatVolume(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";

    if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return String(Math.round(num));
}

function sanitizeSymbol(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.\-:]/g, "").substring(0, 18);
}

function normalizeProduceQuery(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ").substring(0, 32);
}

function findProduceConfig(query) {
    const normalized = normalizeProduceQuery(query);
    if (!normalized) return null;

    const direct = PRODUCE_MARKET_MAP[normalized];
    if (direct) return { key: normalized, config: direct };

    const keys = Object.keys(PRODUCE_MARKET_MAP);
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const aliases = PRODUCE_MARKET_MAP[key]?.aliases || [];
        if (aliases.includes(normalized)) {
            return { key, config: PRODUCE_MARKET_MAP[key] };
        }
    }

    return null;
}

const AREA_MULTIPLIERS = {
    "south africa": 1.0,
    "zimbabwe": 1.08,
    "kenya": 1.05,
    "uganda": 1.06,
    "nigeria": 1.12,
    "india": 0.92,
    "pakistan": 0.94,
    "bangladesh": 0.91,
    "brazil": 1.14,
    "mexico": 1.11,
    "united states": 1.2,
    "canada": 1.19,
    "australia": 1.22,
    "united kingdom": 1.26,
    "germany": 1.25,
    "france": 1.24,
    "japan": 1.28,
    "china": 0.98,
    "thailand": 0.96
};

const PRODUCE_MULTIPLIERS = {
    maize: 1.0,
    wheat: 1.0,
    rice: 1.0,
    soybean: 1.03,
    sugar: 1.04,
    coffee: 1.07,
    cocoa: 1.08,
    orange: 1.06,
    banana: 1.05,
    tomato: 1.02,
    apple: 1.04
};

const REFERENCE_PRICES_ZAR = {
    maize: 5200,
    wheat: 6100,
    rice: 4800,
    soybean: 7200,
    sugar: 18.4,
    coffee: 5.7,
    cocoa: 8200,
    orange: 2.9,
    banana: 11.5,
    tomato: 14.8,
    apple: 22.5
};

function hashText(value) {
    return Array.from(String(value || "")).reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function buildReferenceMarketData(query, range) {
    const produce = findProduceConfig(query);
    const produceKey = produce?.key || normalizeProduceQuery(query) || "produce";
    const config = produce?.config;
    const label = config?.label || String(query).trim().toUpperCase();
    const basePrice = REFERENCE_PRICES_ZAR[produceKey] || 100;
    const rangeSize = RANGE_CONFIG[range]?.tw?.outputsize || 96;
    const pointCount = Math.min(96, Math.max(24, Math.round(rangeSize / 2)));
    const seed = hashText(produceKey);
    const trend = ((seed % 17) - 8) / 1000;
    const volatility = 0.012 + ((seed % 9) / 1000);
    const now = Date.now();
    const stepMs = range === "1D" ? 15 * 60 * 1000 : range === "1W" ? 2 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    let previousClose = basePrice;
    const series = Array.from({ length: pointCount }, (_, index) => {
        const wave = Math.sin((index + seed) / 4.5) * volatility;
        const drift = trend * index;
        const close = basePrice * (1 + wave + drift);
        const previous = index === 0 ? close * 0.997 : previousClose;
        previousClose = close;
        return {
            t: new Date(now - (pointCount - index) * stepMs).toISOString(),
            c: close,
            h: close * 1.006,
            l: close * 0.994,
            o: previous,
            v: Math.round(8000 + ((seed + index * 137) % 42000))
        };
    });

    const latest = series[series.length - 1];
    const lastClose = series[series.length - 2]?.c || latest.c;
    const change = latest.c - lastClose;

    return {
        quote: {
            symbol: produceKey,
            displayName: label,
            venue: config?.benchmark || "FreshLink reference model",
            currency: "ZAR",
            price: latest.c,
            change,
            percent: (change / lastClose) * 100,
            high: latest.h,
            low: latest.l,
            open: latest.o,
            previousClose: lastClose,
            volume: latest.v,
            marketStatus: "Reference estimate",
            quality: "FreshLink reference estimate. Not a live spot price.",
            qualityMode: "reference",
            timestamp: latest.t,
            direction: change > 0 ? "up" : change < 0 ? "down" : "neutral"
        },
        series,
        matchedSymbol: produceKey,
        sourceMode: "reference-estimate",
        produceKey,
        produceLabel: label,
        produceBenchmark: config?.benchmark || "FreshLink reference model"
    };
}

async function detectUserArea() {
    if (!navigator.geolocation) {
        currentArea = { country: "Unknown", city: "Unknown", confidence: "estimated" };
        return currentArea;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 120000
            });
        });

        const lat = Number(position.coords?.latitude);
        const lon = Number(position.coords?.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            throw new Error("Invalid coordinates");
        }

        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
        const response = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Location reverse lookup failed (${response.status})`);
        }

        const data = await response.json();
        const address = data?.address || {};
        const city = String(address.city || address.town || address.village || address.state || "Unknown");
        const country = String(address.country || "Unknown");

        currentArea = { country, city, confidence: "geo" };
        return currentArea;
    } catch {
        currentArea = { country: "Unknown", city: "Unknown", confidence: "estimated" };
        return currentArea;
    }
}

function getAreaMultiplier(country) {
    const key = String(country || "").trim().toLowerCase();
    return AREA_MULTIPLIERS[key] || 1.0;
}

function generateAiLocalizedSeries(baseSeries, produceKey, area) {
    if (!Array.isArray(baseSeries) || baseSeries.length < 2) return [];

    const areaFactor = getAreaMultiplier(area?.country);
    const produceFactor = PRODUCE_MULTIPLIERS[produceKey] || 1.0;
    const rangePulse = currentRange === "1D" ? 0.003 : currentRange === "1W" ? 0.005 : 0.008;

    return baseSeries.map((point, idx) => {
        const c = Number(point.c);
        if (!Number.isFinite(c)) return null;

        const seasonalWave = Math.sin((idx + 1) * 0.5) * rangePulse * c;
        const aiAdjusted = c * areaFactor * produceFactor + seasonalWave;

        return {
            ...point,
            c: Number(aiAdjusted.toFixed(4))
        };
    }).filter(Boolean);
}

function toDateString(ts) {
    if (!ts) return "--";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
}

function getFeatureRefreshMs(tier) {
    if (tier === "vvip_premium") return 10000;
    if (tier === "premium_plus") return 20000;
    return 45000;
}

function updateChip(element, text, mode = "") {
    if (!element) return;
    element.className = `chip ${mode}`.trim();
    element.textContent = text;
}

function applyPricePulse(direction) {
    const nodes = [currentPrice, changeValue, changePercent].filter(Boolean);
    const removeClasses = () => {
        nodes.forEach((node) => {
            node.classList.remove("pulse-up", "pulse-down", "value-up", "value-down");
        });
    };

    removeClasses();
    if (direction === "up") {
        nodes.forEach((node) => {
            node.classList.add("pulse-up", "value-up");
        });
        return;
    }

    if (direction === "down") {
        nodes.forEach((node) => {
            node.classList.add("pulse-down", "value-down");
        });
    }
}

function setTerminalVisible(visible) {
    if (terminalView) terminalView.style.display = visible ? "block" : "none";
    if (emptyState) emptyState.style.display = visible ? "none" : "block";
}

function renderSymbolSuggestions() {
    if (!symbolSuggestions) return;

    symbolSuggestions.innerHTML = DEFAULT_SYMBOLS.map((item) => {
        return `<button class="symbol-pill" data-symbol="${item.symbol}" type="button">${item.label} • ${item.symbol}</button>`;
    }).join("");

    symbolSuggestions.querySelectorAll(".symbol-pill").forEach((btn) => {
        btn.addEventListener("click", () => {
            const symbol = sanitizeSymbol(btn.getAttribute("data-symbol"));
            if (!symbol) return;
            symbolInput.value = symbol;
            loadMarket(symbol, currentRange, true);
        });
    });
}

async function fetchProduceProxy(itemKey, range) {
    if (!hasProxy()) {
        throw new Error("No licensed produce proxy configured.");
    }

    const quoteUrl = buildProxyUrl("/produce-quote", { item: itemKey, range, provider: currentProvider });
    const seriesUrl = buildProxyUrl("/produce-series", { item: itemKey, range, provider: currentProvider });

    const [quoteRaw, seriesRaw] = await Promise.all([
        requestJson(quoteUrl),
        requestJson(seriesUrl)
    ]);

    const quote = {
        symbol: String(quoteRaw?.symbol || itemKey).toUpperCase(),
        displayName: quoteRaw?.displayName || quoteRaw?.item || itemKey,
        venue: quoteRaw?.venue || "Licensed Produce Feed",
        currency: quoteRaw?.currency || "ZAR",
        price: Number(quoteRaw?.price),
        change: Number(quoteRaw?.change),
        percent: Number(quoteRaw?.percent),
        high: Number(quoteRaw?.high),
        low: Number(quoteRaw?.low),
        open: Number(quoteRaw?.open),
        previousClose: Number(quoteRaw?.previousClose),
        volume: Number(quoteRaw?.volume),
        marketStatus: String(quoteRaw?.marketStatus || "Open/Recent"),
        quality: String(quoteRaw?.quality || "Licensed produce feed"),
        qualityMode: String(quoteRaw?.qualityMode || "live"),
        timestamp: quoteRaw?.timestamp || new Date().toISOString(),
        direction: Number(quoteRaw?.change) > 0 ? "up" : Number(quoteRaw?.change) < 0 ? "down" : "neutral"
    };

    const pointsRaw = Array.isArray(seriesRaw?.points) ? seriesRaw.points : [];
    const series = pointsRaw
        .map((point) => {
            const c = Number(point?.c ?? point?.close);
            if (!Number.isFinite(c)) return null;
            return {
                t: point?.t || point?.time || point?.timestamp || new Date().toISOString(),
                c,
                h: Number(point?.h ?? point?.high),
                l: Number(point?.l ?? point?.low),
                o: Number(point?.o ?? point?.open),
                v: Number(point?.v ?? point?.volume)
            };
        })
        .filter(Boolean);

    if (!series.length) {
        throw new Error("Licensed produce proxy returned no chart points.");
    }

    return { quote, series, matchedSymbol: quote.symbol, sourceMode: "licensed-produce" };
}

async function fetchByCandidateSymbols(candidates, range) {
    const unique = Array.from(new Set(candidates.filter(Boolean)));
    let lastError = null;

    for (let i = 0; i < unique.length; i += 1) {
        const candidate = String(unique[i]).trim();
        if (!candidate) continue;

        try {
            const payload = await fetchMarketData(candidate, range);
            return { ...payload, matchedSymbol: candidate, sourceMode: "benchmark-futures" };
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    throw new Error("No valid market symbol candidates were found for this produce item.");
}

function getApiKey() {
    return String(window.FRESHLINK_MARKET_API_KEY || localStorage.getItem("freshlink_market_api_key") || "").trim();
}

function hasProxy() {
    return MARKET_CONFIG.proxyBaseUrl.length > 0;
}

async function requestJson(url) {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Market API request failed (${response.status}): ${body.substring(0, 220)}`);
    }

    return response.json();
}

function buildProxyUrl(path, params) {
    const base = MARKET_CONFIG.proxyBaseUrl.replace(/\/$/, "");
    const query = new URLSearchParams(params).toString();
    return `${base}${path}?${query}`;
}

async function fetchQuoteTwelveData(symbol) {
    if (hasProxy()) {
        const url = buildProxyUrl("/quote", { symbol, provider: "twelvedata" });
        return requestJson(url);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Missing market API key. Add window.FRESHLINK_MARKET_API_KEY or freshlink_market_api_key in localStorage.");
    }

    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
    return requestJson(url);
}

async function fetchSeriesTwelveData(symbol, range) {
    const conf = RANGE_CONFIG[range]?.tw || RANGE_CONFIG["1D"].tw;
    if (hasProxy()) {
        const url = buildProxyUrl("/series", {
            symbol,
            provider: "twelvedata",
            interval: conf.interval,
            outputsize: String(conf.outputsize)
        });
        return requestJson(url);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Missing market API key. Add window.FRESHLINK_MARKET_API_KEY or freshlink_market_api_key in localStorage.");
    }

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(conf.interval)}&outputsize=${encodeURIComponent(conf.outputsize)}&apikey=${encodeURIComponent(apiKey)}`;
    return requestJson(url);
}

async function fetchQuoteFinnhub(symbol) {
    if (hasProxy()) {
        const url = buildProxyUrl("/quote", { symbol, provider: "finnhub" });
        return requestJson(url);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Missing market API key. Add window.FRESHLINK_MARKET_API_KEY or freshlink_market_api_key in localStorage.");
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
    return requestJson(url);
}

async function fetchSeriesFinnhub(symbol, range) {
    const conf = RANGE_CONFIG[range]?.fh || RANGE_CONFIG["1D"].fh;
    const now = Math.floor(Date.now() / 1000);
    const from = now - conf.days * 24 * 60 * 60;

    if (hasProxy()) {
        const url = buildProxyUrl("/series", {
            symbol,
            provider: "finnhub",
            resolution: conf.resolution,
            from: String(from),
            to: String(now)
        });
        return requestJson(url);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Missing market API key. Add window.FRESHLINK_MARKET_API_KEY or freshlink_market_api_key in localStorage.");
    }

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(conf.resolution)}&from=${from}&to=${now}&token=${encodeURIComponent(apiKey)}`;
    return requestJson(url);
}

function normalizeTwelveDataQuote(symbol, raw) {
    const last = Number(raw?.close);
    const prev = Number(raw?.previous_close);
    const change = Number(raw?.change);
    const percent = Number(raw?.percent_change);

    const isUp = Number.isFinite(change) ? change > 0 : false;
    const isDown = Number.isFinite(change) ? change < 0 : false;

    return {
        symbol,
        displayName: String(raw?.name || symbol),
        venue: String(raw?.exchange || raw?.mic_code || "Unknown Exchange"),
        currency: String(raw?.currency || "ZAR"),
        price: Number.isFinite(last) ? last : null,
        change: Number.isFinite(change) ? change : null,
        percent: Number.isFinite(percent) ? percent : null,
        high: Number(raw?.high),
        low: Number(raw?.low),
        open: Number(raw?.open),
        previousClose: Number.isFinite(prev) ? prev : null,
        volume: Number(raw?.volume),
        marketStatus: String(raw?.is_market_open === true ? "Open" : raw?.is_market_open === false ? "Closed" : "Unknown"),
        quality: "Exchange policy dependent (real-time or delayed)",
        qualityMode: "delayed",
        timestamp: raw?.datetime || raw?.timestamp || new Date().toISOString(),
        direction: isUp ? "up" : isDown ? "down" : "neutral"
    };
}

function normalizeTwelveDataSeries(raw) {
    const values = Array.isArray(raw?.values) ? raw.values : [];
    const points = values
        .map((row) => {
            const close = Number(row?.close);
            if (!Number.isFinite(close)) return null;
            return {
                t: row?.datetime || row?.date || "",
                c: close,
                h: Number(row?.high),
                l: Number(row?.low),
                o: Number(row?.open),
                v: Number(row?.volume)
            };
        })
        .filter(Boolean)
        .reverse();

    return points;
}

function normalizeFinnhubQuote(symbol, raw) {
    const current = Number(raw?.c);
    const prevClose = Number(raw?.pc);
    const high = Number(raw?.h);
    const low = Number(raw?.l);
    const open = Number(raw?.o);
    const delta = Number(raw?.d);
    const dp = Number(raw?.dp);

    return {
        symbol,
        displayName: symbol,
        venue: symbol.endsWith(".JO") ? "JSE" : "Exchange",
        currency: symbol.endsWith(".JO") ? "ZAR" : "USD",
        price: Number.isFinite(current) ? current : null,
        change: Number.isFinite(delta) ? delta : null,
        percent: Number.isFinite(dp) ? dp : null,
        high,
        low,
        open,
        previousClose: Number.isFinite(prevClose) ? prevClose : null,
        volume: null,
        marketStatus: Number(raw?.t) > 0 ? "Open/Recent" : "Unknown",
        quality: "Provider feed (usually delayed on free plans)",
        qualityMode: "delayed",
        timestamp: Number(raw?.t) > 0 ? new Date(Number(raw.t) * 1000).toISOString() : new Date().toISOString(),
        direction: Number.isFinite(delta) ? (delta > 0 ? "up" : delta < 0 ? "down" : "neutral") : "neutral"
    };
}

function normalizeFinnhubSeries(raw) {
    const t = Array.isArray(raw?.t) ? raw.t : [];
    const c = Array.isArray(raw?.c) ? raw.c : [];
    const h = Array.isArray(raw?.h) ? raw.h : [];
    const l = Array.isArray(raw?.l) ? raw.l : [];
    const o = Array.isArray(raw?.o) ? raw.o : [];
    const v = Array.isArray(raw?.v) ? raw.v : [];

    const points = [];
    for (let i = 0; i < t.length; i += 1) {
        const close = Number(c[i]);
        if (!Number.isFinite(close)) continue;

        points.push({
            t: new Date(Number(t[i]) * 1000).toISOString(),
            c: close,
            h: Number(h[i]),
            l: Number(l[i]),
            o: Number(o[i]),
            v: Number(v[i])
        });
    }

    return points;
}

function getSeriesVolume(points) {
    if (!Array.isArray(points) || !points.length) return null;
    const latest = points[points.length - 1];
    return Number.isFinite(latest?.v) ? latest.v : null;
}

function renderQuote(quote, isVvip, sourceMode = "") {
    symbolTitle.textContent = quote.displayName || quote.symbol;
    symbolVenue.textContent = `${quote.symbol} • ${quote.venue}`;
    currentPrice.textContent = quote.price !== null ? formatNumber(quote.price, 2) : "--";
    priceCurrency.textContent = quote.currency || "--";

    const changeText = quote.change !== null ? `${quote.change > 0 ? "+" : ""}${formatNumber(quote.change, 2)}` : "--";
    const percentText = quote.percent !== null ? `${quote.percent > 0 ? "+" : ""}${formatNumber(quote.percent, 2)}%` : "--";

    changeValue.textContent = changeText;
    changePercent.textContent = percentText;

    highValue.textContent = Number.isFinite(quote.high) ? formatNumber(quote.high, 2) : "--";
    lowValue.textContent = Number.isFinite(quote.low) ? formatNumber(quote.low, 2) : "--";
    openValue.textContent = Number.isFinite(quote.open) ? formatNumber(quote.open, 2) : "--";
    volumeValue.textContent = quote.volume !== null ? formatVolume(quote.volume) : "--";

    const providerLabel = sourceMode === "reference-estimate"
        ? "FreshLink reference model"
        : currentProvider === "twelvedata" ? "Twelve Data" : "Finnhub";
    updateChip(providerChip, `Provider: ${providerLabel}`);

    const dataMode = quote.qualityMode === "reference" ? "reference" : isVvip ? "live" : (quote.qualityMode === "live" ? "live" : "delayed");
    const dataLabel = dataMode === "live" ? "Real-time feed" : dataMode === "reference" ? "Reference estimate" : "Delayed feed";
    updateChip(dataTypeChip, dataLabel, dataMode);

    const marketMode = String(quote.marketStatus || "Unknown").toLowerCase().includes("closed") ? "closed" : "";
    updateChip(marketStatusChip, `Market: ${quote.marketStatus}`, marketMode);

    timestampMeta.textContent = `Latest update: ${toDateString(quote.timestamp)}`;
    const sourceLabel = sourceMode === "licensed-produce"
        ? "Source: Licensed produce feed"
        : sourceMode === "benchmark-futures"
            ? "Source: Commodity benchmark futures"
            : sourceMode === "reference-estimate"
                ? "Source: FreshLink reference model"
            : "Source: Market provider";
    latencyMeta.textContent = `${sourceLabel} | ${isVvip ? "Priority refresh enabled. Live/delayed still depends on provider plan." : quote.quality}`;

    applyPricePulse(quote.direction);

    if (vvipPanel) {
        vvipPanel.style.display = isVvip ? "block" : "none";
    }
}

function clearCanvas() {
    if (!ctx || !chartCanvas) return;
    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
}

function drawGrid(width, height, padding) {
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;

    const rows = 5;
    const cols = 6;

    for (let r = 0; r <= rows; r += 1) {
        const y = padding + ((height - padding * 2) / rows) * r;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    for (let c = 0; c <= cols; c += 1) {
        const x = padding + ((width - padding * 2) / cols) * c;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
    }

    ctx.restore();
}

function drawPricePath(mapped, direction, width, height, padding) {
    if (!mapped.length) return;

    const up = direction === "up";
    const lineColor = up ? "#22c55e" : direction === "down" ? "#f97316" : "#38bdf8";
    const glowColor = up ? "rgba(34,197,94,0.26)" : direction === "down" ? "rgba(249,115,22,0.26)" : "rgba(56,189,248,0.2)";

    ctx.save();

    for (let layer = 3; layer >= 1; layer -= 1) {
        ctx.beginPath();
        ctx.moveTo(mapped[0].x, mapped[0].y + layer * 2);
        mapped.forEach((p) => ctx.lineTo(p.x, p.y + layer * 2));
        ctx.strokeStyle = `rgba(15,23,42,${0.12 * layer})`;
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(mapped[0].x, mapped[0].y);
    mapped.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;
    ctx.stroke();

    const fill = ctx.createLinearGradient(0, padding, 0, height - padding);
    fill.addColorStop(0, glowColor);
    fill.addColorStop(1, "rgba(2,6,23,0.02)");

    ctx.beginPath();
    ctx.moveTo(mapped[0].x, mapped[0].y);
    mapped.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(mapped[mapped.length - 1].x, height - padding);
    ctx.lineTo(mapped[0].x, height - padding);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.restore();
}

function drawAiPath(mapped) {
    if (!Array.isArray(mapped) || mapped.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(mapped[0].x, mapped[0].y);
    mapped.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.95)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(56, 189, 248, 0.42)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawAxisLabels(labels, mapped, height) {
    ctx.save();
    ctx.fillStyle = "rgba(148,163,184,0.88)";
    ctx.font = "11px Segoe UI";

    const count = labels.length;
    const steps = count > 6 ? 6 : count - 1;
    for (let i = 0; i <= steps; i += 1) {
        const idx = Math.floor((count - 1) * (i / steps));
        const point = mapped[idx];
        if (!point) continue;

        const label = labels[idx];
        ctx.fillText(label, point.x - 22, height - 14);
    }

    ctx.restore();
}

function mapChartPoints(points) {
    const width = chartCanvas.width;
    const height = chartCanvas.height;
    const padding = 36;

    const closes = points.map((item) => Number(item.c)).filter(Number.isFinite);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const spread = Math.max(0.0001, max - min);

    const mapped = points.map((item, index) => {
        const x = padding + index * ((width - padding * 2) / Math.max(1, points.length - 1));
        const y = height - padding - ((Number(item.c) - min) / spread) * (height - padding * 2);
        return {
            x,
            y,
            t: item.t,
            c: Number(item.c)
        };
    });

    return { mapped, min, max, width, height, padding };
}

function buildLabel(timeIso) {
    const date = new Date(timeIso);
    if (Number.isNaN(date.getTime())) return "--";

    if (currentRange === "1D" || currentRange === "1W") {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    if (currentRange === "1M" || currentRange === "6M") {
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    return date.toLocaleDateString([], { month: "short", year: "2-digit" });
}

function drawChart(points, direction, aiSeries = []) {
    if (!ctx || !chartCanvas || !Array.isArray(points) || points.length < 2) {
        clearCanvas();
        return;
    }

    const { mapped, width, height, padding } = mapChartPoints(points);
    clearCanvas();

    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "rgba(4,14,26,0.94)");
    bg.addColorStop(1, "rgba(2,8,20,0.95)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    drawGrid(width, height, padding);
    drawPricePath(mapped, direction, width, height, padding);

    let aiMapped = [];
    if (Array.isArray(aiSeries) && aiSeries.length > 1) {
        aiMapped = mapChartPoints(aiSeries).mapped;
        drawAiPath(aiMapped);
    }

    const labels = points.map((point) => buildLabel(point.t));
    drawAxisLabels(labels, mapped, height);

    chartState.points = mapped;
    chartState.aiPoints = aiMapped;
    chartState.labels = labels;
    chartState.direction = direction;
}

function onChartMove(event) {
    if (!chartState.points.length || !chartHover || !chartCanvas) return;

    const rect = chartCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let nearest = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    chartState.points.forEach((point, index) => {
        const distance = Math.abs(point.x - x);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = index;
        }
    });

    const p = chartState.points[nearest];
    if (!p) return;

    const aiPoint = chartState.aiPoints[nearest] || null;

    chartState.hoverIndex = nearest;
    chartHover.style.display = "block";
    chartHover.style.left = `${p.x}px`;
    chartHover.style.top = `${p.y}px`;
    const aiText = aiPoint ? ` | AI local ${formatNumber(aiPoint.c, 2)}` : "";
    chartHover.textContent = `${chartState.labels[nearest]} | Spot ${formatNumber(p.c, 2)}${aiText}`;

    const tiltX = ((y / rect.height) - 0.5) * -6;
    const tiltY = ((x / rect.width) - 0.5) * 10;
    chartTilt.style.transform = `perspective(980px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
}

function onChartLeave() {
    if (chartHover) chartHover.style.display = "none";
    if (chartTilt) chartTilt.style.transform = "perspective(980px) rotateX(0deg) rotateY(0deg)";
}

function activateRangeButtons() {
    if (!rangeBar) return;

    rangeBar.querySelectorAll(".range-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const range = btn.getAttribute("data-range");
            if (!range) return;

            currentRange = range;
            rangeBar.querySelectorAll(".range-btn").forEach((node) => {
                node.classList.toggle("active", node === btn);
            });

            loadMarket(currentSymbol, currentRange, false);
        });
    });
}

async function fetchMarketData(symbol, range) {
    let quoteRaw;
    let seriesRaw;

    if (currentProvider === "finnhub") {
        [quoteRaw, seriesRaw] = await Promise.all([
            fetchQuoteFinnhub(symbol),
            fetchSeriesFinnhub(symbol, range)
        ]);

        const quote = normalizeFinnhubQuote(symbol, quoteRaw);
        const series = normalizeFinnhubSeries(seriesRaw);

        if (!Number.isFinite(quote.volume)) {
            quote.volume = getSeriesVolume(series);
        }

        return { quote, series };
    }

    [quoteRaw, seriesRaw] = await Promise.all([
        fetchQuoteTwelveData(symbol),
        fetchSeriesTwelveData(symbol, range)
    ]);

    const quote = normalizeTwelveDataQuote(symbol, quoteRaw);
    const series = normalizeTwelveDataSeries(seriesRaw);

    if (!Number.isFinite(quote.volume)) {
        quote.volume = getSeriesVolume(series);
    }

    return { quote, series };
}

async function fetchFoodMarketData(query, range) {
    const produce = findProduceConfig(query);
    if (!hasProxy() && !getApiKey()) {
        return buildReferenceMarketData(query, range);
    }

    if (!produce) {
        const symbol = sanitizeSymbol(query);
        if (!symbol) {
            throw new Error("Enter a produce name (banana, maize, tomato, orange) or a valid market symbol.");
        }

        const payload = await fetchMarketData(symbol, range);
        return {
            ...payload,
            matchedSymbol: symbol,
            sourceMode: "direct-symbol",
            produceKey: null,
            produceLabel: symbol,
            produceBenchmark: "Direct symbol"
        };
    }

    const itemKey = produce.key;
    const itemConfig = produce.config;

    if (hasProxy()) {
        try {
            const payload = await fetchProduceProxy(itemKey, range);
            payload.quote.displayName = itemConfig.label;
            payload.quote.venue = `${payload.quote.venue} • ${itemConfig.benchmark}`;
            return {
                ...payload,
                produceKey: itemKey,
                produceLabel: itemConfig.label,
                produceBenchmark: itemConfig.benchmark
            };
        } catch {
            // Fall back to benchmark symbols when proxy endpoint is unavailable.
        }
    }

    const candidates = currentProvider === "finnhub" ? itemConfig.fh : itemConfig.tw;
    const payload = await fetchByCandidateSymbols(candidates, range);
    payload.quote.displayName = itemConfig.label;
    payload.quote.venue = `Benchmark: ${itemConfig.benchmark}`;
    payload.quote.quality = `${payload.quote.quality}. Displayed as a produce benchmark proxy.`;

    return {
        ...payload,
        produceKey: itemKey,
        produceLabel: itemConfig.label,
        produceBenchmark: itemConfig.benchmark
    };
}

function getTier() {
    const tools = window.FreshLinkSubscription;
    if (!tools || typeof tools.getCurrentSubscriptionState !== "function") return Promise.resolve("premium");

    return tools.getCurrentSubscriptionState().then((state) => String(state?.tier || "premium"));
}

function clearRefreshTimer() {
    if (autoRefreshTimer) {
        window.clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

function scheduleRefresh(tier) {
    clearRefreshTimer();

    const refreshMs = getFeatureRefreshMs(tier);
    refreshMeta.textContent = `Auto-refresh: every ${(refreshMs / 1000).toFixed(0)}s`;

    autoRefreshTimer = window.setTimeout(() => {
        loadMarket(currentSymbol, currentRange, false);
    }, refreshMs);
}

async function loadMarket(symbolValue, range, userTriggered) {
    hideError();

    const symbol = String(symbolValue || symbolInput?.value || currentSymbol || "").trim();
    if (!symbol) {
        showError("Enter a produce item such as banana, maize, wheat, tomato, sugar, coffee, or a valid market symbol.");
        return;
    }

    currentSymbol = symbol;

    currentProvider = String(providerSelect?.value || currentProvider || "twelvedata").toLowerCase();
    localStorage.setItem("freshlink_market_provider", currentProvider);

    setLoading(true, userTriggered ? "Loading live terminal feed..." : "Refreshing market feed...");

    try {
        const tier = await getTier();
        const isVvip = tier === "vvip_premium";

        const { quote, series, matchedSymbol, sourceMode, produceKey, produceLabel } = await fetchFoodMarketData(symbol, range);
        if (!Array.isArray(series) || series.length < 2 || !Number.isFinite(quote.price)) {
            throw new Error("Provider returned incomplete market data for this symbol and range.");
        }

        const area = await detectUserArea();
        const aiSeries = generateAiLocalizedSeries(series, produceKey, area);

        renderQuote(quote, isVvip, sourceMode);
        drawChart(series, quote.direction, aiSeries);
        setTerminalVisible(true);

        currentSymbol = matchedSymbol || symbol;

        const areaLabel = `${area.city}, ${area.country}`;
        const areaMode = area.confidence === "geo" ? "AI Local Model: Geo-detected area" : "AI Local Model: Estimated area";
        const productLabel = produceLabel || quote.displayName || symbol;
        latencyMeta.textContent = `${latencyMeta.textContent} | ${areaMode} (${areaLabel}) | Product: ${productLabel}`;

        chartState.latestQuote = quote;
        scheduleRefresh(tier);
    } catch (error) {
        setTerminalVisible(false);
        showError(`${error.message} Configure a licensed produce feed proxy for direct fruit/vegetable spot prices, or use supported benchmark symbols.`);
    } finally {
        setLoading(false);
    }
}

function renderUpgradePrompt() {
    if (emptyState) {
        emptyState.innerHTML = `
            <div style="font-weight:700; margin-bottom:8px;">Live produce market terminal is a Premium feature</div>
            <div style="margin-bottom:12px;">Upgrade to Premium or higher to access live food-market feeds, full chart ranges, and professional produce analytics cards.</div>
            <button class="primary-btn" onclick="window.location.href='settings.html?upgrade=1&feature=live_market_prices'">Upgrade plan</button>
        `;
    }

    if (loadBtn) loadBtn.disabled = true;
    if (symbolInput) symbolInput.disabled = true;
    if (providerSelect) providerSelect.disabled = true;
}

function bindEvents() {
    if (loadBtn) {
        loadBtn.addEventListener("click", () => {
            loadMarket(symbolInput?.value || currentSymbol, currentRange, true);
        });
    }

    if (symbolInput) {
        symbolInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                loadMarket(symbolInput.value, currentRange, true);
            }
        });
    }

    if (providerSelect) {
        providerSelect.value = currentProvider;
        providerSelect.addEventListener("change", () => {
            currentProvider = String(providerSelect.value || "twelvedata");
            localStorage.setItem("freshlink_market_provider", currentProvider);
        });
    }

    if (chartCanvas) {
        chartCanvas.addEventListener("mousemove", onChartMove);
        chartCanvas.addEventListener("mouseleave", onChartLeave);
    }
}

async function initializeMarketPage() {
    const subscriptionTools = window.FreshLinkSubscription;
    const hasLiveSource = hasProxy() || Boolean(getApiKey());
    if (subscriptionTools && hasLiveSource) {
        const gate = await subscriptionTools.requireFeatureAccess("live_market_prices", { redirect: false });
        if (!gate.allowed) {
            renderUpgradePrompt();
            return;
        }
    }

    renderSymbolSuggestions();
    activateRangeButtons();
    bindEvents();

    symbolInput.value = currentSymbol;
    loadMarket(currentSymbol, currentRange, false);
}

initializeMarketPage();
