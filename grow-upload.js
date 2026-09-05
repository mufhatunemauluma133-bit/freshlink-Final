import { supabase } from "./supabase.js";

const captionInput = document.getElementById("growCaption");
const hashtagsInput = document.getElementById("growHashtags");
const locationInput = document.getElementById("growLocation");
const categoryInput = document.getElementById("growCategory");
const visibilityInput = document.getElementById("growVisibility");
const attachedListingInput = document.getElementById("growAttachedListing");
const thumbnailInput = document.getElementById("growThumbnailFile");
const videoInput = document.getElementById("growVideoFile");
const publishBtn = document.getElementById("growPublishBtn");
const statusBox = document.getElementById("growUploadStatus");

const thumbnailPreview = document.getElementById("growThumbnailPreview");
const videoPreview = document.getElementById("growVideoPreview");
const attachedPreview = document.getElementById("growAttachedPreview");

let currentUser = null;
let currentProfile = null;
let ownListings = [];

function showStatus(message, tone = "info") {
    if (!statusBox) return;
    statusBox.style.display = message ? "block" : "none";
    statusBox.className = `message ${tone}`;
    statusBox.textContent = message;
}

function sanitizeText(value, maxLength = 2000) {
    return String(value || "").trim().substring(0, maxLength);
}

function parseHashtags(value) {
    const tokens = String(value || "")
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.startsWith("#") ? item : `#${item}`)
        .map((item) => item.toLowerCase().replace(/[^#a-z0-9_-]/g, ""))
        .filter((item) => item.length > 1);

    return Array.from(new Set(tokens)).slice(0, 12);
}

function renderAttachedPreview() {
    if (!attachedPreview) return;
    const listingId = Number(attachedListingInput?.value || 0);
    const listing = ownListings.find((item) => Number(item.id) === listingId);
    if (!listing) {
        attachedPreview.style.display = "none";
        attachedPreview.innerHTML = "";
        return;
    }

    attachedPreview.style.display = "block";
    attachedPreview.innerHTML = `
        <strong style="display:block; color:var(--text); margin-bottom:6px;">Attached listing</strong>
        <div style="font-weight:800; color:var(--text);">${listing.title}</div>
        <div style="margin-top:6px; color:var(--muted);">${listing.amount || "Quantity not specified"} • R${Number(listing.price || 0).toFixed(2)}</div>
        <div style="margin-top:6px; color:var(--muted);">${listing.location || "Location not specified"}</div>
    `;
}

function previewImage(file) {
    if (!thumbnailPreview) return;
    if (!file) {
        thumbnailPreview.innerHTML = "Thumbnail preview will appear here.";
        return;
    }

    const url = URL.createObjectURL(file);
    thumbnailPreview.innerHTML = `<img src="${url}" alt="Thumbnail preview">`;
}

function previewVideo(file) {
    if (!videoPreview) return;
    if (!file) {
        videoPreview.innerHTML = "Video preview will appear here.";
        return;
    }

    const url = URL.createObjectURL(file);
    videoPreview.innerHTML = `<video src="${url}" controls playsinline></video>`;
}

function validateImageFile(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve({ valid: false, message: "Choose a thumbnail image before publishing." });
            return;
        }

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            resolve({ valid: false, message: "Thumbnail must be JPG, PNG, or WebP." });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            resolve({ valid: false, message: "Thumbnail must be smaller than 5MB." });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const image = new Image();
            image.onload = () => {
                if (image.width < 900 || image.height < 900) {
                    resolve({ valid: false, message: "Thumbnail should be at least 900x900 pixels." });
                } else {
                    resolve({ valid: true });
                }
            };
            image.onerror = () => resolve({ valid: false, message: "Thumbnail could not be loaded." });
            image.src = event.target.result;
        };
        reader.onerror = () => resolve({ valid: false, message: "Thumbnail could not be read." });
        reader.readAsDataURL(file);
    });
}

function getVideoMetadata(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve({ valid: false, message: "Choose a video before publishing." });
            return;
        }

        const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
        if (!allowedTypes.includes(file.type)) {
            resolve({ valid: false, message: "Video must be MP4, WebM, or MOV." });
            return;
        }

        if (file.size > 80 * 1024 * 1024) {
            resolve({ valid: false, message: "Video must be smaller than 80MB." });
            return;
        }

        const video = document.createElement("video");
        video.preload = "metadata";
        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;
        video.onloadedmetadata = () => {
            const duration = Number(video.duration || 0);
            URL.revokeObjectURL(objectUrl);
            if (!Number.isFinite(duration) || duration <= 0) {
                resolve({ valid: false, message: "Video metadata could not be read." });
                return;
            }
            if (duration > 180) {
                resolve({ valid: false, message: "FreshLink Grow videos must be 3 minutes or shorter." });
                return;
            }
            resolve({ valid: true, duration: Math.round(duration) });
        };
        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve({ valid: false, message: "Video could not be loaded." });
        };
    });
}

async function uploadFile(file, pathPrefix) {
    const safeName = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${pathPrefix}/${currentUser.id}_${Date.now()}_${safeName}`;

    const { error } = await supabase.storage.from("grows-media").upload(path, file);
    if (error) {
        throw new Error(error.message || "Unable to upload file.");
    }

    return supabase.storage.from("grows-media").getPublicUrl(path).data.publicUrl;
}

async function loadSessionAndListings() {
    const { data } = await supabase.auth.getSession();
    currentUser = data?.session?.user || null;
    if (!currentUser) {
        window.location.href = "index.html";
        return false;
    }

    const [{ data: profile }, { data: listings }] = await Promise.all([
        supabase.from("profiles").select("farm_name,avatar_url").eq("id", currentUser.id).maybeSingle(),
        supabase.from("posts").select("id,title,amount,price,location,category,description,image_url,unit_price,contact,owner_email,farm").eq("owner_id", currentUser.id).order("created_at", { ascending: false }).limit(50)
    ]);

    currentProfile = profile || null;
    ownListings = Array.isArray(listings) ? listings : [];

    if (attachedListingInput) {
        attachedListingInput.innerHTML = '<option value="">No attached listing</option>' + ownListings.map((listing) => `
            <option value="${listing.id}">${listing.title} • ${listing.amount || "Qty"} • R${Number(listing.price || 0).toFixed(2)}</option>
        `).join("");
    }

    renderAttachedPreview();
    return true;
}

async function publishGrowVideo() {
    const caption = sanitizeText(captionInput?.value, 2000);
    const locationText = sanitizeText(locationInput?.value, 140);
    const category = sanitizeText(categoryInput?.value, 80).toLowerCase();
    const visibility = sanitizeText(visibilityInput?.value, 20).toLowerCase();
    const hashtags = parseHashtags(hashtagsInput?.value);
    const listingId = Number(attachedListingInput?.value || 0);
    const thumbnailFile = thumbnailInput?.files?.[0] || null;
    const videoFile = videoInput?.files?.[0] || null;

    if (!caption || caption.length < 3) {
        showStatus("Write a more detailed caption before publishing.", "error");
        return;
    }

    if (!navigator.onLine) {
        showStatus("You are offline. Connect to the internet before publishing.", "error");
        return;
    }

    const [thumbValidation, videoValidation] = await Promise.all([
        validateImageFile(thumbnailFile),
        getVideoMetadata(videoFile)
    ]);

    if (!thumbValidation.valid) {
        showStatus(thumbValidation.message, "error");
        return;
    }

    if (!videoValidation.valid) {
        showStatus(videoValidation.message, "error");
        return;
    }

    publishBtn.disabled = true;
    showStatus("Uploading your Grow media and publishing the video...", "success");

    try {
        const [thumbnailUrl, videoUrl] = await Promise.all([
            uploadFile(thumbnailFile, "grow/thumbnails"),
            uploadFile(videoFile, "grow/videos")
        ]);

        const attachedListing = ownListings.find((item) => Number(item.id) === listingId) || null;

        const { data, error } = await supabase
            .from("grow_videos")
            .insert([{
                creator_id: currentUser.id,
                creator_email: currentUser.email,
                creator_name: currentProfile?.farm_name || currentUser.email,
                creator_avatar_url: currentProfile?.avatar_url || null,
                caption,
                hashtags,
                location_text: locationText,
                category,
                thumbnail_url: thumbnailUrl,
                video_url: videoUrl,
                duration_seconds: videoValidation.duration,
                attached_post_id: attachedListing?.id || null,
                attached_title: attachedListing?.title || null,
                attached_category: attachedListing?.category || null,
                visibility
            }])
            .select("id")
            .single();

        if (error) {
            throw new Error(error.message || "Unable to publish Grow video.");
        }

        window.location.href = `grow.html?uploaded=1&video=${encodeURIComponent(data.id)}`;
    } catch (error) {
        showStatus(error.message || "Unable to publish Grow video.", "error");
        publishBtn.disabled = false;
    }
}

function bindEvents() {
    attachedListingInput?.addEventListener("change", renderAttachedPreview);
    thumbnailInput?.addEventListener("change", () => {
        previewImage(thumbnailInput.files?.[0] || null);
    });
    videoInput?.addEventListener("change", () => {
        previewVideo(videoInput.files?.[0] || null);
    });
    publishBtn?.addEventListener("click", publishGrowVideo);
}

async function init() {
    const ok = await loadSessionAndListings();
    if (!ok) return;
    bindEvents();
}

init();