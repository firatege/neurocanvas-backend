# Canvas – Real‐Time Handwritten Digit Recognition

A full-stack demo that lets you draw a digit on a canvas, sends it to a Python/TensorFlow model for inference, and visualizes both the prediction and the internal CNN activations in your browser. The backend is written in Rust (Actix-Web) and Kubernetes manifests are provided for easy deployment.

---

## 🚀 Features

- Draw a digit (0–9) on an HTML5 canvas  
- Real‐time POST to a Python/TensorFlow model serving service  
- Rust backend (Actix-Web) serves the SPA and proxies inference requests  
- Interactive “Neural Network Connections” visualization  
- CNN layer activation summaries for each Conv/Dense layer  
- Responsive, dark-mode UI with Tailwind CSS  
- Fully containerized & Kubernetes-ready

---

## 🏗 Architecture

```plaintext
┌──────────────┐        ┌───────────────────┐        ┌──────────────┐
│  Browser UI  │ ──HTTP──▶ Rust Backend (8080) ──HTTP──▶ Python Trainer (8000)
│  (SPA + JS)  │         │  Actix-Web API    │         │  TF-Serving   │
└──────────────┘        └───────────────────┘        └──────────────┘
      │                                                     ▲
      │   draws & POSTs image                              │
      │                                                     │
      └───────────────────────── visualizes ─────────────────┘
```

- **Frontend**  
  - HTML5 `<canvas>` drawing area  
  - TailwindCSS for styling  
  - Vanilla JS module (`script.js`) handles drawing, fetch, animations  
- **Rust Backend**  
  - Serves static assets and index.html  
  - `/predict` endpoint proxies to Python trainer  
  - Dockerfile included  
- **Python Trainer**  
  - Flask/FastAPI + TensorFlow/Keras model loaded from `model.h5`  
  - Returns JSON: prediction, probabilities, CNN activations  

---

## 📋 Prerequisites

- Docker & Docker Compose (for local dev)  
- kubectl & a Kubernetes cluster (for production)  
- (Optional) Helm 3  
- Node.js & npm (if you want to rebuild the UI)  

---

## 🛠️ Local Development

1. Clone the repo  
   ```bash
   git clone https://github.com/your-org/canvas.git
   cd canvas
   ```
2. Build & run Python trainer  
   ```bash
   cd neurocanvas-trainer
   docker build -t canvas-trainer:dev .
   docker run -p 8000:8000 canvas-trainer:dev
   ```
3. Build & run Rust backend + UI  
   ```bash
   cd neurocanvas-backend
   docker build -t canvas-backend:dev .
   docker run -p 8080:8080 canvas-backend:dev
   ```
4. Open your browser at `http://localhost:8080/`  

---

## ☸️ Kubernetes Deployment

1. Ensure your images are pushed to a registry (e.g. `hub.umceko.com/canvas/...`).  
2. Apply the manifest:  
   ```bash
   kubectl apply -f deploymant.yml
   ```
3. Verify pods & services:  
   ```bash
   kubectl get pods,svc,ingress
   ```
4. Access via ingress host (e.g. `canvas.byfeb.com`).  

---

## 💻 Usage

1. **Draw** a digit (0–9) in the left canvas.  
2. **Auto‐send** inference to `/predict` (debounced).  
3. **Predicted Digit** and **Confidence** appear top‐right.  
4. **Probabilities** listed underneath.  
5. **Neural Network Connections** animate:  
   - Input ➔ Hidden 1 ➔ Hidden 2 ➔ Output  
   - Line opacity reflects activation strength  
6. **CNN Activations** panel shows first 16 channel means per watched layer.  

---

## 📂 File Structure

```plaintext
canvas/
├─ neurocanvas-trainer/        # Python model server & vis.ipynb
│   ├─ model.h5
│   ├─ app.py
│   └─ vis.ipynb
├─ neurocanvas-backend/        # Rust Actix server + static web files
│   ├─ src/
│   ├─ static/
│   │   ├─ index.html
│   │   ├─ script.js
│   │   └─ styles.css
│   └─ Dockerfile
└─ deploymant.yml              # Kubernetes Deployment, Service, Ingress
```

---

## 🤝 Contributing

1. Fork the repo  
2. Create a feature branch  
3. Submit a PR with clear description & screenshots  
4. Ensure all linters (rustfmt, flake8) pass  

---

## 📜 License

MIT © Your Name / Your Organization  
