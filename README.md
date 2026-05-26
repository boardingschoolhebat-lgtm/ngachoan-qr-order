# 🍜 NGACHOAN — Full-Stack QR-Order F&B SaaS Platform

[![React](https://img.shields.io/badge/React-18.x-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud_Database-emerald?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Vite](https://img.shields.io/badge/Vite-Fast_Bundler-purple?style=for-the-badge&logo=vite)](https://vitejs.dev/)

**Ngachoan** adalah platform ekosistem digital *SaaS (Software as a Service)* untuk manajemen restoran F&B modern. Aplikasi ini memotong alur pemesanan konvensional menggunakan sistem **Dynamic QR Routing** langsung dari meja pelanggan, terintegrasi penuh secara *real-time* ke panel monitor dapur, dashboard omset pemilik (*owner*), serta gerbang pembayaran elektronik.

---

## 🎯 Fitur Utama (Core Features)

### 📱 1. Sisi Pelanggan (Dynamic QR Routing)
* **Zero Configuration Routing:** Mengidentifikasi nomor meja secara otomatis via parameter URL (`/?meja=MEJA-IT-01`) tanpa membebani performa browser.
* **Interactive Cart Counter:** Manajemen keranjang belanja yang responsif dengan Tailwind CSS untuk kalkulasi harga instan.
* **Fintech Simulation Integration:** Alur penguncian invoice otomatis berstatus `UNPAID` ke server cloud sebelum dialihkan ke gerbang pembayaran digital.

### 👨‍🍳 2. Panel Monitor Dapur (Event-Driven Kitchen Dashboard)
* **Real-time Database Listener:** Memanfaatkan *Supabase PostgreSQL Replication* untuk menangkap ketukan pesanan masuk dalam hitungan milidetik tanpa perlu memuat ulang (*refresh*) halaman.
* **Status Workflow Tracking:** Manajemen siklus hidup masakan yang jelas (`🔥 ANTRIAN BARU` [Pending] -> `⏳ SEDANG DIMASAK` [Processing] -> `DONE`).
* **Hardware-Integrated Thermal Printing:** Fitur cetak struk nota dapur otomatis yang dioptimasi menggunakan *CSS @media print* murni agar presisi pada kertas printer thermal ukuran **58mm**.

### 📈 3. Dashboard Bisnis Pemilik (Owner Real-Time Analytics)
* **Cloud Financial Aggregation:** Kalkulasi otomatis total omset pendapatan harian dan jumlah nota sukses langsung dari PostgreSQL Cloud Singapura.
* **Dynamic Analytics Chart:** Grafik batang murni (*Native Tailwind Layout*) untuk memantau menu terlaris (*Best Seller*) secara *real-time*.

### 🛡️ 4. Sistem Keamanan & Enkripsi (Role-Based Access Authentication)
* **Supabase Auth Gateway:** Mengunci akses panel internal menggunakan token autentikasi global.
* **Role Enforcement Layer:** Barikade keamanan berlapis pada *routing* aplikasi untuk menyeleksi hak akses spesifik (`dapur@ngachoan.com` vs `owner@ngachoan.com`).

---

## 🛠️ Arsitektur Teknologi (Tech Stack)

* **Frontend:** React.js, Vite, Tailwind CSS, JavaScript ES6
* **Backend SaaS & Database:** Supabase Cloud, PostgreSQL Database, Supabase Auth, Realtime Broadcast Channel
* **Hardware Output Support:** Printer Thermal POS 58mm via Windows Spooler Client

---

## 🚀 Cara Menjalankan Proyek Secara Lokal

### 1. Kloning Repositori
```bash
git clone [https://github.com/USERNAME_GITHUB_BOSKU/nama-repo-ngachoan.git](https://github.com/USERNAME_GITHUB_BOSKU/nama-repo-ngachoan.git)
cd nama-repo-ngachoan