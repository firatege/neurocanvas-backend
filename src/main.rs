// main.rs içinde veya ayrı bir ws.rs dosyasında
use actix::prelude::*;
use actix_cors::Cors;
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, post, Responder};
use std::{env, sync::Arc};
use serde::{Deserialize, Serialize}; // JSON parsingleme için
use log::{info, error, warn};
use actix_files as fs;
use dotenv::dotenv;

#[derive(Debug, Serialize, Deserialize)]
struct PyPredictReq {
    image: String  // base64 for image
}



#[derive(Debug, Serialize, Deserialize)]
struct PyPreidctRes {
    prediction: i64,
    probabilities: Vec<f64>,
}

async fn send_to_python_and_get_prediction(
    python_backend_url: &str,
    base64_image_data: &str,
) -> Result<(i64, Vec<f64>), String> {
    let client = reqwest::Client::new();
    let request_body = PyPredictReq {
        image: base64_image_data.to_string(),
    };

    let response = client
        .post(format!("{}/predict", python_backend_url))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Python backend'e istek gönderirken hata: {}", e))?;

    if response.status().is_success() {
        let py_response: PyPreidctRes = response.json()
            .await
            .map_err(|e| format!("Python backend yanıtını ayrıştırırken hata: {}", e))?;
        Ok((py_response.prediction, py_response.probabilities))
    } else {
        let status = response.status();
        let text = response.text().await.unwrap_or_else(|_| "Yanıt metni okunamadı".to_string());
        Err(format!("Python backend'den hata yanıtı alındı: Durum: {}, Mesaj: {}", status, text))
    }
}

// HTTP endpoint for prediction
#[post("/predict")]
async fn predict(
    req: web::Json<PyPredictReq>,
    py_backend_url_data: web::Data<Arc<String>>,
) -> impl Responder {
    match send_to_python_and_get_prediction(
        &py_backend_url_data.get_ref(),
        &req.image,
    ).await {
        Ok((prediction, probabilities)) => HttpResponse::Ok().json(
            serde_json::json!({
                "type": "prediction_result",
                "prediction": prediction,
                "cnn_viz_data": { "prediction_scores": probabilities }
            })
        ),
        Err(e) => HttpResponse::InternalServerError().json(
            serde_json::json!({ "type": "error", "message": e })
        ),
    }
}


#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    info!("Rust backend başlatılıyor...");

    let python_backend_url = env::var("PYTHON_BACKEND_URL")
        .expect("PYTHON_BACKEND_URL ortam değişkeni ayarlanmalı.");
    info!("Python Backend URL: {}", python_backend_url);

    let shared_python_backend_url = Arc::new(python_backend_url);

    let num_workers = num_cpus::get();
    info!("{} adet CPU çekirdeği kullanılacak.", num_workers);

    HttpServer::new(move || {
        App::new()
            .wrap(Cors::permissive())
            .app_data(web::Data::new(shared_python_backend_url.clone()))
            .service(predict)
            // Serve index.html and other static assets at root path
            .service(fs::Files::new("/", "./static").index_file("index.html"))
    })
    .workers(num_workers)
    .bind("0.0.0.0:8080")?
    .run()
    .await
}