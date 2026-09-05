const CROP_CALENDAR = [
    {
        name: "Maize",
        category: "Grain",
        regions: ["warm", "temperate"],
        plantMonths: ["October", "November", "December", "January"],
        harvestMonths: ["March", "April", "May", "June"],
        notes: "Needs warm weather and well-drained soil."
    },
    {
        name: "Wheat",
        category: "Grain",
        regions: ["cool", "temperate"],
        plantMonths: ["May", "June", "July"],
        harvestMonths: ["October", "November", "December"],
        notes: "Best in cooler dry seasons with moderate irrigation."
    },
    {
        name: "Tomato",
        category: "Vegetable",
        regions: ["warm", "temperate"],
        plantMonths: ["August", "September", "October", "November"],
        harvestMonths: ["December", "January", "February", "March"],
        notes: "Use staking and regular pest checks for better quality."
    },
    {
        name: "Potato",
        category: "Vegetable",
        regions: ["cool", "temperate"],
        plantMonths: ["August", "September", "October"],
        harvestMonths: ["December", "January", "February"],
        notes: "Avoid waterlogging and rotate fields to reduce disease."
    },
    {
        name: "Spinach",
        category: "Leafy",
        regions: ["cool", "temperate", "warm"],
        plantMonths: ["February", "March", "April", "May", "June", "July", "August"],
        harvestMonths: ["March", "April", "May", "June", "July", "August", "September"],
        notes: "Fast crop with frequent harvesting every few weeks."
    },
    {
        name: "Cabbage",
        category: "Vegetable",
        regions: ["cool", "temperate"],
        plantMonths: ["February", "March", "April", "May"],
        harvestMonths: ["June", "July", "August", "September"],
        notes: "Needs steady moisture for firm heads."
    },
    {
        name: "Onion",
        category: "Vegetable",
        regions: ["cool", "temperate"],
        plantMonths: ["March", "April", "May"],
        harvestMonths: ["August", "September", "October"],
        notes: "Keep beds weed-free and stop heavy watering before harvest."
    },
    {
        name: "Carrot",
        category: "Root",
        regions: ["cool", "temperate"],
        plantMonths: ["February", "March", "April", "May", "June"],
        harvestMonths: ["May", "June", "July", "August", "September"],
        notes: "Loose soil improves root shape and size."
    },
    {
        name: "Butternut",
        category: "Vegetable",
        regions: ["warm", "temperate"],
        plantMonths: ["September", "October", "November"],
        harvestMonths: ["January", "February", "March"],
        notes: "Allow enough spacing and sunlight for good fruit set."
    },
    {
        name: "Green Beans",
        category: "Legume",
        regions: ["warm", "temperate"],
        plantMonths: ["September", "October", "November", "December"],
        harvestMonths: ["December", "January", "February", "March"],
        notes: "Harvest pods frequently to keep plants productive."
    }
];

const cropSearchInput = document.getElementById("cropSearchInput");
const monthFilter = document.getElementById("monthFilter");
const regionFilter = document.getElementById("regionFilter");
const runCalendarSearch = document.getElementById("runCalendarSearch");
const calendarResults = document.getElementById("calendarResults");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text || "");
    return div.innerHTML;
}

function cropMatches(crop) {
    const searchText = String(cropSearchInput?.value || "").trim().toLowerCase();
    const month = String(monthFilter?.value || "").trim();
    const region = String(regionFilter?.value || "").trim();

    const matchesText = !searchText
        || crop.name.toLowerCase().includes(searchText)
        || crop.category.toLowerCase().includes(searchText);

    const matchesMonth = !month
        || crop.plantMonths.includes(month)
        || crop.harvestMonths.includes(month);

    const matchesRegion = !region || crop.regions.includes(region);

    return matchesText && matchesMonth && matchesRegion;
}

function formatRegionName(region) {
    if (region === "warm") return "Warm region";
    if (region === "temperate") return "Temperate region";
    if (region === "cool") return "Cool region";
    return region;
}

function renderResults() {
    if (!calendarResults) return;

    const filtered = CROP_CALENDAR.filter(cropMatches);

    if (!filtered.length) {
        calendarResults.innerHTML = '<div class="calendar-empty">No crop found. Try another crop name or select a different month.</div>';
        return;
    }

    calendarResults.innerHTML = filtered.map((crop) => {
        const regionsText = crop.regions.map(formatRegionName).join(", ");
        return `
            <div class="calendar-result">
                <h3>${escapeHtml(crop.name)}</h3>
                <div class="calendar-tags">
                    <span class="calendar-tag">${escapeHtml(crop.category)}</span>
                    <span class="calendar-tag">${escapeHtml(regionsText)}</span>
                </div>
                <p class="calendar-metadata"><strong>Planting months:</strong> ${escapeHtml(crop.plantMonths.join(", "))}</p>
                <p class="calendar-metadata"><strong>Harvest months:</strong> ${escapeHtml(crop.harvestMonths.join(", "))}</p>
                <p class="calendar-metadata"><strong>Tip:</strong> ${escapeHtml(crop.notes)}</p>
            </div>
        `;
    }).join("");
}

function bindShortcutButtons() {
    document.querySelectorAll(".calendar-shortcuts button").forEach((button) => {
        button.addEventListener("click", () => {
            const cropName = String(button.getAttribute("data-crop") || "");
            if (cropSearchInput) cropSearchInput.value = cropName;
            renderResults();
        });
    });
}

if (runCalendarSearch) {
    runCalendarSearch.addEventListener("click", renderResults);
}

if (cropSearchInput) {
    cropSearchInput.addEventListener("input", renderResults);
}

if (monthFilter) {
    monthFilter.addEventListener("change", renderResults);
}

if (regionFilter) {
    regionFilter.addEventListener("change", renderResults);
}

bindShortcutButtons();
renderResults();
