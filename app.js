document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

// --- Data ---
const hospitalsMapData = [
    {name: "مشفى شهبا", lat: 32.859494, lng: 36.622633},
    {name: "مشفى صلخد", lat: 32.492, lng: 36.702},
    {name: "مشفى السلام", lat: 32.719843, lng: 36.568173},
    {name: "مشفى المزرعة", lat: 32.713994,  lng: 36.573214},
    {name: "المشفى الوطني", lat: 32.698699, lng: 36.579602},
    {name: "مشفى العناية", lat: 32.710505, lng: 36.569602},
    {name: "مشفى الطب الحديث", lat: 32.710687, lng: 36.583781},
    {name: "مشفى سالة", lat: 32.653299, lng: 36.776902},
    {name: "مشفى الحكمة", lat: 32.704930, lng: 36.574536}
];

let map;
let markers = [];
let deferredPrompt;

function initApp() {
    loadContacts();
    initMap();
    initSearch();
    initShare();
    initPWA();
}

// --- 1. Load Contacts from JSON ---
function loadContacts() {
    fetch('./contacts.json')
    .then(res => res.json())
    .then(data => {
        const emergencyContainer = document.getElementById('emergencyGrid');
        const hospitalContainer = document.getElementById('hospitalGrid');

        data.forEach(contact => {
            const card = createCard(contact);
            if (contact.category === "emergency") {
                emergencyContainer.appendChild(card);
            } else if (contact.category === "hospitals") {
                hospitalContainer.appendChild(card);
            }
        });
    })
    .catch(err => console.error("Error loading contacts:", err));
}

function createCard(contact) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-name', contact.name);
    card.innerHTML = `
        <div class="info">
            <div class="name">${contact.name}</div>
            <div class="number-display">${contact.number}</div>
        </div>
        <div>
            <a href="tel:${contact.number}" class="call-btn">
                <i class="fas fa-phone-alt"></i> اتصال
            </a>
        </div>
    `;
    return card;
}

// --- 2. Map & Legend Logic ---
function initMap() {
    // Default Center (Suwayda)
    map = L.map('map', {
        center: [32.7098, 36.5697],
        zoom: 9,
        attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Create Custom Legend
    const legend = L.control({ position: 'topright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'custom-legend');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        div.innerHTML = `
            <div class="legend-header">
                <strong>المشافي</strong>
                <button id="toggleLegendBtn">−</button>
            </div>
            <div class="legend-list" id="legendList"></div>
            <div class="legend-actions">
                <button id="locateBtn" class="legend-action-btn">📍 موقعي</button>
                <button id="nearestBtn" class="legend-action-btn">🏥 أقرب مشفى</button>
            </div>
        `;
        return div;
    };
    legend.addTo(map);

    // Populate Markers & Legend Items
    const legendList = document.getElementById('legendList');
    
    hospitalsMapData.forEach(hospital => {
        // Marker
        const marker = L.marker([hospital.lat, hospital.lng]).addTo(map);
        marker.bindPopup(`
            <b>${hospital.name}</b><br>
            <a target="_blank" href="https://www.google.com/maps?q=${hospital.lat},${hospital.lng}">
                فتح في خرائط Google
            </a>
        `);
        markers.push({ data: hospital, marker: marker });

        // Legend Item
        const item = document.createElement('div');
        item.className = "legend-item";
        item.textContent = hospital.name;
        item.onclick = () => {
            document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            map.flyTo([hospital.lat, hospital.lng], 15);
            marker.openPopup();
        };
        legendList.appendChild(item);
    });

    // Bind Legend Events (After DOM insertion)
    setTimeout(bindMapControls, 500);
}

function bindMapControls() {
    // Toggle Legend
    document.getElementById("toggleLegendBtn").addEventListener("click", (e) => {
        const legendDiv = document.querySelector('.custom-legend');
        legendDiv.classList.toggle('legend-collapsed');
        e.target.textContent = legendDiv.classList.contains('legend-collapsed') ? '+' : '−';
    });

    // Locate User
    document.getElementById("locateBtn").addEventListener("click", () => {
        if (!navigator.geolocation) {
            alert("المتصفح لا يدعم تحديد الموقع");
            return;
        }
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            map.flyTo([latitude, longitude], 14);
            L.marker([latitude, longitude]).bindPopup("أنت هنا").addTo(map).openPopup();
        }, () => alert("يرجى السماح بالوصول إلى الموقع"));
    });

    // Find Nearest Hospital
    document.getElementById("nearestBtn").addEventListener("click", () => {
        if (!navigator.geolocation) {
            alert("المتصفح لا يدعم تحديد الموقع");
            return;
        }
        navigator.geolocation.getCurrentPosition(pos => {
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;
            
            let nearest = null;
            let minDist = Infinity;

            hospitalsMapData.forEach(h => {
                const dist = Math.sqrt(Math.pow(h.lat - userLat, 2) + Math.pow(h.lng - userLng, 2));
                if (dist < minDist) {
                    minDist = dist;
                    nearest = h;
                }
            });

            if (nearest) {
                map.flyTo([nearest.lat, nearest.lng], 15);
                // Find and click the marker to open popup
                const target = markers.find(m => m.data.name === nearest.name);
                if(target) target.marker.openPopup();
                alert(`أقرب مشفى هو: ${nearest.name}`);
            }
        });
    });
}

// --- 3. Search Logic ---
function initSearch() {
    const input = document.getElementById('searchInput');
    input.addEventListener('keyup', () => {
        const filter = input.value.toUpperCase();
        const cards = document.getElementsByClassName('card');
        
        for (let i = 0; i < cards.length; i++) {
            const name = cards[i].getAttribute('data-name');
            cards[i].style.display = name.toUpperCase().indexOf(filter) > -1 ? "flex" : "none";
        }
    });
}

// --- 4. Sharing Logic ---
function initShare() {
    document.getElementById("shareBtn").addEventListener("click", (e) => {
        e.preventDefault();
        const text = `دليل طوارئ السويداء 🚨\nأرقام الطوارئ والمشافي في مكان واحد\n${window.location.href}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(whatsappUrl, "_blank");
    });
}

// --- 5. PWA Logic ---
function initPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.log('SW Registration Failed', err));
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (!window.matchMedia('(display-mode: standalone)').matches) {
            document.getElementById('installBanner').classList.add('visible');
        }
    });

    document.getElementById('btnInstall').addEventListener('click', () => {
        document.getElementById('installBanner').classList.remove('visible');
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt = null;
        }
    });

    document.getElementById('btnCloseBanner').addEventListener('click', () => {
        document.getElementById('installBanner').classList.remove('visible');
    });
}