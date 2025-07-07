const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const clearButton = document.getElementById('clearButton');
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
    
    // Katman görselleştirmesini loading state'e al
    showLayerLoading();
    
    const imageData = canvas.toDataURL('image/png');
    try {
        const resp = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });
        const data = await resp.json();
        
        // Tahmin sonucunu güncelle
        predictionResultDiv.textContent = data.prediction;
        
        // Olasılıkları güncelle
        updateVisualization({ prediction_scores: data.probabilities || Array(10).fill(0) });
        
        // Katman aktivasyonlarını görselleştir
        if (data.layer_activations) {
            updateLayerVisualization(data.layer_activations);
        }

        // Network bağlantı görselleştirmesini güncelle
        if (networkVisualizer) {
            networkVisualizer.updateNetworkActivations(
                data.prediction,
                data.probabilities,
                data.layer_activations
            );
        }
        
    } catch (err) {
        console.error('HTTP predict error:', err);
        showLayerError('Prediction error occurred');
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
        // En yüksek olasılığı bul
        const maxScore = Math.max(...scores);
        const maxIndex = scores.indexOf(maxScore);
        
        for (let i = 0; i < Math.min(scores.length, 10); i++) { // Sadece 0-9 rakamları
            const score = typeof scores[i] === 'number' ? scores[i] : 0;
            const listItem = document.createElement('li');
            const percentage = (score * 100).toFixed(1); // Yüzde formatı (1 ondalık)
            
            // En yüksek olasılığa sahip rakamı vurgula
            if (i === maxIndex && score > 0.1) {
                listItem.classList.add('highest');
            }
            
            listItem.innerHTML = `
                <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 2px;">Digit ${i}</div>
                <div style="font-weight: 700; font-size: 1.1rem; color: inherit;">${percentage}%</div>
            `;
            probabilityList.appendChild(listItem);
        }

        // En yüksek 2 tahmin arasındaki farkı kontrol et (isteğe bağlı)
        const sortedScores = [...scores].sort((a, b) => b - a);
        if (sortedScores.length >= 2 && (sortedScores[0] - sortedScores[1] < 0.15)) { // %15'den az fark varsa
            closePredictionWarning.classList.remove('hidden');
        }

    } else {
        // Boş durumda tüm rakamları %0 ile göster
        for (let i = 0; i < 10; i++) {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 2px;">Digit ${i}</div>
                <div style="font-weight: 700; font-size: 1.1rem; color: inherit;">0.0%</div>
            `;
            probabilityList.appendChild(listItem);
        }
    }
}


// Layer Visualization Functions
function showLayerLoading() {
    cnnVisualizationDiv.innerHTML = '<div class="layer-loading">Computing layer activations...</div>';
}

function showLayerError(message) {
    cnnVisualizationDiv.innerHTML = `<div class="layer-loading" style="color: #fc8181;">${message}</div>`;
}

function updateLayerVisualization(layerActivations) {
    if (!layerActivations || layerActivations.length === 0) {
        cnnVisualizationDiv.innerHTML = '<div class="layer-loading">Layer data not found</div>';
        return;
    }
    
    // Create layer visualization container
    const layerContainer = document.createElement('div');
    layerContainer.className = 'layer-visualization';
    
    layerActivations.forEach((layer, index) => {
        const layerCard = createLayerCard(layer, index);
        layerContainer.appendChild(layerCard);
    });
    
    cnnVisualizationDiv.innerHTML = '';
    cnnVisualizationDiv.appendChild(layerContainer);
    
    // Start animations
    setTimeout(() => {
        animateLayerActivations(layerActivations);
    }, 100);
}

function createLayerCard(layer, index) {
    const card = document.createElement('div');
    card.className = 'layer-card';
    card.setAttribute('data-index', index);
    
    // Katman başlığı
    const title = document.createElement('div');
    title.className = 'layer-title';
    title.textContent = layer.layer_name || `Layer ${index + 1}`;
    
    // Katman tipi
    const type = document.createElement('div');
    type.className = 'layer-type';
    type.textContent = layer.layer_type || 'Unknown';
    
    // Nöron grid'i
    const neuronsGrid = document.createElement('div');
    neuronsGrid.className = 'neurons-grid';
    
    // Aktivasyonları normalize et
    const activations = layer.activations || [];
    const maxActivation = Math.max(...activations, 0.1);
    const minActivation = Math.min(...activations, 0);
    
    // İlk 24 nöronu göster (8x3 grid)
    const displayCount = Math.min(24, activations.length);
    for (let i = 0; i < displayCount; i++) {
        const neuron = document.createElement('div');
        neuron.className = 'neuron';
        
        if (i < activations.length) {
            const normalizedActivation = (activations[i] - minActivation) / (maxActivation - minActivation);
            neuron.setAttribute('data-activation', normalizedActivation);
            
            // Aktivasyon seviyesine göre sınıf ekle
            if (normalizedActivation > 0.7) {
                neuron.classList.add('active');
            } else if (normalizedActivation > 0.4) {
                neuron.classList.add('medium');
            } else {
                neuron.classList.add('low');
            }
        }
        
        neuronsGrid.appendChild(neuron);
    }
    
    // Aktivasyon değeri
    const activationValue = document.createElement('div');
    activationValue.className = 'activation-value';
    const avgActivation = activations.length > 0 ? 
        (activations.reduce((a, b) => a + b, 0) / activations.length) : 0;
    activationValue.textContent = `Avg: ${avgActivation.toFixed(3)}`;
    
    // Bağlantı göstergesi (son katman hariç)
    const connections = document.createElement('div');
    connections.className = 'layer-connections';
    
    card.appendChild(title);
    card.appendChild(type);
    card.appendChild(neuronsGrid);
    card.appendChild(activationValue);
    if (index < 3) { // Son katman hariç bağlantı göster
        card.appendChild(connections);
    }
    
    return card;
}

function animateLayerActivations(layerActivations) {
    const cards = document.querySelectorAll('.layer-card');
    
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.classList.add('active', 'animating');
            
            // Bağlantıları da aktif et
            const connection = card.querySelector('.layer-connections');
            if (connection) {
                setTimeout(() => {
                    connection.classList.add('active');
                }, 200);
            }
            
            // Aktivasyon animasyonunu kaldır
            setTimeout(() => {
                card.classList.remove('animating');
            }, 500);
            
            // Aktif durumu kaldır
            setTimeout(() => {
                card.classList.remove('active');
                if (connection) {
                    connection.classList.remove('active');
                }
            }, 2000);
            
        }, index * 300); // Her katman için 300ms gecikme
    });
}

// Gerçek zamanlı nöron aktivasyon güncelleme
function updateNeuronActivations(layerIndex, activations) {
    const card = document.querySelector(`[data-index="${layerIndex}"]`);
    if (!card) return;
    
    const neurons = card.querySelectorAll('.neuron');
    const maxActivation = Math.max(...activations, 0.1);
    const minActivation = Math.min(...activations, 0);
    
    neurons.forEach((neuron, index) => {
        if (index < activations.length) {
            const normalizedActivation = (activations[index] - minActivation) / (maxActivation - minActivation);
            
            // Sınıfları temizle
            neuron.classList.remove('active', 'medium', 'low');
            
            // Yeni sınıf ekle
            if (normalizedActivation > 0.7) {
                neuron.classList.add('active');
            } else if (normalizedActivation > 0.4) {
                neuron.classList.add('medium');
            } else {
                neuron.classList.add('low');
            }
        }
    });
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
    
    // Reset layer visualization
    cnnVisualizationDiv.innerHTML = '<div class="layer-loading">Computing layer activations...</div>';

    // Reset probabilities
    updateVisualization({ prediction_scores: Array(10).fill(0) });
    closePredictionWarning.classList.add('hidden');        // Reset network visualizer
        if (networkVisualizer) {
            networkVisualizer.resetNetwork();
            networkVisualizer.drawNetwork();
        }
    });
    
    // Başlangıçta canvas'ı siyaha temizle
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

// Page load initialization
document.addEventListener('DOMContentLoaded', () => {
    updateVisualization({ prediction_scores: Array(10).fill(0) });
    // Set layer visualization to initial state
    cnnVisualizationDiv.innerHTML = '<div class="layer-loading">Computing layer activations...</div>';
    
    // Start network visualizer
    if (document.getElementById('networkCanvas')) {
        networkVisualizer = new NetworkConnectionVisualizer();
        console.log('Network visualizer initialized');
    }
});

// Network Bağlantı Görselleştirme Sınıfı
class NetworkConnectionVisualizer {
    constructor() {
        this.canvas = document.getElementById('networkCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.animationId = null;
        this.isAnimating = false;
        
        // Network yapısı - ikinci görseldeki gibi
        this.layers = [
            { nodes: 4, x: 80, y: 200, color: '#e2e8f0', activeColor: '#66f9ee' },
            { nodes: 6, x: 200, y: 200, color: '#94a3b8', activeColor: '#3b82f6' },
            { nodes: 4, x: 320, y: 200, color: '#64748b', activeColor: '#10b981' },
            { nodes: 10, x: 440, y: 200, color: '#475569', activeColor: '#ef4444' }
        ];
        
        this.connections = [];
        this.nodeActivations = [];
        this.connectionActivations = [];
        
        this.initNetwork();
    }
    
    initNetwork() {
        // Canvas boyutlarını büyüt ve daha iyi hizala
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = 500;
        this.canvas.height = 450; // Increase canvas height
        
        // Adjust layer positions for more vertical space
        this.layers = [
            { nodes: 4, x: 100, y: 225, color: '#4ade80', activeColor: '#22c55e' }, // Centered
            { nodes: 6, y: 225, x: 200, color: '#60a5fa', activeColor: '#3b82f6' }, // Centered
            { nodes: 4, x: 300, y: 225, color: '#d8b4fe', activeColor: '#c084fc' }, // Centered brighter purple
            { nodes: 10, x: 400, y: 225, color: '#f87171', activeColor: '#ef4444' } // Centered
        ];
        
        // Bağlantıları ve aktivasyonları başlat
        this.resetNetwork();
        this.drawNetwork();
    }
    
    resetNetwork() {
        this.connections = [];
        this.nodeActivations = this.layers.map(layer => 
            Array(layer.nodes).fill(0.1)
        );
        this.connectionActivations = [];
        
        // Bağlantı matrisini oluştur - daha az bağlantı
        for (let i = 0; i < this.layers.length - 1; i++) {
            const fromLayer = this.layers[i];
            const toLayer = this.layers[i + 1];
            const layerConnections = [];
            
            for (let from = 0; from < fromLayer.nodes; from++) {
                for (let to = 0; to < toLayer.nodes; to++) {
                    // Sadece %50 ihtimalle bağlantı oluştur
                    if (Math.random() > 0.5) {
                        layerConnections.push({
                            from: { layer: i, node: from },
                            to: { layer: i + 1, node: to },
                            strength: 0.1
                        });
                    }
                }
            }
            this.connections.push(layerConnections);
            this.connectionActivations.push(layerConnections.map(() => 0.1));
        }
    }
    
    updateNetworkActivations(prediction, probabilities, layerActivations) {
        // Input layer - random activation
        this.nodeActivations[0] = Array(4).fill(0).map(() => 0.3 + Math.random() * 0.7);
        
        // Hidden layers - from layer activations
        if (layerActivations && layerActivations.length > 0) {
            // Hidden Layer 1 (index 1) - Mapped from the first convolutional layer
            if (layerActivations.length > 0 && layerActivations[0] && layerActivations[0].activations) {
                const activations = layerActivations[0].activations.slice(0, this.layers[1].nodes);
                this.nodeActivations[1] = activations.map(a => Math.max(0.1, Math.min(1, a)));
                while (this.nodeActivations[1].length < this.layers[1].nodes) {
                    this.nodeActivations[1].push(0.1);
                }
            }

            // Hidden Layer 2 (index 2) - Mapped from the second convolutional layer (index 2)
            if (layerActivations.length > 2 && layerActivations[2] && layerActivations[2].activations) {
                const activations = layerActivations[2].activations.slice(0, this.layers[2].nodes);
                const areAllZero = activations.every(a => a === 0);

                if (areAllZero) {
                    this.nodeActivations[2] = Array(this.layers[2].nodes).fill(0.15); // Stable minimal activation
                } else {
                    this.nodeActivations[2] = activations.map(a => Math.max(0.1, Math.min(1, a)));
                }

                while (this.nodeActivations[2].length < this.layers[2].nodes) {
                    this.nodeActivations[2].push(0.1);
                }
            } else {
                // Fallback if data for Hidden 2 is missing
                this.nodeActivations[2] = Array(4).fill(0).map(() => {
                    const prevLayerAvg = this.nodeActivations[1].reduce((a, b) => a + b, 0) / this.nodeActivations[1].length;
                    return Math.max(0.1, Math.min(1, prevLayerAvg + (Math.random() - 0.5) * 0.4));
                });
            }
        } else {
            // No layer activations available, generate random meaningful data
            this.nodeActivations[1] = Array(6).fill(0).map(() => 0.3 + Math.random() * 0.6);
            this.nodeActivations[2] = Array(4).fill(0).map(() => 0.3 + Math.random() * 0.6);
        }
        
        // Output layer - prediction probabilities
        if (probabilities && probabilities.length >= 10) {
            this.nodeActivations[3] = probabilities.slice(0, 10);
        } else {
            // Generate random output activations if no probabilities
            this.nodeActivations[3] = Array(10).fill(0).map(() => Math.random() * 0.5);
        }
        
        // Update connection strengths
        this.updateConnectionStrengths();
        
        // Start animation
        this.startAnimation();
    }
    
    updateConnectionStrengths() {
        for (let layerIndex = 0; layerIndex < this.connections.length; layerIndex++) {
            const connections = this.connections[layerIndex];
            
            connections.forEach((connection, connIndex) => {
                const fromActivation = this.nodeActivations[connection.from.layer][connection.from.node];
                const toActivation = this.nodeActivations[connection.to.layer][connection.to.node];
                
                let strength;
                // For connections from Hidden 2 (layer 2) to Output (layer 3),
                // make the strength primarily dependent on the source activation.
                if (connection.from.layer === 2 && connection.to.layer === 3) {
                    strength = fromActivation;
                    // Ensure a minimum strength so Hidden 2->Output connections are always visible
                    strength = Math.max(strength, 0.3);
                } else {
                    // Original logic for other connections
                    strength = Math.sqrt(fromActivation * toActivation);
                }

                connection.strength = Math.max(0.1, Math.min(1, strength));
                this.connectionActivations[layerIndex][connIndex] = connection.strength;
            });
        }
    }
    
    drawNetwork() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Background gradient
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#1a202c');
        gradient.addColorStop(0.5, '#2d3748');
        gradient.addColorStop(1, '#1a202c');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections
        this.drawConnections();
        
        // Draw nodes
        this.drawNodes();
        
        // Draw layer labels
        this.drawLabels();
    }
    
    drawConnections() {
        this.connections.forEach((layerConnections, layerIndex) => {
            layerConnections.forEach((connection, connIndex) => {
                const fromPos = this.getNodePosition(connection.from.layer, connection.from.node);
                const toPos = this.getNodePosition(connection.to.layer, connection.to.node);
                
                const strength = this.connectionActivations[layerIndex][connIndex];
                const alpha = 0.1 + strength * 0.4; // More distinct alpha values
                const lineWidth = 0.8 + strength * 2.5;
                
                // Color selection by layer
                let color;
                switch (layerIndex) {
                    case 0: color = `rgba(74, 222, 128, ${alpha})`; break; // Green
                    case 1: color = `rgba(96, 165, 250, ${alpha})`; break; // Blue  
                    case 2: color = `rgba(216, 180, 254, ${alpha})`; break; // Bright Purple
                    default: color = `rgba(248, 113, 113, ${alpha})`; // Red
                }
                
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = lineWidth;
                this.ctx.setLineDash(strength > 0.6 ? [] : [3, 2]); // Strong connections are solid
                
                // Draw connection line (start/end from node edges)
                const nodeRadius = 18;
                const angle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
                const startX = fromPos.x + Math.cos(angle) * nodeRadius;
                const startY = fromPos.y + Math.sin(angle) * nodeRadius;
                const endX = toPos.x - Math.cos(angle) * nodeRadius;
                const endY = toPos.y - Math.sin(angle) * nodeRadius;
                
                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            });
        });
    }
    
    getNodePosition(layerIndex, nodeIndex) {
        const layer = this.layers[layerIndex];
        const totalNodes = layer.nodes;
        
        // Use more vertical space, especially for the output layer
        let ySpacing;
        if (layerIndex === 3) { // Output layer
            ySpacing = 40; // Further increase vertical spacing for output nodes
        } else {
            ySpacing = 40; // Standard spacing for other layers
        }

        const totalHeight = (totalNodes - 1) * ySpacing;
        const startY = layer.y - totalHeight / 2;
        
        return {
            x: layer.x,
            y: startY + nodeIndex * ySpacing
        };
    }

    drawNodes() {
        this.layers.forEach((layer, layerIndex) => {
            for (let nodeIndex = 0; nodeIndex < layer.nodes; nodeIndex++) {
                const pos = this.getNodePosition(layerIndex, nodeIndex);
                const activation = this.nodeActivations[layerIndex][nodeIndex];
                
                // Node radius based on activation
                const baseRadius = layerIndex === 3 ? 12 : 15; // Smaller radius for output nodes
                const radius = baseRadius + activation * 8;
                
                // Node color
                const color = layer.color;
                const activeColor = layer.activeColor;
                const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
                gradient.addColorStop(0, activeColor);
                gradient.addColorStop(activation, color);
                gradient.addColorStop(1, color);
                
                this.ctx.fillStyle = gradient;
                this.ctx.globalAlpha = 0.6 + activation * 0.4;
                
                // Glow effect
                this.ctx.shadowBlur = 15 + activation * 15;
                this.ctx.shadowColor = activeColor;
                
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Reset shadow and alpha for next elements
                this.ctx.shadowBlur = 0;
                this.ctx.globalAlpha = 1;
                
                // Draw label for output nodes
                if (layerIndex === this.layers.length - 1) {
                    this.ctx.fillStyle = '#e2e8f0';
                    this.ctx.font = '12px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText(nodeIndex, pos.x, pos.y);
                }
            }
        });
    }
    
    drawLabels() {
        const labels = ['Input', 'Hidden 1', 'Hidden 2', 'Output'];
        
        this.layers.forEach((layer, index) => {
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom'; // Align text to the bottom

            // Calculate the total height of the nodes in the layer
            const totalNodes = layer.nodes;
            let ySpacing;
            if (index === 3) { // Output layer
                ySpacing = 40;
            } else {
                ySpacing = 40;
            }
            const totalHeight = (totalNodes - 1) * ySpacing;
            const bottomY = layer.y + totalHeight / 2;

            // Position the label below the nodes
            const labelY = bottomY + 35; 

            this.ctx.fillText(labels[index], layer.x, labelY);
        });
    }
    
    startAnimation() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        let frame = 0;
        const maxFrames = 120; // 2 second animation
        
        const animate = () => {
            this.drawNetwork();
            
            // Pulse effect using sine wave
            const pulse = Math.sin((frame / maxFrames) * Math.PI * 4) * 0.2 + 1;
            
            // Pulse effect for high activation nodes
            this.layers.forEach((layer, layerIndex) => {
                for (let nodeIndex = 0; nodeIndex < layer.nodes; nodeIndex++) {
                    const activation = this.nodeActivations[layerIndex][nodeIndex];
                    if (activation > 0.7) {
                        const pos = this.getNodePosition(layerIndex, nodeIndex);
                        const size = (12 + activation * 8) * pulse;
                        
                        this.ctx.strokeStyle = `rgba(102, 249, 238, ${0.5 + Math.sin(frame * 0.2) * 0.3})`;
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.arc(pos.x, pos.y, size + 5, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                }
            });
            
            frame++;
            if (frame < maxFrames) {
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.isAnimating = false;
            }
        };
        
        animate();
    }
    
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.isAnimating = false;
        }
    }
}

// Global network visualizer instance
let networkVisualizer = null;