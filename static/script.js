const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const clearButton = document.getElementById('clearButton');
const epochSlider = document.getElementById('epochSlider');
const epochValueSpan = document.getElementById('epochValue');
const predictionResultDiv = document.getElementById('predictionResult');
const cnnVisualizationDiv = document.getElementById('cnnVisualization');
// Status message div removed
const probabilityList = document.getElementById('probabilityList');
const closePredictionWarning = document.getElementById('closePredictionWarning');

let drawing = false;
let lastSendTime = 0; // Son veri gönderme zamanı
const SEND_INTERVAL = 10; // Veri gönderme aralığı (milisaniye)
let isPredicting = false; // Önceki istek bitmeden yeni istek yollanmasın
let debounceTimer = null; // Kullanıcı çizimi bitirdiğinde bekleme zamanlayıcısı

// HTTP ile tahmin isteği yollama fonksiyonu
async function sendPredictHTTP() {
    if (isPredicting) return;
    isPredicting = true;
    const imageData = canvas.toDataURL('image/png');
    try {
        const resp = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });
        const data = await resp.json();
        predictionResultDiv.textContent = data.prediction;
        if (data.cnn_viz_data) updateVisualization(data.cnn_viz_data);
    } catch (err) {
        console.error('HTTP predict hatası:', err);
    } finally {
        isPredicting = false;
    }
}

// Drawing functions
function startDrawing(e) {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    draw(e); // Draw a dot when clicking
}

function stopDrawing() {
    drawing = false;
    ctx.beginPath(); // Start a new path for the next stroke
    // draw sona erdi, tahmin isteği debounce ile gönderilecek
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendPredictHTTP, 1000);
}

function draw(e) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff';
    ctx.lineTo(x, y);
    ctx.stroke();

    // Çizim sırasında tahmin isteği (throttle ve isPredicting kontrolü)
    const now = Date.now();
    if (now - lastSendTime > SEND_INTERVAL && !isPredicting) {
        sendPredictHTTP();
        lastSendTime = now;
    }
}

// Görselleştirme verisini işleme ve gösterme fonksiyonu
function updateVisualization(vizData) {
    const probabilityList = document.getElementById('probabilityList');
    probabilityList.innerHTML = ''; // Listeyi temizle

    const closePredictionWarning = document.getElementById('closePredictionWarning');
    closePredictionWarning.classList.add('hidden'); // Uyarıyı her zaman gizle

    // Tahmin olasılıklarını al
    let scores = [];
    if (vizData && Array.isArray(vizData.prediction_scores)) {
        // Backend'den gelen format [[prob0, prob1, ...]] ise ilk elemanı al
        if (vizData.prediction_scores[0] && Array.isArray(vizData.prediction_scores[0])) {
            scores = vizData.prediction_scores[0];
        } else {
            scores = vizData.prediction_scores; // Zaten düz bir dizi ise doğrudan kullan
        }
    }

    // Olasılıkları listeye ekle
    if (scores.length > 0) {
        for (let i = 0; i < scores.length; i++) {
            const score = typeof scores[i] === 'number' ? scores[i] : 0;
            const listItem = document.createElement('li');
            const percentage = (score * 100).toFixed(2); // Yüzde formatı
            listItem.innerHTML = `Rakam ${i}: <strong>${percentage}%</strong>`;
            probabilityList.appendChild(listItem);
        }

        // En yüksek 2 tahmin arasındaki farkı kontrol et (isteğe bağlı)
        const sortedScores = [...scores].sort((a, b) => b - a);
        if (sortedScores.length >= 2 && (sortedScores[0] - sortedScores[1] < 0.2)) { // %20'den az fark varsa
            closePredictionWarning.classList.remove('hidden');
        }

    } else {
        probabilityList.innerHTML = '<p class="text-gray-400 italic">Çizim yapıldıkça olasılıklar burada görünecektir.</p>';
    }

    // CNN Görselleştirme alanını temizle
    cnnVisualizationDiv.innerHTML = '';
    cnnVisualizationDiv.style.backgroundColor = '#1a202c'; // Arka plan rengini sıfırla

    // Basit bir görselleştirme Placeholder'ı ekleyebiliriz
    cnnVisualizationDiv.innerHTML = '<p class="text-gray-400 italic">CNN Katman Görselleştirme burada yer alacak (ileriki geliştirmeler için).</p>';
}


// Event Listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseout', stopDrawing);

// Touch support for mobile
canvas.addEventListener('touchstart', function (e) {
  e.preventDefault();
  const touch = e.touches[0];
  startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
});
canvas.addEventListener('touchmove', function (e) {
  e.preventDefault();
  const touch = e.touches[0];
  draw({ clientX: touch.clientX, clientY: touch.clientY });
});
canvas.addEventListener('touchend', function (e) {
  e.preventDefault();
  stopDrawing();
});

clearButton.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    isPredicting = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000'; // Arka planı siyaha sıfırla
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    predictionResultDiv.textContent = '?'; // Tahmin ekranını sıfırla
    cnnVisualizationDiv.innerHTML = '<p class="text-gray-400 italic">CNN katmanlarının dinamik görselleştirmesi burada gösterilecektir (model çıktılarına göre).</p>';
    cnnVisualizationDiv.style.backgroundColor = '#1a202c';

    // Olasılıkları sıfırla
    updateVisualization({ prediction_scores: Array(10).fill(0) });
    closePredictionWarning.classList.add('hidden');
});

epochSlider.addEventListener('input', (event) => {
    epochValueSpan.textContent = event.target.value;
    // sendEpochValue(); // Epoch değeri gönderme fonksiyonunu tekrar ekleyebilirsiniz.
});

// Başlangıçta canvas'ı siyaha temizle
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Sayfa yüklendiğinde olasılıklar başlangıçta 0 olarak gösterilsin
document.addEventListener('DOMContentLoaded', () => {
    updateVisualization({ prediction_scores: Array(10).fill(0) });
});