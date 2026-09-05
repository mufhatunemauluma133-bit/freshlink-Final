import { supabase } from "./supabase.js";

const cartSummary = document.getElementById("cartSummary");
const checkoutTotal = document.getElementById("checkoutTotal");
const payAllBtn = document.getElementById("payAllBtn");
const deliverySection = document.getElementById("deliverySection");
const deliveryDetails = document.getElementById("deliveryDetails");
const checkoutStatus = document.getElementById("checkoutStatus");

const payerBankName = document.getElementById("payerBankName");
const payerAccountName = document.getElementById("payerAccountName");
const payerAccountNumber = document.getElementById("payerAccountNumber");
const payerBranchCode = document.getElementById("payerBranchCode");
const recipientBankName = document.getElementById("recipientBankName");
const recipientAccountName = document.getElementById("recipientAccountName");
const recipientAccountNumber = document.getElementById("recipientAccountNumber");
const recipientBranchCode = document.getElementById("recipientBranchCode");
const transferReference = document.getElementById("transferReference");
const checkoutBox = document.querySelector(".checkout-box");
const checkoutHeading = checkoutBox?.querySelector("h2") || null;
const checkoutIntro = checkoutBox?.querySelector("p") || null;
const summaryNote = document.querySelector(".summary-note");

const params = new URLSearchParams(window.location.search);
const subscriptionTools = window.FreshLinkSubscription;
const checkoutMode = params.get("checkout") === "subscription" ? "subscription" : "cart";
const subscriptionPlanTier = subscriptionTools?.normalizeTier(params.get("plan") || "") || "free";

function getCart() {
    return JSON.parse(localStorage.getItem("freshlink_cart") || "[]");
}

function escapeHtmlPayment(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(amount) {
    const num = Number(amount || 0);
    return isFinite(num) ? `R${num.toFixed(2)}` : "R0.00";
}

function getSelectedPlan() {
    if (!subscriptionTools?.plans) return null;
    const plan = subscriptionTools.plans[subscriptionPlanTier];
    if (!plan || plan.tier === "free") return null;
    return plan;
}

function saveSubscriptionPaymentRecord(user, plan, transferMeta = null) {
    if (!user?.id || !plan) return;

    const record = {
        paymentId: `SUB-${Date.now()}`,
        userId: user.id,
        email: String(user.email || "").toLowerCase(),
        tier: plan.tier,
        planName: plan.name,
        amount: Number(plan.monthlyPrice || 0),
        createdAt: new Date().toISOString(),
        paymentMethod: "bank-transfer",
        transferMeta
    };

    localStorage.setItem("freshlink_last_subscription_payment", JSON.stringify(record));
}

function renderSubscriptionCheckout(plan) {
    if (!plan || !cartSummary) return;

    if (checkoutHeading) checkoutHeading.textContent = `⭐ ${plan.name} Checkout`;
    if (checkoutIntro) {
        checkoutIntro.textContent = `Pay once and FreshLink will activate ${plan.name} automatically on your account right after confirmation.`;
    }
    if (summaryNote) {
        summaryNote.textContent = "Your plan activates automatically after payment confirmation, and your premium badge updates immediately on supported pages.";
    }
    if (deliverySection) {
        deliverySection.style.display = "none";
    }
    if (payAllBtn) {
        payAllBtn.textContent = `Pay and Activate ${plan.name}`;
    }
    if (checkoutTotal) {
        checkoutTotal.textContent = formatCurrency(plan.monthlyPrice);
    }

    const badgeMeta = subscriptionTools?.getSubscriptionBadgeMeta?.(plan.tier);
    const badgeCopy = badgeMeta?.visible ? `${badgeMeta.label} included` : "Premium activation included";

    cartSummary.innerHTML = `
        <div class="farm-summary">
            <h3>${escapeHtmlPayment(plan.name)}</h3>
            <ul>
                <li><span class="item-label">Monthly plan price</span><span>${formatCurrency(plan.monthlyPrice)}</span></li>
                <li><span class="item-label">Activation</span><span>Automatic</span></li>
                <li><span class="item-label">Badge</span><span>${escapeHtmlPayment(badgeCopy)}</span></li>
            </ul>
            <div class="farm-total">Plan total: ${formatCurrency(plan.monthlyPrice)}</div>
        </div>
    `;
}

async function activateSubscriptionPlan() {
    const plan = getSelectedPlan();
    if (!plan) {
        showStatus("Invalid subscription plan selected. Please choose your plan again.", "error");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showStatus("Please sign in before paying for a subscription.", "error");
        window.location.href = "index.html";
        return;
    }

    const transfer = collectTransferDetails(plan.name);
    if (!transfer.valid) {
        showStatus(transfer.error, "error");
        return;
    }

    if (payAllBtn) payAllBtn.disabled = true;

    const result = await subscriptionTools.setCurrentSubscriptionTier(plan.tier);
    if (!result.success) {
        if (payAllBtn) payAllBtn.disabled = false;
        showStatus(result.message || "Unable to activate subscription after payment.", "error");
        return;
    }

    saveSubscriptionPaymentRecord(user, plan, transfer.masked);

    showStatus(`${plan.name} payment recorded and activated automatically. Your badge and plan access are now live.`, "success");
    window.setTimeout(() => {
        window.location.href = `settings.html?subscription=success&plan=${encodeURIComponent(plan.tier)}`;
    }, 500);
}

function saveCompletedOrderRecord(paidItems, user, selectedDriver, transferMeta = null) {
    if (!Array.isArray(paidItems) || !paidItems.length || !user?.id) return;

    const sellersMap = {};
    paidItems.forEach((item) => {
        const sellerName = String(item?.farm || "Seller").trim().substring(0, 100);
        const sellerEmail = String(item?.contactEmail || item?.email || "").trim().toLowerCase().substring(0, 120);
        const key = `${sellerName}|${sellerEmail}`;
        if (!sellersMap[key]) {
            sellersMap[key] = { sellerName, sellerEmail };
        }
    });

    const orderRecord = {
        orderId: `ORD-${Date.now()}`,
        buyerId: user.id,
        buyerEmail: String(user.email || "").toLowerCase(),
        createdAt: new Date().toISOString(),
        receivedAt: null,
        driverName: String(selectedDriver?.driverName || "").substring(0, 100),
        sellers: Object.values(sellersMap),
        paymentMethod: "bank-transfer",
        transferMeta
    };

    localStorage.setItem("freshlink_last_completed_order", JSON.stringify(orderRecord));
}

function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
}

function maskAccount(accountNumber) {
    const digits = digitsOnly(accountNumber);
    if (digits.length <= 4) return digits;
    return `****${digits.slice(-4)}`;
}

function sanitizeName(value, maxLength = 100) {
    return String(value || "").trim().substring(0, maxLength);
}

function collectTransferDetails(defaultRecipientName = "") {
    if (recipientAccountName && !String(recipientAccountName.value || "").trim() && defaultRecipientName) {
        recipientAccountName.value = defaultRecipientName;
    }

    const details = {
        payerBankName: sanitizeName(payerBankName?.value, 80),
        payerAccountName: sanitizeName(payerAccountName?.value, 100),
        payerAccountNumber: digitsOnly(payerAccountNumber?.value),
        payerBranchCode: digitsOnly(payerBranchCode?.value),
        recipientBankName: sanitizeName(recipientBankName?.value, 80),
        recipientAccountName: sanitizeName(recipientAccountName?.value, 100),
        recipientAccountNumber: digitsOnly(recipientAccountNumber?.value),
        recipientBranchCode: digitsOnly(recipientBranchCode?.value),
        transferReference: sanitizeName(transferReference?.value, 80)
    };

    if (!details.payerBankName || !details.payerAccountName || !details.payerAccountNumber || !details.payerBranchCode) {
        return { valid: false, error: "Enter all your bank details before paying." };
    }

    if (!details.recipientBankName || !details.recipientAccountName || !details.recipientAccountNumber || !details.recipientBranchCode) {
        return { valid: false, error: "Enter all seller bank details before paying." };
    }

    if (!details.transferReference) {
        return { valid: false, error: "Enter a transfer reference before paying." };
    }

    if (details.payerAccountNumber.length < 6 || details.recipientAccountNumber.length < 6) {
        return { valid: false, error: "Account numbers must be at least 6 digits." };
    }

    if (details.payerBranchCode.length < 4 || details.recipientBranchCode.length < 4) {
        return { valid: false, error: "Branch codes must be at least 4 digits." };
    }

    return {
        valid: true,
        details,
        masked: {
            payerBankName: details.payerBankName,
            payerAccountName: details.payerAccountName,
            payerAccountNumber: maskAccount(details.payerAccountNumber),
            payerBranchCode: details.payerBranchCode,
            recipientBankName: details.recipientBankName,
            recipientAccountName: details.recipientAccountName,
            recipientAccountNumber: maskAccount(details.recipientAccountNumber),
            recipientBranchCode: details.recipientBranchCode,
            transferReference: details.transferReference
        }
    };
}

function groupCartByFarm(cart) {
    if (!Array.isArray(cart)) return {};
    return cart.reduce((groups, item) => {
        if (!item) return groups;
        const key = (item.farm || item.contactEmail || "Other farm").substring(0, 100);
        if (!groups[key]) {
            groups[key] = { farm: key, items: [], subtotal: 0 };
        }
        groups[key].items.push(item);
        const itemPrice = Number(item.price || 0);
        groups[key].subtotal += isFinite(itemPrice) ? itemPrice : 0;
        return groups;
    }, {});
}

function renderDeliveryInfo() {
    const selectedDriver = JSON.parse(localStorage.getItem("freshlink_selected_driver") || "null");
    if (!selectedDriver || !deliverySection || !deliveryDetails) {
        if (deliverySection) deliverySection.style.display = "none";
        return;
    }

    deliverySection.style.display = "block";
    const driverName = escapeHtmlPayment(selectedDriver.driverName || "Unknown Driver");
    const vehicleType = escapeHtmlPayment(selectedDriver.vehicleType || "Vehicle");
    const serviceArea = escapeHtmlPayment(selectedDriver.serviceArea || "Service area");
    const cleanPhone = String(selectedDriver.phone || "").replace(/\D/g, '').slice(-4) || 'DRV';
    
    deliveryDetails.innerHTML = `
        <p style="margin:0 0 6px; color:#f8fafc;"><strong>${driverName}</strong></p>
        <p style="margin:0 0 6px; color:#cbd5e1;">${vehicleType} • ${serviceArea}</p>
        <p style="margin:0 0 6px; color:#94a3b8;">📞 ${escapeHtmlPayment(selectedDriver.phone)}</p>
        <p style="margin:0 0 6px; color:#94a3b8;">💸 ${formatCurrency(selectedDriver.costPer100km)} per 100km</p>
        <p style="margin:0; color:#94a3b8;">Tracking ID: ${cleanPhone}</p>
    `;
}

function renderCartSummary() {
    if (checkoutMode === "subscription") {
        const plan = getSelectedPlan();
        if (!plan) {
            cartSummary.innerHTML = `<div class="empty-grid">Choose a valid subscription plan from Settings before paying.</div>`;
            if (payAllBtn) payAllBtn.disabled = true;
            if (checkoutTotal) checkoutTotal.textContent = formatCurrency(0);
            return;
        }

        if (payAllBtn) payAllBtn.disabled = false;
        renderSubscriptionCheckout(plan);
        return;
    }

    const cart = getCart();
    if (!Array.isArray(cart)) {
        cartSummary.innerHTML = `<div class="empty-grid">Cart is empty or invalid.</div>`;
        return;
    }
    
    const farms = Object.values(groupCartByFarm(cart));
    const selectedDriver = JSON.parse(localStorage.getItem("freshlink_selected_driver") || "null");
    
    const baseSubtotal = cart.reduce((sum, item) => {
        const price = Number(item?.price || 0);
        return sum + (isFinite(price) ? price : 0);
    }, 0);
    
    const deliveryFee = selectedDriver ? Number(selectedDriver.costPer100km || 0) : 0;
    const total = baseSubtotal + deliveryFee;

    if (checkoutTotal) checkoutTotal.textContent = formatCurrency(total);
    if (payAllBtn) payAllBtn.disabled = cart.length === 0;
    
    renderDeliveryInfo();

    if (!cart.length) {
        cartSummary.innerHTML = `<div class="empty-grid">No products in cart yet. Add farm products from the marketplace first.</div>`;
        return;
    }

    cartSummary.innerHTML = farms.map(farm => {
        const itemRows = farm.items.map(item => {
            if (!item) return "";
            const itemPrice = Number(item.price || 0);
            const safeFarmName = escapeHtmlPayment(item.farm || "Unknown farm");
            const safeTitle = escapeHtmlPayment(item.title || "Unknown item");
            const safeAmount = escapeHtmlPayment(item.amount || "1 unit");
            return `
                <li>
                    <span class="item-label">${safeTitle} • ${safeAmount}</span>
                    <span>${formatCurrency(itemPrice)}</span>
                </li>
            `;
        }).join("");

        const safeFarmName = escapeHtmlPayment(farm.farm);
        return `
            <div class="farm-summary">
                <h3>${safeFarmName}</h3>
                <ul>${itemRows}</ul>
                <div class="farm-total">Pay this farm: ${formatCurrency(farm.subtotal)}</div>
                <button class="checkout-button" onclick="payFarm('${farm.farm.replace(/'/g, "\\'")}')">Pay ${safeFarmName}</button>
            </div>
        `;
    }).join("");
}

window.payAll = async function () {
    if (checkoutMode === "subscription") {
        await activateSubscriptionPlan();
        return;
    }

    const cart = getCart();
    if (!Array.isArray(cart) || !cart.length) {
        showStatus("Your cart is empty. Add products before paying.", "error");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showStatus("Please sign in before paying.", "error");
        window.location.href = "index.html";
        return;
    }

    const selectedDriver = JSON.parse(localStorage.getItem("freshlink_selected_driver") || "null");
    const baseSubtotal = cart.reduce((sum, item) => {
        const price = Number(item?.price || 0);
        return sum + (isFinite(price) ? price : 0);
    }, 0);
    const deliveryFee = selectedDriver ? Number(selectedDriver.costPer100km || 0) : 0;
    const total = baseSubtotal + deliveryFee;

    const transfer = collectTransferDetails("All sellers");
    if (!transfer.valid) {
        showStatus(transfer.error, "error");
        return;
    }

    saveCompletedOrderRecord(cart, user, selectedDriver, transfer.masked);
    
    localStorage.removeItem("freshlink_cart");
    renderCartSummary();
    
    const driverMsg = selectedDriver ? ` Delivery handled by ${escapeHtmlPayment(selectedDriver.driverName || "driver")}.` : "";
    showStatus(`Bank transfer recorded for all farms: ${formatCurrency(total)}. Reference: ${escapeHtmlPayment(transfer.details.transferReference)}.${driverMsg}`, "success");
    window.location.href = "feed.html";
};

window.payFarm = async function (farmName) {
    if (checkoutMode === "subscription") {
        await activateSubscriptionPlan();
        return;
    }

    const safeFarmName = String(farmName || "").substring(0, 100);
    const cart = getCart();
    if (!Array.isArray(cart)) {
        showStatus("Cart is invalid.", "error");
        return;
    }
    
    const farmItems = cart.filter(item => item && item.farm === safeFarmName);
    if (!farmItems.length) {
        showStatus("No products found for this farm.", "error");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showStatus("Please sign in before paying.", "error");
        window.location.href = "index.html";
        return;
    }

    const selectedDriver = JSON.parse(localStorage.getItem("freshlink_selected_driver") || "null");
    const farmTotal = farmItems.reduce((sum, item) => {
        const price = Number(item?.price || 0);
        return sum + (isFinite(price) ? price : 0);
    }, 0);
    const deliveryFee = selectedDriver ? Number(selectedDriver.costPer100km || 0) : 0;
    const remaining = cart.filter(item => item && item.farm !== safeFarmName);

    const transfer = collectTransferDetails(safeFarmName);
    if (!transfer.valid) {
        showStatus(transfer.error, "error");
        return;
    }

    saveCompletedOrderRecord(farmItems, user, selectedDriver, transfer.masked);
    
    localStorage.setItem("freshlink_cart", JSON.stringify(remaining));
    renderCartSummary();
    showStatus(`Bank transfer recorded for ${escapeHtmlPayment(safeFarmName)}: ${formatCurrency(farmTotal + deliveryFee)}. Reference: ${escapeHtmlPayment(transfer.details.transferReference)}.`, "success");
};

function showStatus(message, type = "success") {
    if (!checkoutStatus) return;
    checkoutStatus.textContent = message;
    checkoutStatus.className = `message ${type}`;
    checkoutStatus.style.display = "block";
}

renderCartSummary();
