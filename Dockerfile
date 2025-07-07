# neurocanvas-backend/Dockerfile

# Rust derleyicisinin daha yeni bir sürümünü içeren bir base imaj kullanın
# Örneğin, 1.82 veya 1.83 gibi. En güncel kararlı sürümü kullanmak genellikle en iyisidir.
FROM rust:1.83-slim-bookworm AS builder

WORKDIR /app

# OpenSSL geliştirme paketlerini ve pkg-config'i yükle
RUN apt-get update && apt-get install -y libssl-dev pkg-config && rm -rf /var/lib/apt/lists/*

# Cargo.toml ve Cargo.lock dosyalarını kopyala
COPY Cargo.toml Cargo.lock ./
# Boş bir proje derleyerek bağımlılıkları önbelleğe al
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf target/release/deps/neurocanvas_backend* # Binary adınız 'neurocanvas_backend' ise

# Tüm kaynak kodunu kopyala
COPY src ./src
COPY static ./static

# Uygulamayı derle
RUN cargo build --release

# --- Çalışma Zamanı (Runtime) Aşaması ---
FROM debian:bookworm-slim

WORKDIR /app

# Install OpenSSL runtime libraries
RUN apt-get update && apt-get install -y libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/static ./static

# Derlenmiş Rust binary'sini kopyala
COPY --from=builder /app/target/release/neurocanvas_backend ./neurocanvas_backend

EXPOSE 8080

CMD ["./neurocanvas_backend"]