import { supabase } from "./supabase.js";

const trackingDetails = document.getElementById('trackingDetails');
const callDriverBtn = document.getElementById('callDriverBtn');
const messageDriverBtn = document.getElementById('messageDriverBtn');
const markReceivedBtn = document.getElementById('markReceivedBtn');
const receivedStatus = document.getElementById('receivedStatus');
const reviewFormWrap = document.getElementById('reviewFormWrap');
const reviewSeller = document.getElementById('reviewSeller');
const reviewStars = document.getElementById('reviewStars');
const reviewComment = document.getElementById('reviewComment');
const submitReviewBtn = document.getElementById('submitReviewBtn');
const reviewMsg = document.getElementById('reviewMsg');

let selectedRating = 0;

function getSelectedDriver() {
    return JSON.parse(localStorage.getItem('freshlink_selected_driver') || 'null');
}

function getLastCompletedOrder() {
    return JSON.parse(localStorage.getItem('freshlink_last_completed_order') || 'null');
}

function setLastCompletedOrder(order) {
    localStorage.setItem('freshlink_last_completed_order', JSON.stringify(order));
}

function showReviewMessage(message, type = 'success') {
    if (!reviewMsg) return;
    reviewMsg.textContent = message;
    reviewMsg.className = `message ${type}`;
    reviewMsg.style.display = 'block';
}

function hideReviewMessage() {
    if (!reviewMsg) return;
    reviewMsg.textContent = '';
    reviewMsg.style.display = 'none';
}

function updateStars(rating) {
    selectedRating = Number(rating || 0);
    if (!reviewStars) return;
    reviewStars.querySelectorAll('.star-btn').forEach((btn) => {
        const value = Number(btn.getAttribute('data-star') || 0);
        btn.classList.toggle('active', value <= selectedRating);
    });
}

function initializeReviewUI() {
    const order = getLastCompletedOrder();

    if (!order || !Array.isArray(order.sellers) || !order.sellers.length) {
        if (markReceivedBtn) markReceivedBtn.style.display = 'none';
        if (reviewFormWrap) reviewFormWrap.style.display = 'none';
        if (receivedStatus) {
            receivedStatus.textContent = 'Complete payment first. After delivery you can rate the seller here.';
        }
        return;
    }

    if (reviewSeller) {
        reviewSeller.innerHTML = order.sellers.map((seller) => {
            const name = String(seller?.sellerName || 'Seller').substring(0, 100);
            const email = String(seller?.sellerEmail || '').substring(0, 120);
            const label = email ? `${name} (${email})` : name;
            return `<option value="${name.replace(/"/g, '&quot;')}|${email.replace(/"/g, '&quot;')}">${label}</option>`;
        }).join('');
    }

    if (order.receivedAt) {
        if (receivedStatus) receivedStatus.textContent = `Received on ${new Date(order.receivedAt).toLocaleString()}. You can submit your seller review below.`;
        if (reviewFormWrap) reviewFormWrap.style.display = 'block';
        if (markReceivedBtn) {
            markReceivedBtn.disabled = true;
            markReceivedBtn.textContent = 'Received confirmed';
        }
    } else {
        if (receivedStatus) receivedStatus.textContent = 'Waiting for delivery confirmation.';
        if (reviewFormWrap) reviewFormWrap.style.display = 'none';
        if (markReceivedBtn) {
            markReceivedBtn.disabled = false;
            markReceivedBtn.textContent = 'Mark as received';
        }
    }
}

async function submitSellerReview() {
    hideReviewMessage();

    const order = getLastCompletedOrder();
    if (!order?.orderId || !order?.receivedAt) {
        showReviewMessage('Please mark the order as received first.', 'error');
        return;
    }

    if (selectedRating < 1 || selectedRating > 5) {
        showReviewMessage('Please choose a rating from 1 to 5 stars.', 'error');
        return;
    }

    const sellerValue = String(reviewSeller?.value || '');
    if (!sellerValue.includes('|')) {
        showReviewMessage('Please select a seller.', 'error');
        return;
    }

    const [sellerNameRaw, sellerEmailRaw] = sellerValue.split('|');
    const sellerName = String(sellerNameRaw || 'Seller').trim().substring(0, 100);
    const sellerEmail = String(sellerEmailRaw || '').trim().toLowerCase().substring(0, 120);
    const comment = String(reviewComment?.value || '').trim().substring(0, 500);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
        showReviewMessage('Please sign in before posting a review.', 'error');
        return;
    }

    const payload = {
        buyer_id: user.id,
        buyer_email: String(user.email || '').toLowerCase(),
        seller_name: sellerName,
        seller_email: sellerEmail,
        order_ref: order.orderId,
        rating: selectedRating,
        comment
    };

    const { error } = await supabase.from('seller_reviews').insert([payload]);
    if (error) {
        const localReviews = JSON.parse(localStorage.getItem('freshlink_seller_reviews_local') || '[]');
        localReviews.push({ ...payload, created_at: new Date().toISOString(), source: 'local-fallback' });
        localStorage.setItem('freshlink_seller_reviews_local', JSON.stringify(localReviews));
        showReviewMessage('Review saved locally. Run updated Supabase schema to store reviews in database.', 'error');
    } else {
        showReviewMessage('Thanks! Your seller review was submitted.', 'success');
    }

    if (!order.reviewedSellers) order.reviewedSellers = [];
    const reviewKey = `${sellerName}|${sellerEmail}`;
    if (!order.reviewedSellers.includes(reviewKey)) {
        order.reviewedSellers.push(reviewKey);
    }
    setLastCompletedOrder(order);

    if (reviewComment) reviewComment.value = '';
    updateStars(0);
}

function bindReviewActions() {
    if (markReceivedBtn) {
        markReceivedBtn.addEventListener('click', () => {
            const order = getLastCompletedOrder();
            if (!order?.orderId) {
                showReviewMessage('No completed order found yet.', 'error');
                return;
            }
            if (!order.receivedAt) {
                order.receivedAt = new Date().toISOString();
                setLastCompletedOrder(order);
            }
            initializeReviewUI();
        });
    }

    if (reviewStars) {
        reviewStars.querySelectorAll('.star-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const value = Number(btn.getAttribute('data-star') || 0);
                updateStars(value);
            });
        });
    }

    if (submitReviewBtn) {
        submitReviewBtn.addEventListener('click', submitSellerReview);
    }
}

function renderTracking() {
    if (!trackingDetails || !callDriverBtn || !messageDriverBtn) return;

    const driver = getSelectedDriver();
    if (!driver) {
        trackingDetails.innerHTML = '<div class="message">No driver selected yet. Choose a trucker from delivery options.</div>';
        callDriverBtn.style.display = 'none';
        messageDriverBtn.style.display = 'none';
        return;
    }

    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    trackingDetails.innerHTML = `
        <h3>${escapeHtml(driver.driverName)}</h3>
        <p style="margin:6px 0; color:#f8fafc;">Vehicle: ${escapeHtml(driver.vehicleType)}</p>
        <p style="margin:6px 0; color:#cbd5e1;">Base: ${escapeHtml(driver.location)}</p>
        <p style="margin:6px 0; color:#94a3b8;">Service area: ${escapeHtml(driver.serviceArea)}</p>
        <p style="margin:6px 0; color:#94a3b8;">Phone: ${escapeHtml(driver.phone)}</p>
        <p style="margin:6px 0; color:#94a3b8;">Cost: R${Number(driver.costPer100km || 0).toFixed(2)} per 100km</p>
        <p style="margin:6px 0; color:#cbd5e1;">Status: On the way to the farm • ETA updates in-app</p>
    `;

    const phone = String(driver.phone || '').replace(/\D/g, '');
    callDriverBtn.href = phone ? `tel:${phone}` : '#';
    callDriverBtn.style.display = 'inline-block';
    messageDriverBtn.href = phone ? `sms:${phone}` : '#';
    messageDriverBtn.style.display = 'inline-block';
}

function renderUpgradePrompt() {
    if (trackingDetails) {
        trackingDetails.innerHTML = `
            <div class="message" style="display:block;">
                Order tracking is available on Premium Plus (R449/month) and VVIP Premium (R1,299/month). Upgrade your plan to unlock driver tracking and delivery confirmation tools.
            </div>
            <button class="primary-btn" style="margin-top:10px;" onclick="window.location.href='settings.html?upgrade=1&feature=order_tracking'">Upgrade plan</button>
        `;
    }

    if (callDriverBtn) callDriverBtn.style.display = 'none';
    if (messageDriverBtn) messageDriverBtn.style.display = 'none';
    if (markReceivedBtn) markReceivedBtn.style.display = 'none';
    if (reviewFormWrap) reviewFormWrap.style.display = 'none';
    if (receivedStatus) {
        receivedStatus.textContent = 'Upgrade required to access tracking, delivery confirmation, and review tools.';
    }
}

async function initializeTrackingPage() {
    const subscriptionTools = window.FreshLinkSubscription;
    if (subscriptionTools) {
        const gate = await subscriptionTools.requireFeatureAccess('order_tracking', { redirect: false });
        if (!gate.allowed) {
            renderUpgradePrompt();
            return;
        }
    }

    renderTracking();
    bindReviewActions();
    initializeReviewUI();
}

initializeTrackingPage();
