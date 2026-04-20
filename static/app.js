const map = L.map('map').setView([48.696, -113.718], 10); // Center of Glacier NP
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
}).addTo(map);

let currentLayers = L.layerGroup().addTo(map);
let availableDates = [];
let currentDateIndex = 0;

// Helper function to create custom SVG pins
const getPinIcon = (pinType) => {
    let pinColor = '#3498db'; // Default blue
    let innerHtml = 'ℹ️';

    // Match the styles from the screenshot
    if (pinType === 'gate' || pinType === 'winter_rec') {
        pinColor = '#e74c3c'; // Red
        // Create the red minus sign
        innerHtml = '<div style="width: 12px; height: 4px; background: #e74c3c; border-radius: 1px;"></div>';
    } else if (pinType === 'hiker_biker') {
        pinColor = '#f1c40f'; // Yellow
        // Use a bicyclist emoji for the hiker/biker icon
        innerHtml = '<span style="font-size: 16px; color: black;">🚴</span>';
    } else if (pinType === 'snow_plow') {
        pinColor = '#9b59b6'; // Purple
        // Use a tractor emoji for the plow
        innerHtml = '<span style="font-size: 14px;">🚜</span>';
    }

    // The SVG shape for the teardrop pin (removed the filter from here)
    const svgPin = `
        <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 0; left: 0; z-index: 1;">
            <path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27c0-8.3-6.7-15-15-15z" fill="${pinColor}" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="15" cy="15" r="10" fill="white" />
        </svg>
    `;

    // Combine the SVG and the inner icon
    // Moved the drop-shadow to this parent container
    const html = `
        <div style="position: relative; width: 30px; height: 42px; filter: drop-shadow(2px 4px 4px rgba(0,0,0,0.4));">
            ${svgPin}
            <div style="position: absolute; top: 0; left: 0; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center; z-index: 2;">
                ${innerHtml}
            </div>
        </div>
    `;

    return L.divIcon({
        html: html,
        className: '', // This removes Leaflet's default white square styling
        iconSize: [30, 42],
        iconAnchor: [15, 42], // Anchors the bottom tip of the pin to the exact coordinate
        popupAnchor: [0, -42] // Makes the popup open directly above the pin
    });
};

// Initialize App
async function init() {
    const res = await fetch('/api/available_dates');
    availableDates = await res.json();

    if (availableDates.length > 0) {
        loadDataForDate(availableDates[0]); // Load latest by default
        renderTimeline();
    } else {
        document.getElementById('currentDateDisplay').innerText = "No data in database. Run fetch_data.py!";
    }
}

// Load Data for a specific date
async function loadDataForDate(dateStr) {
    document.getElementById('currentDateDisplay').innerText = "Date: " + dateStr;
    document.getElementById('datePicker').value = dateStr;
    currentDateIndex = availableDates.indexOf(dateStr);

    const res = await fetch(`/api/data?date=${dateStr}`);
    const data = await res.json();

    currentLayers.clearLayers();

    const showRoads = document.getElementById('filterRoads').checked;
    const showGates = document.getElementById('filterGates').checked;
    const showHikers = document.getElementById('filterHikers').checked;

    // Draw Roads
    if (showRoads) {
        data.roads.forEach(road => {
            if (!road.geometry || road.geometry === "null") return;
            const geojson = JSON.parse(road.geometry);
            const color = road.status === 'open' ? 'green' : (road.status === 'closed' ? 'red' : 'orange');

            L.geoJSON(geojson, {
                style: { color: color, weight: 4 }
            }).bindPopup(`<b>${road.rdname}</b><br>Status: ${road.status}<br>Reason: ${road.reason || 'N/A'}`).addTo(currentLayers);
        });
    }

    // Draw Pins
    data.pins.forEach(pin => {
        if (!pin.geometry || pin.geometry === "null") return;

        if (!showGates && pin.pin_type === 'gate') return;
        if (!showHikers && pin.pin_type === 'hiker_biker') return;

        const geojson = JSON.parse(pin.geometry);
        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                // Use our new custom icon function here!
                return L.marker(latlng, { icon: getPinIcon(pin.pin_type) });
            }
        }).bindPopup(`<b>${pin.name || pin.pin_type.replace('_', ' ').toUpperCase()}</b><br>${pin.description}`).addTo(currentLayers);
    });

    renderTimeline();
}

// Render the 30-day timeline
function renderTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    // Grab a 30-day window around the current date
    const startIdx = Math.max(0, currentDateIndex - 15);
    const windowDates = availableDates.slice(startIdx, startIdx + 30).reverse(); // older to newer

    windowDates.forEach(date => {
        const item = document.createElement('div');
        item.className = `timeline-item ${date === availableDates[currentDateIndex] ? 'active' : ''}`;
        item.innerText = date;

        // Example: Add an event dot randomly to simulate data diffs
        // (In a full prod app, your API would return a flag if an event happened this day)
        if (Math.random() > 0.7) {
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            dot.title = "Events occurred on this day";
            item.appendChild(dot);
        }

        item.onclick = () => loadDataForDate(date);
        timeline.appendChild(item);
    });

    // Scroll active item into view
    const activeItem = document.querySelector('.timeline-item.active');
    if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', inline: 'center' });
}

// Controls
document.getElementById('btnPrev').onclick = () => {
    if (currentDateIndex < availableDates.length - 1) loadDataForDate(availableDates[currentDateIndex + 1]);
};

document.getElementById('btnNext').onclick = () => {
    if (currentDateIndex > 0) loadDataForDate(availableDates[currentDateIndex - 1]);
};

document.getElementById('btnToday').onclick = () => {
    if (availableDates.length > 0) loadDataForDate(availableDates[0]);
};

document.getElementById('datePicker').addEventListener('change', (e) => {
    if (availableDates.includes(e.target.value)) {
        loadDataForDate(e.target.value);
    } else {
        alert("No data available for this date in the database.");
    }
});

// Filters
document.querySelectorAll('.filters input').forEach(cb => {
    cb.addEventListener('change', () => loadDataForDate(availableDates[currentDateIndex]));
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') document.getElementById('btnPrev').click();
    if (e.key === 'ArrowRight') document.getElementById('btnNext').click();
});

init();