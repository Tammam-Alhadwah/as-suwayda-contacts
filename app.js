document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

// --- Data ---
const hospitalsMapData = [
    {name: "مشفى شهبا", lat: 32.859494, lng: 36.622633},
    {name: "مشفى صلخد", lat: 32.48422498659142, lng: 36.72546330079875},
    {name: "مشفى السلام", lat: 32.719843, lng: 36.568173},
    {name: "مشفى المزرعة", lat: 32.713994,  lng: 36.573214},
    {name: "المشفى الوطني", lat: 32.698699, lng: 36.579602},
    {name: "مشفى العناية", lat: 32.710505, lng: 36.569602},
    {name: "مشفى الطب الحديث", lat: 32.710687, lng: 36.583781},
    {name: "مشفى سالة", lat: 32.65316286675307, lng: 36.77686542973518},
    {name: "مشفى الحكمة", lat: 32.704930, lng: 36.574536}
];

let map;
let markers = [];
let currentUserMarker = null; // Track user marker to prevent duplicates
let deferredPrompt;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


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

        // --- إضافة بطاقة إعلان ClinicBook للأطباء ---
        // 1. ضع رقمك هنا (مع رمز الدولة بدون +، مثال لسوريا: 9639xxxxxxxx)
        const myWhatsAppNumber = "963995797309"; 
        
        // 2. الرسالة الجاهزة التي ستصلك
        const waMessage = "مرحباً، أنا طبيب/ة ومهتم/ة بتجربة نظام ClinicBook لأتمتة مواعيد عيادتي.";
        const encodedMessage = encodeURIComponent(waMessage);
        const waUrl = `https://wa.me/${myWhatsAppNumber}?text=${encodedMessage}`;

        const promoCard = document.createElement('div');
        promoCard.className = 'card promo-card'; // Add specific CSS for this
        promoCard.innerHTML = `
        <div class="info">
            <div class="promo-card" style="color: #2980b9;">خدمة للأطباء 👨‍⚕️</div>
            <div class="number-display" style="font-size: 0.8rem; color: #555;">
             نظم مواعيد عيادتك إلكترونياً و تلقائياً مع   
            ClinicBook 
            </div>
        </div>
        <div>
            <a href="${waUrl}" target="_blank" class="call-btn" style="background-color: #2980b9;">
                تفاصيل
            </a>
        </div>
        `;
        hospitalContainer.appendChild(promoCard);
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

    // 1. Handle Multiple Numbers (Array) vs Single Number (String)
    let numberDisplay = "";
    let actionButtons = "";

    if (Array.isArray(contact.number)) {
        // It is an array (e.g. Red Crescent)
        // Join numbers with a slash for display: "133 / 016-xxxx"
        numberDisplay = contact.number.join(', ');

        // Create a button for EACH number
        contact.number.forEach(num => {
            actionButtons += `
                <a href="tel:${num}" class="call-btn" style="margin-top:5px; font-size:0.8rem;">
                    <i class="fas fa-phone-alt"></i> ${num}
                </a>
            `;
        });
        // Wrap buttons in a column so they stack nicely
        actionButtons = `<div style="display:flex; flex-direction:column; gap:5px;">${actionButtons}</div>`;

    } else {
        // It is a single string (Standard contact)
        numberDisplay = contact.number;
        actionButtons = `
            <a href="tel:${contact.number}" class="call-btn">
                <i class="fas fa-phone-alt"></i> اتصال
            </a>
        `;
    }

    // 2. Build the Card HTML
    card.innerHTML = `
        <div class="info">
            <div class="name">${contact.name}</div>
            <div class="number-display">${numberDisplay}</div>
        </div>
        <div>
            ${actionButtons}
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
    const locateBtn = document.getElementById("locateBtn");
    locateBtn.addEventListener("click", () => {
        setLoading(locateBtn, true);

        if (!navigator.geolocation) {
            alert("المتصفح لا يدعم تحديد الموقع");
            setLoading(locateBtn, false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                
                // Remove existing marker if it exists
                if (currentUserMarker) {
                    map.removeLayer(currentUserMarker);
                }

                // Add a special blue dot for user
                const userIcon = L.divIcon({
                    className: 'user-location-dot',
                    html: '<div style="width:15px;height:15px;background:#3498db;border:2px solid #fff;border-radius:50%;box-shadow:0 0 5px rgba(0,0,0,0.5);"></div>'
                });

                currentUserMarker = L.marker([latitude, longitude], {icon: userIcon})
                    .addTo(map)
                    .bindPopup("موقعك الحالي").openPopup();

                map.setView([latitude, longitude], 13);
                setLoading(locateBtn, false);
            },
            (err) => {
                console.error(err);
                alert("تعذر تحديد الموقع. يرجى تفعيل GPS.");
                setLoading(locateBtn, false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // Find Nearest Hospital
    const nearestBtn = document.getElementById("nearestBtn");
    nearestBtn.addEventListener("click", () => {
        setLoading(nearestBtn, true);

        if (!navigator.geolocation) {
            alert("المتصفح لا يدعم تحديد الموقع");
            setLoading(nearestBtn, false);
            return;
        }

        navigator.geolocation.getCurrentPosition((pos) => {
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;

            let nearest = null;
            let minDist = Infinity;

            hospitalsMapData.forEach(h => {
                const dist = getDistanceFromLatLonInKm(userLat, userLng, h.lat, h.lng);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = h;
                }
            });

            if (nearest) {
                // 1. Highlight in Legend (simulate selection)
                const legendItems = document.querySelectorAll('.legend-item');
                legendItems.forEach(el => {
                    el.classList.remove('active');
                    // Check if text content matches hospital name
                    if (el.textContent === nearest.name) {
                        el.classList.add('active');
                        // Scroll list to show this item
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                });

                // 2. Fly to Hospital and Open Popup
                map.flyTo([nearest.lat, nearest.lng], 15);
                const target = markers.find(m => m.data.name === nearest.name);
                if(target) target.marker.openPopup();

                setLoading(nearestBtn, false);
            }
        }, () => {
            alert("يرجى تفعيل الموقع لمعرفة أقرب مشفى");
            setLoading(nearestBtn, false);
        });
    });
}

// Helper: Haversine Formula for accurate distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1);
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c;
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

function setLoading(btn, isLoading) {
    if(isLoading) {
        btn.setAttribute('disabled', 'true');
        const originalText = btn.innerText;
        btn.setAttribute('data-text', originalText);
        btn.innerHTML = `جارِ العمل <div class="spinner"></div>`;
    } else {
        btn.removeAttribute('disabled');
        btn.innerText = btn.getAttribute('data-text');
    }
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
        
        navigator.serviceWorker.register('./sw.js').then(reg => {
            
            // 1. Check if update is ALREADY waiting (The fix)
            if (reg.waiting) {
                document.getElementById('updateBanner').style.display = 'block';
            }

            // 2. Check if update is found NOW
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        document.getElementById('updateBanner').style.display = 'block';
                    }
                });
            });
        });

        // 3. Handle the "Refresh" button click
        document.getElementById('btnRefresh').addEventListener('click', () => {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg && reg.waiting) {
                    // Tell the waiting worker to take over immediately
                    reg.waiting.postMessage({ action: 'skipWaiting' });
                } else {
                    window.location.reload(); 
                }
            });
        });

        // 4. Reload page when the new worker takes control
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }

    // --- Install Banner Logic (Unchanged) ---
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