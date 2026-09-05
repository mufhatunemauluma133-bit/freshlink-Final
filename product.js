import { supabase } from "./supabase.js";
import { resolvePostImageUrl } from "./image-matching.js";

const LOCAL_CART_KEY = "freshlink_cart";
const LOCAL_REQUESTS_KEY = "freshlink_chat_requests";
const params = new URLSearchParams(window.location.search);

const elements = {
	detailImage: document.getElementById("detailImage"),
	detailTitle: document.getElementById("detailTitle"),
	detailLocation: document.getElementById("detailLocation"),
	detailFarm: document.getElementById("detailFarm"),
	detailAmount: document.getElementById("detailAmount"),
	detailUnitPrice: document.getElementById("detailUnitPrice"),
	detailPrice: document.getElementById("detailPrice"),
	detailDescription: document.getElementById("detailDescription"),
	detailCategory: document.getElementById("detailCategory"),
	detailVideoLabel: document.getElementById("detailVideoLabel"),
	detailVideoWrap: document.getElementById("detailVideoWrap"),
	detailVideo: document.getElementById("detailVideo"),
	detailFarmName: document.getElementById("detailFarmName"),
	detailPhone: document.getElementById("detailPhone"),
	detailEmail: document.getElementById("detailEmail"),
	verificationBadge: document.getElementById("verificationBadge"),
	viewProfileLink: document.getElementById("viewProfileLink"),
	viewProfileSmall: document.getElementById("viewProfileSmall"),
	viewProfileBtn: document.getElementById("viewProfileBtn"),
	addToCartBtn: document.getElementById("addToCartBtn"),
	messageSellerBtn: document.getElementById("messageSellerBtn"),
	callSellerBtn: document.getElementById("callSellerBtn"),
	contactBtn: document.getElementById("contactBtn"),
	detailNotify: document.getElementById("detailNotify")
};

function escapeHtmlProduct(text) {
	if (!text) return "";
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function isValidUrl(url) {
	try {
		new URL(url || "");
		return true;
	} catch {
		return false;
	}
}

function isValidEmail(email) {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(String(email || ""));
}

function normalizePhoneProduct(phone) {
	if (!phone) return "";
	return String(phone).replace(/\D/g, '').substring(0, 15);
}

const product = {
	title: decodeParam("title", "Fresh farm produce"),
	image: decodeParam("image", "https://images.unsplash.com/photo-1471194402529-8e0f5a675de6?auto=format&fit=crop&w=1200&q=80"),
	price: toNumber(params.get("price"), 0),
	amount: decodeParam("amount", "1 unit"),
	unitPrice: toNumber(params.get("unit_price"), 0),
	location: decodeParam("location", "Local farm market"),
	contact: decodeParam("contact", ""),
	email: decodeParam("email", ""),
	description: decodeParam("description", "Fresh produce available for delivery."),
	farm: decodeParam("farm", "Farm seller"),
	category: decodeParam("category", "Farm produce"),
	videoUrl: decodeParam("video_url", "")
};

function resolveProductImage() {
	return resolvePostImageUrl({
		title: product.title,
		category: product.category,
		image_url: isValidUrl(product.image) ? product.image : ""
	});
}

async function initProductPage() {
	await hydrateFromDatabaseIfNeeded();
	renderProductDetails();
	wireActions();
	await updateVerificationBadge();
}

function decodeParam(key, fallback) {
	const value = params.get(key);
	if (!value) return fallback;

	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function toNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

async function hydrateFromDatabaseIfNeeded() {
	const hasEnoughData = Boolean(product.title && product.farm && product.price > 0);
	if (hasEnoughData) return;

	const query = supabase
		.from("posts")
		.select("title,image_url,price,amount,unit_price,location,contact,email,description,farm,category,video_url")
		.limit(1);

	if (product.title) query.ilike("title", product.title);
	if (product.farm) query.ilike("farm", product.farm);

	const { data, error } = await query.maybeSingle();
	if (error || !data) return;

	product.title = data.title || product.title;
	product.image = data.image_url || product.image;
	product.price = toNumber(data.price, product.price);
	product.amount = data.amount || product.amount;
	product.unitPrice = toNumber(data.unit_price, product.unitPrice || product.price);
	product.location = data.location || product.location;
	product.contact = data.contact || product.contact;
	product.email = data.email || product.email;
	product.description = data.description || product.description;
	product.farm = data.farm || product.farm;
	product.category = data.category || product.category;
	product.videoUrl = data.video_url || product.videoUrl;
}

function renderProductDetails() {
	if (elements.detailImage) {
		const safeImage = resolveProductImage();
		elements.detailImage.innerHTML = `<img src="${safeImage}" alt="${escapeHtml(product.title)}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1471194402529-8e0f5a675de6?auto=format&fit=crop&w=1200&q=80';">`;
	}

	if (elements.detailTitle) elements.detailTitle.textContent = product.title;
	if (elements.detailLocation) elements.detailLocation.textContent = product.location;
	if (elements.detailFarm) elements.detailFarm.textContent = product.farm;
	if (elements.detailAmount) elements.detailAmount.textContent = product.amount;
	if (elements.detailUnitPrice) {
		const effectiveUnit = product.unitPrice > 0 ? product.unitPrice : product.price;
		elements.detailUnitPrice.textContent = `R${effectiveUnit.toFixed(2)} each`;
	}
	if (elements.detailPrice) {
		elements.detailPrice.textContent = `R${(product.price > 0 ? product.price : 0).toFixed(2)}`;
	}
	if (elements.detailDescription) elements.detailDescription.textContent = product.description;
	if (elements.detailCategory) elements.detailCategory.textContent = product.category;

	if (elements.detailFarmName) elements.detailFarmName.textContent = product.farm;
	if (elements.detailPhone) elements.detailPhone.textContent = product.contact || "Not provided";
	if (elements.detailEmail) elements.detailEmail.textContent = product.email || "Not provided";

	const profileUrl = buildProfileUrl();
	if (elements.viewProfileLink) elements.viewProfileLink.href = profileUrl;
	if (elements.viewProfileSmall) elements.viewProfileSmall.href = profileUrl;

	if (elements.contactBtn) {
		if (product.email) {
			const subject = encodeURIComponent(`FreshLink product enquiry: ${product.title}`);
			elements.contactBtn.href = `mailto:${product.email}?subject=${subject}`;
		} else {
			elements.contactBtn.href = "#";
			elements.contactBtn.addEventListener("click", (event) => {
				event.preventDefault();
				notify("No seller email available for this listing.", true);
			});
		}
	}

	renderVideo();
}

function renderVideo() {
	if (!elements.detailVideoWrap || !elements.detailVideoLabel || !elements.detailVideo) return;

	if (isValidMediaUrl(product.videoUrl)) {
		elements.detailVideoWrap.style.display = "block";
		elements.detailVideoLabel.style.display = "inline";
		elements.detailVideo.src = product.videoUrl;
	} else {
		elements.detailVideoWrap.style.display = "none";
		elements.detailVideoLabel.style.display = "none";
	}
}

function wireActions() {
	if (elements.viewProfileBtn) {
		elements.viewProfileBtn.addEventListener("click", () => {
			window.location.href = buildProfileUrl();
		});
	}

	if (elements.callSellerBtn) {
		elements.callSellerBtn.addEventListener("click", () => {
			requestChatAndOpen("call");
		});
	}

	if (elements.messageSellerBtn) {
		elements.messageSellerBtn.addEventListener("click", async () => {
			await requestChatAndOpen("chat");
		});
	}

	if (elements.addToCartBtn) {
		elements.addToCartBtn.addEventListener("click", () => {
			addItemToCart();
			notify("Added to cart. Redirecting to checkout...");
			setTimeout(() => {
				window.location.href = "payment.html";
			}, 500);
		});
	}
}

function addItemToCart() {
	const cart = getCartItems();

	const item = {
		id: `${product.farm}-${product.title}`.replace(/\s+/g, "-").toLowerCase(),
		title: product.title,
		amount: product.amount,
		unitPrice: product.unitPrice > 0 ? product.unitPrice : product.price,
		price: product.price > 0 ? product.price : product.unitPrice,
		image: product.image,
		farm: product.farm,
		location: product.location,
		contact: product.contact,
		contactEmail: product.email,
		addedAt: new Date().toISOString()
	};

	const existingIndex = cart.findIndex(entry => entry.id === item.id);
	if (existingIndex >= 0) {
		cart[existingIndex] = item;
	} else {
		cart.push(item);
	}

	localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(cart));
}

async function requestChatAndOpen(actionType = "chat") {
	const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || "[]");
	const { data } = await supabase.auth.getSession();
	const user = data?.session?.user || null;

	const sellerEmail = product.email || "seller@freshlink.local";
	const requesterEmail = user?.email || "guest@freshlink.local";

	const duplicate = requests.find(req =>
		req.email === sellerEmail &&
		req.title === product.title &&
		req.farm === product.farm &&
		req.requesterEmail === requesterEmail
	);

	if (!duplicate) {
		requests.unshift({
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			email: sellerEmail,
			requesterEmail,
			farm: product.farm,
			title: product.title,
			location: product.location,
			status: "pending",
			createdAt: new Date().toISOString()
		});
		localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
	}

	notify(actionType === "call" ? "Opening in-app call request..." : "Opening in-app chat...");
	setTimeout(() => {
		const intent = new URLSearchParams({
			seller: sellerEmail,
			farm: product.farm || "Seller",
			product: product.title || "Product",
			action: actionType,
			intent_id: String(Date.now())
		});
		window.location.href = `chat.html?${intent.toString()}`;
	}, 500);
}

async function updateVerificationBadge() {
	if (!elements.verificationBadge) return;

	let badgeMeta = { visible: false, label: "" };
	const subscriptionTools = window.FreshLinkSubscription;
	if (subscriptionTools) {
		const sellerEmail = (product.email || "").trim().toLowerCase();
		const { data: authData } = await supabase.auth.getUser();
		const viewerEmail = String(authData?.user?.email || "").trim().toLowerCase();

		if (sellerEmail && sellerEmail === viewerEmail) {
			const state = await subscriptionTools.getCurrentSubscriptionState();
			badgeMeta = subscriptionTools.getSubscriptionBadgeMeta(state.tier);
		} else if (sellerEmail) {
			const { data } = await supabase.rpc("get_profile_preview", { _email: sellerEmail });
			const profile = Array.isArray(data) ? data[0] : data;

			badgeMeta = subscriptionTools.getSubscriptionBadgeMeta(profile?.subscription_tier);
		}
	}

	const sellerEmail = (product.email || "").trim().toLowerCase();
	let approved = false;
	if (sellerEmail) {
		const { data } = await supabase
			.from("verification_requests")
			.select("status")
			.eq("email", sellerEmail)
			.order("created_at", { ascending: false })
			.limit(1);
		approved = Array.isArray(data) && data.some((item) => item.status === "approved");
	}

	if (badgeMeta.visible) {
		elements.verificationBadge.textContent = `✓ ${badgeMeta.label}`;
		elements.verificationBadge.style.display = "block";
	} else if (approved) {
		elements.verificationBadge.textContent = "✓ Verified farmer/supplier";
		elements.verificationBadge.style.display = "block";
	} else {
		elements.verificationBadge.style.display = "none";
	}
}

function buildProfileUrl() {
	const query = new URLSearchParams({
		farm: product.farm,
		email: product.email,
		location: product.location,
		contact: product.contact
	});

	return `profile.html?${query.toString()}`;
}

function normalizePhone(value) {
	const digits = String(value || "").replace(/\D/g, "");
	return digits || "";
}

function getCartItems() {
	return JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || "[]");
}

function isValidMediaUrl(url) {
	if (!url) return false;
	return /^https?:\/\//i.test(url);
}

function escapeHtml(value) {
	const div = document.createElement("div");
	div.textContent = value;
	return div.innerHTML;
}

function notify(message, isError = false) {
	if (!elements.detailNotify) return;

	elements.detailNotify.textContent = message;
	elements.detailNotify.style.color = isError ? "#fca5a5" : "#a7f3d0";
}

initProductPage();
