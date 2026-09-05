import { supabase } from "./supabase.js";
import { resolvePostImageUrl, escapeHtmlText } from "./image-matching.js";

const feedElement = document.getElementById("feed");
const searchInput = document.getElementById("searchInput");
let allPosts = [];
const urlParams = new URLSearchParams(window.location.search);
const categoryFilter = urlParams.get("category")?.toLowerCase() || "";

async function loadPosts() {
    const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        feedElement.innerHTML = "<p>Failed to load posts</p>";
        return;
    }

    let profileMap = {};
    const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,farm_name,farm_category,specialization");

    if (!profileError && Array.isArray(profiles)) {
        profileMap = profiles.reduce((acc, profile) => {
            if (profile?.id) {
                acc[profile.id] = {
                    farmName: profile.farm_name || "",
                    farmCategory: profile.farm_category || "",
                    specialization: profile.specialization || ""
                };
            }
            return acc;
        }, {});
    }

    allPosts = (data || []).filter(isPostVisible).map((post) => {
        const ownerProfile = profileMap[post?.owner_id] || {};
        return {
            ...post,
            farmer_category: ownerProfile.farmCategory || "",
            farmer_specialization: ownerProfile.specialization || "",
            farmer_name: ownerProfile.farmName || post.farm || ""
        };
    });

    if (categoryFilter) {
        searchInput.value = categoryFilter;
        renderPosts(filterPosts(categoryFilter));
    } else {
        renderPosts(allPosts);
    }
}

function isPostVisible(post) {
    if (!post?.created_at) return true;

    const createdAt = new Date(post.created_at);
    if (Number.isNaN(createdAt.getTime())) return true;

    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    return expiresAt > new Date();
}

function filterPosts(value) {
    const query = value.toLowerCase();
    return allPosts.filter(post =>
        post.title?.toLowerCase().includes(query) ||
        post.farm?.toLowerCase().includes(query) ||
        post.farmer_name?.toLowerCase().includes(query) ||
        post.location?.toLowerCase().includes(query) ||
        post.category?.toLowerCase().includes(query) ||
        post.farmer_category?.toLowerCase().includes(query) ||
        post.farmer_specialization?.toLowerCase().includes(query)
    );
}


function escapeHtml(text) {
    return escapeHtmlText(text);
}

function renderPosts(posts) {
    if (!feedElement) return;
    feedElement.innerHTML = "";

    if (!posts || !posts.length) {
        feedElement.innerHTML = '<div class="post-content"><p>No active listings found right now. Fresh farm photos stay visible for 7 days before expiring.</p></div>';
        return;
    }

    posts.forEach(post => {
        if (!post) return;
        if (!post) return;
        const div = document.createElement("div");
        div.className = "post";
        const safeImg = resolvePostImageUrl(post);
        const title = escapeHtml(post.title || "Untitled");
        const farmerCategory = escapeHtml(post.farmer_category || "");
        const farmerSpecialization = escapeHtml(post.farmer_specialization || "");
        const categoryMeta = farmerCategory ? ` • ${farmerCategory}` : "";
        const specializationMeta = farmerSpecialization ? ` • ${farmerSpecialization}` : "";
        div.innerHTML = `
            <img src="${escapeHtml(safeImg)}" alt="${title}" loading="lazy">
            <div class="post-content">
                <div class="post-title">${title}</div>
                <div class="post-meta">📍 ${escapeHtml(post.location || "Location not specified")}</div>
            <div class="post-meta">👩‍🌾 ${escapeHtml(post.farm || post.farmer_name || "Farmer")}${categoryMeta}${specializationMeta}</div>
                <div class="post-text">
                    ${post.amount ? `📦 ${escapeHtml(post.amount)}` : ""}
                    ${post.unit_price ? ` • R${Number(post.unit_price || 0).toFixed(2)} each` : ""}
                    ${post.price ? ` • Total R${Number(post.price || 0).toFixed(2)}` : ""}
                </div>
                <div class="post-actions">
                    <button class="contact" onclick="window.location.href='product.html?title=${encodeURIComponent(post.title)}&image=${encodeURIComponent(safeImg)}&price=${encodeURIComponent(post.price)}&amount=${encodeURIComponent(post.amount || '1 unit')}&unit_price=${encodeURIComponent(post.unit_price || post.price)}&location=${encodeURIComponent(post.location)}&contact=${encodeURIComponent(post.contact)}&email=${encodeURIComponent(post.email || '')}&description=${encodeURIComponent(post.description || '')}&farm=${encodeURIComponent(post.farm)}&category=${encodeURIComponent(post.category || 'produce')}&video_url=${encodeURIComponent(post.video_url || '')}'">View</button>
                    <button class="contact" onclick="contact('${post.contact}')">Message</button>
                </div>
            </div>
        `;
        feedElement.appendChild(div);
    });
}

searchInput.addEventListener("input", (e) => {
    const value = e.target.value.toLowerCase();
    renderPosts(filterPosts(value));
});

function normalizePhone(phone) {
    if (!phone) return "";
    return String(phone).replace(/\D/g, '').substring(0, 15);
}

window.contact = function (number) {
    const cleanNumber = normalizePhone(number);
    if (!cleanNumber) {
        alert("Phone number not available. Please contact the farmer directly.");
        return;
    }
    const popup = window.open(`https://wa.me/${cleanNumber}`, "_blank", "noopener,noreferrer");
    if (popup) popup.opener = null;
};

window.logout = async function () {
    await supabase.auth.signOut();
    window.location.href = "index.html";
};

loadPosts();