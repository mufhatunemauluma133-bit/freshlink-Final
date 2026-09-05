const PRODUCT_IMAGE_MATCHERS = [
    { tags: ["orange", "oranges", "citrus"], query: "orange orchard, fresh oranges, citrus farm" },
    { tags: ["milk", "dairy"], query: "fresh milk, dairy farm, milk bottle" },
    { tags: ["vegetable", "vegetables", "tomato", "tomatoes", "potato", "potatoes", "carrot", "spinach", "lettuce", "cabbage", "broccoli"], query: "fresh vegetables, farm harvest, organic produce" },
    { tags: ["maize", "corn", "grain", "wheat", "rice", "beans"], query: "grain farm, maize field, farm harvest" },
    { tags: ["avocado", "avocados"], query: "avocado farm, ripe avocados" },
    { tags: ["herb", "herbs", "spice", "spices"], query: "herbs and spices, farm produce" },
    { tags: ["egg", "eggs", "chicken", "poultry"], query: "poultry farm, fresh eggs, chickens" },
    { tags: ["cattle", "cow", "beef", "goat", "sheep", "livestock"], query: "livestock farm, cattle grazing" },
    { tags: ["fish", "aquaculture"], query: "aquaculture farm, fresh fish harvest" },
    { tags: ["fruit", "fruits", "mango", "banana", "apple", "grape", "berries"], query: "fresh fruit farm, orchard harvest" }
];

const STABLE_FOOD_IMAGES = {
    oranges: "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=1200&q=80",
    vegetables: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
    grains: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80",
    mangoes: "https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=1200&q=80",
    livestock: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1200&q=80",
    dairy: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=1200&q=80",
    market: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80",
    default: "https://images.unsplash.com/photo-1471194402529-8e0f5a675de6?auto=format&fit=crop&w=1200&q=80"
};

function sanitizeText(text) {
    return String(text || "").toLowerCase().trim();
}

function isLikelyValidImageUrl(url) {
    const value = String(url || "").trim();
    if (!/^https?:\/\//i.test(value)) return false;
    if (value.includes("via.placeholder.com")) return false;
    return true;
}

function resolveSearchQuery(post = {}) {
    const title = sanitizeText(post.title);
    const category = sanitizeText(post.category);
    const specialization = sanitizeText(post.farmer_specialization || post.specialization);
    const combined = `${title} ${category} ${specialization}`;

    for (const matcher of PRODUCT_IMAGE_MATCHERS) {
        if (matcher.tags.some((tag) => combined.includes(tag))) {
            return matcher.query;
        }
    }

    if (category.includes("livestock")) {
        return "realistic livestock farm, healthy farm animals";
    }

    if (category.includes("produce") || category.includes("crop")) {
        return "realistic farm produce, fresh harvest";
    }

    return "realistic agricultural produce, farm marketplace";
}

export function resolvePostImageUrl(post = {}) {
    if (isLikelyValidImageUrl(post.image_url)) {
        return post.image_url;
    }

    const combined = `${sanitizeText(post.title)} ${sanitizeText(post.category)} ${sanitizeText(post.farmer_specialization || post.specialization)}`;

    if (combined.includes("orange") || combined.includes("citrus")) return STABLE_FOOD_IMAGES.oranges;
    if (combined.includes("mango")) return STABLE_FOOD_IMAGES.mangoes;
    if (combined.includes("milk") || combined.includes("dairy")) return STABLE_FOOD_IMAGES.dairy;
    if (combined.includes("cattle") || combined.includes("livestock") || combined.includes("goat") || combined.includes("sheep")) return STABLE_FOOD_IMAGES.livestock;
    if (combined.includes("grain") || combined.includes("maize") || combined.includes("corn") || combined.includes("wheat")) return STABLE_FOOD_IMAGES.grains;
    if (combined.includes("vegetable") || combined.includes("tomato") || combined.includes("potato") || combined.includes("spinach") || combined.includes("cabbage")) return STABLE_FOOD_IMAGES.vegetables;
    if (combined.includes("market") || combined.includes("produce") || combined.includes("fruit")) return STABLE_FOOD_IMAGES.market;

    const query = resolveSearchQuery(post);
    if (query.includes("livestock")) return STABLE_FOOD_IMAGES.livestock;
    if (query.includes("grain") || query.includes("maize")) return STABLE_FOOD_IMAGES.grains;
    if (query.includes("dairy") || query.includes("milk")) return STABLE_FOOD_IMAGES.dairy;
    if (query.includes("fruit") || query.includes("orchard")) return STABLE_FOOD_IMAGES.mangoes;
    if (query.includes("vegetable") || query.includes("harvest")) return STABLE_FOOD_IMAGES.vegetables;

    return STABLE_FOOD_IMAGES.default;
}

export function escapeHtmlText(text) {
    const div = document.createElement("div");
    div.textContent = String(text || "");
    return div.innerHTML;
}
