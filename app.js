import { supabase } from "./supabase.js";

// Apply the browser-only safety checks before the rest of the shared app starts.
function initializeRuntimeSecurity() {
    try {
        if (window.top !== window.self) {
            window.top.location = window.self.location;
        }
    } catch {
        // Cross-origin frame access can throw; keep app running.
    }
    

    const host = window.location.hostname || "";
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const isPrivateLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    const isFileProtocol = window.location.protocol === "file:";
    const shouldUpgradeToHttps = window.location.protocol === "http:" && !isLocalHost && !isPrivateLan && !isFileProtocol;

    if (shouldUpgradeToHttps) {
        window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
    }
}

initializeRuntimeSecurity();

// Authentication is shared by every page, so keep session lookup in one place.
async function getUser() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
}

const THEME_STORAGE_KEY = "freshlink_theme";
const USER_SETTINGS_KEY = "userSettings";
const THEME_PREFERENCES = new Set(["light", "dark", "system"]);

function readUserSettings() {
    try {
        return JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || "{}");
    } catch {
        return {};
    }
}

function normalizeThemePreference(preference) {
    return THEME_PREFERENCES.has(preference) ? preference : "system";
}

function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getThemePreference() {
    const settings = readUserSettings();
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const storedPreference = settings.theme || storedTheme || "system";
    return normalizeThemePreference(storedPreference);
}

function resolveTheme(preference) {
    const normalized = normalizeThemePreference(preference);
    return normalized === "system" ? getSystemTheme() : normalized;
}

function applyThemePreference(preference) {
    const normalized = normalizeThemePreference(preference);
    const resolved = resolveTheme(normalized);
    const root = document.documentElement;

    root.dataset.theme = resolved;
    root.dataset.themePreference = normalized;
    root.style.colorScheme = resolved;

    if (normalized === "system") {
        localStorage.setItem(THEME_STORAGE_KEY, "system");
    } else {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
    }

    return { preference: normalized, theme: resolved };
}

function initializeTheme() {
    applyThemePreference(getThemePreference());

    const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (!mediaQuery) return;

    const syncSystemTheme = () => {
        if (getThemePreference() === "system") {
            applyThemePreference("system");
        }
    };

    if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", syncSystemTheme);
    } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(syncSystemTheme);
    }
}

// Expose theme controls for settings pages and inline page actions.
window.applyThemePreference = applyThemePreference;
window.getThemePreference = getThemePreference;
window.setThemePreference = function (preference) {
    return applyThemePreference(preference);
};

initializeTheme();

function setStatusMessage(element, message, tone = "info") {
    if (!element) return;
    element.className = `status-message ${tone}`;
    element.textContent = message;
}

function clearStatusMessage(element) {
    if (!element) return;
    element.className = "";
    element.textContent = "";
}

function toFriendlyAuthError(error, fallbackMessage) {
    const rawMessage = String(error?.message || error || fallbackMessage || "").trim();
    if (!rawMessage) return fallbackMessage || "Something went wrong";

    const lower = rawMessage.toLowerCase();
    if (lower.includes("email not confirmed")) {
        return "Email not verified yet. Please check your inbox (and spam folder), verify your account, then login again.";
    }

    if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
        return "Connection error: unable to reach authentication server. Check internet, Supabase URL/key, and open the app from http://localhost (not file://).";
    }

    return rawMessage;
}

function navigateTo(url, delay = 140) {
    if (!url) return;
    document.documentElement.classList.add("page-leaving");
    setTimeout(() => {
        window.location.href = url;
    }, delay);
}

async function protectPage() {
    const user = await getUser();
    const path = window.location.pathname.toLowerCase();
    const page = path.substring(path.lastIndexOf("/") + 1);
    const publicPages = ["index.html", "signup.html", "", "/"];

    if (user) {
        await enforceFreeUsageLimit(user, page);
        if (publicPages.includes(page)) {
            window.location.href = "home.html";
        }
        return;
    }

    if (publicPages.includes(page)) {
        return;
    }

    window.location.href = "index.html";
}

protectPage();

const SUBSCRIPTION_STORAGE_PREFIX = "freshlink_subscription_tier_";
const FREE_USAGE_STORAGE_PREFIX = "freshlink_free_mode_started_";
const FREE_USAGE_LIMIT_MS = 59 * 60 * 1000;

const SUBSCRIPTION_PLANS = {
    free: {
        tier: "free",
        name: "Free",
        priceLabel: "R0/month",
        monthlyPrice: 0,
        description: "Basic FreshLink access with a 59-minute usage limit and essential tools."
    },
    premium: {
        tier: "premium",
        name: "Premium",
        priceLabel: "R99/month",
        monthlyPrice: 99,
        description: "Unlock advanced tools and unlimited usage time."
    },
    premium_plus: {
        tier: "premium_plus",
        name: "Premium Plus",
        priceLabel: "R449/month",
        monthlyPrice: 449,
        description: "Everything in Premium plus order tracking and stronger trust features."
    },
    vvip_premium: {
        tier: "vvip_premium",
        name: "VVIP Premium",
        priceLabel: "R1,299/month",
        monthlyPrice: 1299,
        description: "Top-tier FreshLink access with all premium benefits and VVIP visibility."
    }
};

const TIER_RANK = {
    free: 0,
    premium: 1,
    premium_plus: 2,
    vvip_premium: 3
};

const FEATURE_MIN_TIER = {
    live_market_prices: "premium",
    order_tracking: "premium_plus",
    verified_badge: "premium_plus"
};

function normalizeSubscriptionTier(tier) {
    const value = String(tier || "").trim().toLowerCase().replace(/\s+/g, "_");
    return SUBSCRIPTION_PLANS[value] ? value : "free";
}

function getTierRank(tier) {
    return TIER_RANK[normalizeSubscriptionTier(tier)] ?? 0;
}

function hasFeatureAccess(tier, featureKey) {
    const requiredTier = FEATURE_MIN_TIER[featureKey];
    if (!requiredTier) return true;
    return getTierRank(tier) >= getTierRank(requiredTier);
}

function getSubscriptionBadgeMeta(tier) {
    const normalizedTier = normalizeSubscriptionTier(tier);

    if (normalizedTier === "vvip_premium") {
        return {
            visible: true,
            label: "VVIP Premium Badge",
            shortLabel: "VVIP",
            tone: "vvip"
        };
    }

    if (normalizedTier === "premium_plus") {
        return {
            visible: true,
            label: "Premium Plus Verified Badge",
            shortLabel: "Premium Plus",
            tone: "premium-plus"
        };
    }

    if (normalizedTier === "premium") {
        return {
            visible: true,
            label: "Premium Member Badge",
            shortLabel: "Premium",
            tone: "premium"
        };
    }

    return {
        visible: false,
        label: "",
        shortLabel: "",
        tone: "free"
    };
}

function getSubscriptionStorageKey(userId) {
    return `${SUBSCRIPTION_STORAGE_PREFIX}${userId}`;
}

function getFreeModeStorageKey(userId) {
    return `${FREE_USAGE_STORAGE_PREFIX}${userId}`;
}

async function readProfileSubscription(userId) {
    const result = await supabase
        .from("profiles")
        .select("subscription_tier, subscription_status, paid")
        .eq("id", userId)
        .single();

    if (!result.error && result.data) {
        return {
            tier: normalizeSubscriptionTier(result.data.subscription_tier || (result.data.paid ? "premium" : "free")),
            status: String(result.data.subscription_status || (result.data.paid ? "active" : "inactive")).toLowerCase()
        };
    }

    const fallback = await supabase
        .from("profiles")
        .select("paid")
        .eq("id", userId)
        .single();

    if (!fallback.error && fallback.data) {
        return {
            tier: fallback.data.paid ? "premium" : "free",
            status: fallback.data.paid ? "active" : "inactive"
        };
    }

    return null;
}

async function getCurrentSubscriptionState(forceRefresh = false) {
    const user = await getUser();
    if (!user?.id) {
        return {
            userId: null,
            tier: "free",
            status: "inactive",
            plan: SUBSCRIPTION_PLANS.free,
            source: "guest"
        };
    }

    if (!forceRefresh && window.__freshlinkSubscriptionCache?.userId === user.id) {
        return window.__freshlinkSubscriptionCache;
    }

    const profileSubscription = await readProfileSubscription(user.id);
    const tier = normalizeSubscriptionTier(profileSubscription?.tier || "free");
    const status = String(profileSubscription?.status || (tier === "free" ? "inactive" : "active")).toLowerCase();

    const state = {
        userId: user.id,
        tier,
        status,
        plan: SUBSCRIPTION_PLANS[tier] || SUBSCRIPTION_PLANS.free,
        source: profileSubscription ? "supabase" : "fallback-free"
    };

    window.__freshlinkSubscriptionCache = state;
    return state;
}

async function setCurrentSubscriptionTier(tier) {
    const normalizedTier = normalizeSubscriptionTier(tier);
    const user = await getUser();
    if (!user?.id) {
        return { success: false, message: "You must be logged in to change plans." };
    }

    if (normalizedTier !== "free") {
        return {
            success: false,
            message: "Paid plans can only be activated after verified payment. Please complete Stripe checkout and return here."
        };
    }

    const payload = {
        id: user.id,
        email: user.email,
        subscription_tier: normalizedTier,
        subscription_status: normalizedTier === "free" ? "inactive" : "active"
    };

    const { error } = await supabase.from("profiles").upsert(payload);

    if (error) {
        await getCurrentSubscriptionState(true);
        const message = String(error.message || "").toLowerCase().includes("only admins can change")
            ? "Subscription change blocked by backend policy. Complete plan upgrades through an admin or payment flow."
            : "Unable to save your subscription change on the server. Please run the latest Supabase schema and try again.";

        return {
            success: false,
            message
        };
    }

    localStorage.setItem(getSubscriptionStorageKey(user.id), normalizedTier);

    const state = await getCurrentSubscriptionState(true);
    return { success: true, state };
}

function getFreeUsageWindow(userId) {
    const key = getFreeModeStorageKey(userId);
    const existing = Number(localStorage.getItem(key));
    const startedAt = Number.isFinite(existing) && existing > 0 ? existing : Date.now();
    if (!existing) {
        localStorage.setItem(key, String(startedAt));
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, FREE_USAGE_LIMIT_MS - elapsedMs);
    return { startedAt, elapsedMs, remainingMs, limitMs: FREE_USAGE_LIMIT_MS };
}

async function enforceFreeUsageLimit(user, pageName) {
    const state = await getCurrentSubscriptionState();
    if (state.tier !== "free") return;

    const usage = getFreeUsageWindow(user.id);
    window.__freshlinkFreeUsageWindow = usage;

    if (usage.remainingMs > 0) return;

    const upgradePages = new Set(["settings.html", "menu.html", "index.html", "signup.html", "terms.html", "privacy.html"]);
    if (upgradePages.has(pageName)) return;

    window.location.href = "settings.html?upgrade=1&reason=free-time-limit";
}

async function requireFeatureAccess(featureKey, options = {}) {
    const state = await getCurrentSubscriptionState();
    let allowed = false;

    const user = await getUser();
    if (user?.id) {
        const { data, error } = await supabase.rpc("can_access_feature", { _feature: String(featureKey || "") });
        if (!error) {
            allowed = data === true;
        }
    }

    if (!allowed) {
        allowed = hasFeatureAccess(state.tier, featureKey);
    }

    if (allowed) {
        return { allowed: true, state };
    }

    if (options.redirect !== false) {
        const fallback = options.redirectUrl || "settings.html";
        const target = `${fallback}${fallback.includes("?") ? "&" : "?"}upgrade=1&feature=${encodeURIComponent(featureKey)}`;
        window.location.href = target;
    }

    return { allowed: false, state };
}

async function getFreeModeStatus() {
    const user = await getUser();
    const state = await getCurrentSubscriptionState();
    if (!user?.id || state.tier !== "free") {
        return {
            enabled: false,
            limitMinutes: 59,
            remainingMinutes: null,
            remainingMs: null,
            startedAt: null
        };
    }

    const usage = getFreeUsageWindow(user.id);
    return {
        enabled: true,
        limitMinutes: 59,
        remainingMinutes: Math.ceil(usage.remainingMs / 60000),
        remainingMs: usage.remainingMs,
        startedAt: usage.startedAt
    };
}

window.FreshLinkSubscription = {
    plans: SUBSCRIPTION_PLANS,
    featureMinimums: FEATURE_MIN_TIER,
    normalizeTier: normalizeSubscriptionTier,
    getTierRank,
    hasFeatureAccess,
    getSubscriptionBadgeMeta,
    getCurrentSubscriptionState,
    setCurrentSubscriptionTier,
    requireFeatureAccess,
    getFreeModeStatus
};

function sanitizeEmail(email) {
    return String(email || "").toLowerCase().trim().substring(0, 100);
}

function isValidEmailApp(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(sanitizeEmail(email));
}

function isStrongPassword(password) {
    const value = String(password || "");
    if (value.length < 8) return false;
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    return hasUpper && hasLower && hasNumber;
}

window.login = async function () {
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const msg = document.getElementById("msg");

    const email = (emailEl?.value || "").trim().toLowerCase();
    const password = passwordEl?.value || "";

    clearStatusMessage(msg);

    if (!email || !password) {
        setStatusMessage(msg, "Please fill in all fields", "error");
        return;
    }

    if (!isValidEmailApp(email)) {
        setStatusMessage(msg, "Please enter a valid email address", "error");
        return;
    }

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            setStatusMessage(msg, toFriendlyAuthError(error, "Login failed"), "error");
            return;
        }
    } catch (error) {
        setStatusMessage(msg, toFriendlyAuthError(error, "Login failed"), "error");
        return;
    }

    setStatusMessage(msg, "Login successful 🌱", "success");
    setTimeout(() => {
        navigateTo("home.html", 80);
    }, 600);
};

window.register = async function () {
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const accountTypeEl = document.getElementById("accountType");
    const acceptRulesEl = document.getElementById("acceptRules");
    const msg = document.getElementById("msg");

    const email = (emailEl?.value || "").trim().toLowerCase();
    const password = passwordEl?.value || "";
    const accountType = String(accountTypeEl?.value || "buyer").toLowerCase();

    clearStatusMessage(msg);

    if (!email || !password) {
        setStatusMessage(msg, "Please fill in all fields", "error");
        return;
    }

    if (!isValidEmailApp(email)) {
        setStatusMessage(msg, "Please enter a valid email address", "error");
        return;
    }

    if (!acceptRulesEl || acceptRulesEl.checked !== true) {
        setStatusMessage(msg, "Please accept the Terms and Privacy Policy to continue", "error");
        return;
    }

    if (!isStrongPassword(password)) {
        setStatusMessage(msg, "Use at least 8 characters with uppercase, lowercase, and a number", "error");
        return;
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin + "/index.html"
            }
        });

        if (error) {
            setStatusMessage(msg, toFriendlyAuthError(error, "Registration failed"), "error");
            return;
        }

        if (data?.user && !data.user.email_confirmed_at) {
            await supabase.auth.signOut();
        }

        if (data?.user?.id) {
            const normalizedRole = accountType === "supplier" ? "supplier" : accountType === "shop" ? "supplier" : "buyer";
            await supabase.from("profiles").upsert({
                id: data.user.id,
                email,
                role: normalizedRole,
                account_type: accountType,
                payment_provider: accountType === "supplier" ? "stripe" : null,
                payout_status: accountType === "supplier" ? "onboarding_pending" : null,
                updated_at: new Date().toISOString()
            }, { onConflict: "id" });
        }
    } catch (error) {
        setStatusMessage(msg, toFriendlyAuthError(error, "Registration failed"), "error");
        return;
    }

    setStatusMessage(msg, `Account created 🌱 ${accountType === "supplier" ? "You will be guided through secure payout onboarding after you sign in." : "You can start exploring FreshLink right away."}`, "success");
};

window.resendVerification = async function () {
    const emailEl = document.getElementById("email");
    const msg = document.getElementById("msg");
    const email = (emailEl?.value || "").trim().toLowerCase();

    clearStatusMessage(msg);

    if (!email) {
        setStatusMessage(msg, "Enter your email address first", "error");
        return;
    }

    if (!isValidEmailApp(email)) {
        setStatusMessage(msg, "Please enter a valid email address", "error");
        return;
    }

    try {
        const { error } = await supabase.auth.resend({
            type: "signup",
            email,
            options: {
                emailRedirectTo: window.location.origin + "/index.html"
            }
        });

        if (error) {
            setStatusMessage(msg, toFriendlyAuthError(error, "Unable to resend verification email"), "error");
            return;
        }
    } catch (error) {
        setStatusMessage(msg, toFriendlyAuthError(error, "Unable to resend verification email"), "error");
        return;
    }

    setStatusMessage(msg, "Verification email sent. Check inbox/spam and open the link.", "success");
};

window.logout = async function () {
    await supabase.auth.signOut();
    navigateTo("index.html", 80);
};

window.getCurrentUser = getUser;

supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && window.location.pathname.toLowerCase().includes("home.html")) {
        navigateTo("index.html", 80);
    }
});
