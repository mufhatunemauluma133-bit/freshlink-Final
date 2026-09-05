import { supabase } from "./supabase.js";

// ========================================
// 🔐 CHECK USER SESSION
// ========================================
async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
        document.getElementById("userEmail").innerText = user.email;
        loadSettings();
        await refreshSubscriptionUI();
        return;
    }

    window.location.href = "index.html";
}

// ========================================
// 💾 LOAD SETTINGS FROM LOCALSTORAGE
// ========================================
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem("userSettings")) || {
        pushNotifications: true,
        emailNotifications: false,
        newListingsAlert: true,
        theme: "system",
        language: "en",
        locationServices: true,
        profileVisibility: true,
        showContactInfo: false
    };

    if (!settings.theme) {
        settings.theme = settings.darkMode ? "dark" : "system";
    }

    setChecked("pushNotifications", settings.pushNotifications);
    setChecked("emailNotifications", settings.emailNotifications);
    setChecked("newListingsAlert", settings.newListingsAlert);
    setThemePreference(settings.theme, false);
    setValue("language", settings.language);
    setChecked("locationServices", settings.locationServices);
    setChecked("profileVisibility", settings.profileVisibility);
    setChecked("showContactInfo", settings.showContactInfo);
}

// ========================================
// 💾 SAVE SETTINGS
// ========================================
window.saveSettings = function() {
    const settings = {
        pushNotifications: getChecked("pushNotifications", true),
        emailNotifications: getChecked("emailNotifications", false),
        newListingsAlert: getChecked("newListingsAlert", true),
        theme: getThemePreference(),
        language: getValue("language", "en"),
        locationServices: getChecked("locationServices", true),
        profileVisibility: getChecked("profileVisibility", true),
        showContactInfo: getChecked("showContactInfo", false)
    };

    localStorage.setItem("userSettings", JSON.stringify(settings));
    applyThemePreference(settings.theme);
    showMessage("Settings saved successfully!", "success");
};

function getThemePreference() {
    const activeButton = document.querySelector(".theme-option.active");
    if (activeButton) {
        return activeButton.getAttribute("data-theme") || "system";
    }

    return document.documentElement.dataset.themePreference || "system";
}

function persistThemePreference(theme) {
    const settings = JSON.parse(localStorage.getItem("userSettings")) || {};
    settings.theme = theme;
    localStorage.setItem("userSettings", JSON.stringify(settings));
    localStorage.setItem("freshlink_theme", theme);
}

function setThemePreference(theme, persist = true) {
    const normalized = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
    const radio = document.querySelector(`input[name="themePreference"][value="${normalized}"]`);
    if (radio) radio.checked = true;

    document.querySelectorAll(".theme-option").forEach((button) => {
        const active = button.getAttribute("data-theme") === normalized;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    applyThemePreference(normalized);

    if (persist) {
        persistThemePreference(normalized);
    }
}

window.setThemePreference = function(theme) {
    setThemePreference(theme, true);
};

window.toggleDarkMode = function() {
    setThemePreference("dark", true);
};

window.goBack = function () {
    window.location.href = "feed.html";
};

window.showPasswordChange = function () {
    const passwordSection = document.getElementById("passwordSection");
    if (passwordSection) {
        passwordSection.style.display = "block";
    }
};

window.hidePasswordChange = function () {
    const passwordSection = document.getElementById("passwordSection");
    const newPassword = document.getElementById("newPassword");
    const confirmPassword = document.getElementById("confirmPassword");
    const passwordMsg = document.getElementById("passwordMsg");

    if (passwordSection) {
        passwordSection.style.display = "none";
    }
    if (newPassword) {
        newPassword.value = "";
    }
    if (confirmPassword) {
        confirmPassword.value = "";
    }
    if (passwordMsg) {
        passwordMsg.innerHTML = "";
    }
};

// ========================================
// 🔑 CHANGE PASSWORD
// ========================================
window.changePassword = async function() {
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const msgDiv = document.getElementById("passwordMsg");

    if (!newPasswordInput || !confirmPasswordInput || !msgDiv) return;

    const newPassword = newPasswordInput.value || "";
    const confirmPassword = confirmPasswordInput.value || "";

    // Validation
    if (!newPassword || !confirmPassword) {
        msgDiv.innerHTML = '<div class="message error">Please fill in all fields</div>';
        return;
    }

    if (newPassword.length < 6) {
        msgDiv.innerHTML = '<div class="message error">Password must be at least 6 characters</div>';
        return;
    }

    if (newPassword !== confirmPassword) {
        msgDiv.innerHTML = '<div class="message error">Passwords do not match</div>';
        return;
    }

    // Update password
    const { error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (error) {
        msgDiv.innerHTML = `<div class="message error">${error.message}</div>`;
    } else {
        msgDiv.innerHTML = '<div class="message success">Password updated successfully!</div>';
        setTimeout(() => {
            if (typeof window.hidePasswordChange === "function") {
                window.hidePasswordChange();
            }
        }, 2000);
    }
};

// ========================================
// 🚪 LOGOUT
// ========================================
window.confirmLogout = async function() {
    if (confirm("Are you sure you want to logout?")) {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            showMessage("Error logging out: " + error.message, "error");
        } else {
            window.location.href = "index.html";
        }
    }
};

// ========================================
// 🗑️ DELETE ACCOUNT
// ========================================
window.confirmDeleteAccount = async function() {
    const confirmation = String(prompt("Type DELETE to remove your local data and sign out. Permanent account deletion can be completed from Supabase account settings.") || "").trim();
    
    if (confirmation === "DELETE") {
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                showMessage("No signed-in account found.", "error");
                return;
            }

            localStorage.removeItem("freshlink_cart");
            localStorage.removeItem("freshlink_chat_requests");
            localStorage.removeItem("freshlink_selected_driver");
            localStorage.removeItem("userSettings");

            await supabase.auth.signOut();
            window.location.href = "index.html";
        } catch (error) {
            showMessage("Error deleting account: " + error.message, "error");
        }
    } else if (confirmation !== null) {
        showMessage("Account deletion cancelled - incorrect confirmation", "error");
    }
};

// ========================================
// 📢 SHOW MESSAGE
// ========================================
function showMessage(text, type) {
    const container = document.querySelector(".settings-container");
    const msg = document.createElement("div");
    msg.className = `message ${type}`;
    msg.innerText = text;
    
    container.insertBefore(msg, container.firstChild);
    
    setTimeout(() => {
        msg.remove();
    }, 3000);
}

function getChecked(id, fallback = false) {
    const element = document.getElementById(id);
    return element ? Boolean(element.checked) : fallback;
}

function setChecked(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.checked = Boolean(value);
    }
}

function getValue(id, fallback = "") {
    const element = document.getElementById(id);
    return element ? element.value : fallback;
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

window.openTerms = function () {
    window.location.href = "terms.html";
};

window.openPrivacy = function () {
    window.location.href = "privacy.html";
};

async function refreshSubscriptionUI() {
    const label = document.getElementById("currentPlanLabel");
    const freeModeStatus = document.getElementById("freeModeStatus");
    const tools = window.FreshLinkSubscription;
    if (!tools || !label || !freeModeStatus) return;

    const state = await tools.getCurrentSubscriptionState(true);
    const planName = state?.plan?.name || "Free";
    const planPrice = state?.plan?.priceLabel || "R0/month";
    label.textContent = `Current plan: ${planName} (${planPrice})`;

    const freeStatus = await tools.getFreeModeStatus();
    if (freeStatus.enabled) {
        if (freeStatus.remainingMs <= 0) {
            freeModeStatus.textContent = "Free mode time has ended. Upgrade to continue using advanced FreshLink features.";
        } else {
            freeModeStatus.textContent = `Free mode includes basic features and ${freeStatus.limitMinutes} minutes total. Time left: ${freeStatus.remainingMinutes} minute(s).`;
        }
    } else {
        freeModeStatus.textContent = "Your premium plan unlocks advanced features and unlimited usage time.";
    }

    const params = new URLSearchParams(window.location.search);
    const reason = String(params.get("reason") || "");
    const feature = String(params.get("feature") || "");
    const selected = String(params.get("plan") || "");
    const subscriptionStatus = String(params.get("subscription") || "");

    if (reason === "free-time-limit") {
        showMessage("Your free 59-minute session ended. Upgrade to continue.", "error");
    }

    if (feature === "live_market_prices") {
        showMessage("Live stock market prices require Premium or higher.", "error");
    } else if (feature === "order_tracking") {
        showMessage("Order tracking requires Premium Plus or VVIP Premium.", "error");
    }

    if (selected) {
        const normalized = tools.normalizeTier(selected);
        if (normalized !== state.tier) {
            showMessage(`Plan selected: ${tools.plans[normalized].name}. Click the matching Choose button to confirm.`, "success");
        }
    }

    if (subscriptionStatus === "success" && selected) {
        const normalized = tools.normalizeTier(selected);
        showMessage(`${tools.plans[normalized].name} is now active. Your premium access and badge have been updated.`, "success");
    }
}

window.choosePlan = async function (tier) {
    const tools = window.FreshLinkSubscription;
    if (!tools) return;

    const stateBefore = await tools.getCurrentSubscriptionState(true);
    const nextTier = tools.normalizeTier(tier);
    if (stateBefore.tier === nextTier) {
        showMessage(`You are already on the ${stateBefore.plan.name} plan.`, "success");
        return;
    }

    const target = new URL("payment.html", window.location.href);
    target.searchParams.set("checkout", "subscription");
    target.searchParams.set("plan", nextTier);
    window.location.href = target.toString();
};

// ========================================
// 🎯 INITIALIZE
// ========================================
checkUser();
