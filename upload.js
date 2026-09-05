import { supabase } from "./supabase.js";

let farmLatitude = null;
let farmLongitude = null;

function toggleMediaFields() {
    const listingType = document.getElementById("listingType")?.value || "produce";
    const videoInput = document.getElementById("video");
    const mediaHint = document.getElementById("mediaHint");
    const produceBtn = document.getElementById("categoryProduceBtn");
    const livestockBtn = document.getElementById("categoryLivestockBtn");

    if (videoInput) {
        videoInput.style.display = listingType === "livestock" ? "block" : "none";
    }
    if (mediaHint) {
        mediaHint.textContent = listingType === "livestock"
            ? "High-quality animal photos and one HD video are required for livestock listings."
            : "Clear, realistic product photos that match your listing (for example oranges, milk, vegetables) are required. Listings stay visible for 7 days before expiring.";
    }

    if (produceBtn && livestockBtn) {
        produceBtn.style.background = listingType === "produce"
            ? "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)"
            : "rgba(255,255,255,0.08)";
        livestockBtn.style.background = listingType === "livestock"
            ? "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)"
            : "rgba(255,255,255,0.08)";
    }
}

function isPostVisible(post) {
    if (!post?.created_at) return true;

    const createdAt = new Date(post.created_at);
    if (Number.isNaN(createdAt.getTime())) return true;

    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    return expiresAt > new Date();
}

function validateImageFile(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve({ valid: false, message: "Please select an image" });
            return;
        }

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            resolve({ valid: false, message: "Please upload a JPG, PNG, or WebP image." });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            resolve({ valid: false, message: "Please upload a high-quality image smaller than 5MB." });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                if (img.width < 1200 || img.height < 900) {
                    resolve({ valid: false, message: "Please upload a high-quality photo at least 1200x900 pixels." });
                } else {
                    resolve({ valid: true });
                }
            };
            img.onerror = () => resolve({ valid: false, message: "The selected image could not be read." });
            img.src = event.target.result;
        };
        reader.onerror = () => resolve({ valid: false, message: "The selected image could not be loaded." });
        reader.readAsDataURL(file);
    });
}

function validateVideoFile(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve({ valid: false, message: "Please select a video for the livestock listing." });
            return;
        }

        const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
        if (!allowedTypes.includes(file.type)) {
            resolve({ valid: false, message: "Please upload an MP4, WebM, or MOV video." });
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            resolve({ valid: false, message: "Please upload a video smaller than 50MB." });
            return;
        }

        resolve({ valid: true });
    });
}

function sanitizeInput(value, maxLength = 255) {
    if (!value) return "";
    return String(value).trim().substring(0, maxLength);
}

function validateCurrency(value) {
    const num = Number(value || 0);
    return isFinite(num) && num > 0 ? num : 0;
}

window.setListingType = function (type) {
    const select = document.getElementById("listingType");
    if (select) {
        select.value = type;
    }
    toggleMediaFields();
};

window.getLocation = function () {
    const locMsg = document.getElementById("locationMsg");
    
    if (!navigator.geolocation) {
        locMsg.innerText = "Geolocation not supported on your device";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            farmLatitude = position.coords.latitude;
            farmLongitude = position.coords.longitude;
            locMsg.innerText = `✅ Location captured: ${farmLatitude.toFixed(4)}, ${farmLongitude.toFixed(4)}`;
            locMsg.style.color = "#a7f3d0";
        },
        (error) => {
            locMsg.innerText = `Error: ${error.message}`;
            locMsg.style.color = "#fecaca";
        }
    );
};

window.uploadPost = async function () {
    const title = document.getElementById("title").value.trim();
    const farmName = document.getElementById("farmName").value.trim();
    const location = document.getElementById("location").value.trim();
    const listingType = document.getElementById("listingType").value;
    const amount = document.getElementById("amount").value.trim();
    const unitPrice = document.getElementById("unitPrice").value.trim();
    const price = document.getElementById("price").value.trim();
    const contact = document.getElementById("contact").value.trim();
    const imageFile = document.getElementById("image").files[0];
    const videoFile = document.getElementById("video").files[0];

    const msg = document.getElementById("msg");

    if (!title || !farmName || !location || !amount || !unitPrice || !price || !contact) {
        msg.innerText = "Please fill in all fields";
        return;
    }

    const validation = await validateImageFile(imageFile);
    if (!validation.valid) {
        msg.innerText = validation.message;
        return;
    }

    if (msg) {
        msg.innerText = "Uploading realistic marketplace photo...";
    }

    if (listingType === "livestock") {
        const videoValidation = await validateVideoFile(videoFile);
        if (!videoValidation.valid) {
            msg.innerText = videoValidation.message;
            return;
        }
    }

    const unitPriceNumber = Number(unitPrice);
    const totalPriceNumber = Number(price);

    if (isNaN(unitPriceNumber) || unitPriceNumber <= 0) {
        msg.innerText = "Please enter a valid unit price.";
        return;
    }

    if (isNaN(totalPriceNumber) || totalPriceNumber <= 0) {
        msg.innerText = "Please enter a valid total price.";
        return;
    }

    // 1. Upload image to storage
    const fileName = `posts/${Date.now()}_${imageFile.name}`;

    const { error: imgError } = await supabase
        .storage
        .from("farm-images")
        .upload(fileName, imageFile);

    if (imgError) {
        msg.innerText = imgError.message;
        return;
    }

    // 2. Get public image URL
    const imageUrl = supabase
        .storage
        .from("farm-images")
        .getPublicUrl(fileName).data.publicUrl;

    let videoUrl = null;
    if (listingType === "livestock" && videoFile) {
        const videoName = `videos/${Date.now()}_${videoFile.name}`;
        const { error: videoError } = await supabase.storage.from("farm-images").upload(videoName, videoFile);
        if (!videoError) {
            videoUrl = supabase.storage.from("farm-images").getPublicUrl(videoName).data.publicUrl;
        }
    }

    // 3. Save post to database with location
    const { error } = await supabase
        .from("posts")
        .insert([
            {
                title,
                farm: farmName,
                location,
                amount,
                unit_price: unitPriceNumber,
                price: totalPriceNumber,
                contact,
                category: listingType,
                description: listingType === "livestock" ? "Livestock listing with photo and video" : "Farm product listing",
                image_url: imageUrl,
                video_url: videoUrl,
                latitude: farmLatitude,
                longitude: farmLongitude
            }
        ]);

    if (error) {
        msg.innerText = error.message;
    } else {
        msg.innerText = "Post uploaded successfully 🌱";
        setTimeout(() => {
            window.location.href = "home.html";
        }, 1500);
    }
};

document.getElementById("listingType")?.addEventListener("change", toggleMediaFields);
window.addEventListener("DOMContentLoaded", toggleMediaFields);