const video = document.getElementById('webcam');
let dbData = [];
let barcodeDetector = null;
let pakaiPonyfill = false;      // true jika browser tidak punya BarcodeDetector bawaan (iOS)
let sedangMendeteksi = false;   // mencegah deteksi menumpuk (wasm lebih lambat dari native)

// URL resmi library (ZXing WebAssembly). Global yang dihasilkan: window.BarcodeDetectionAPI
const URL_PONYFILL = "https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/iife/ponyfill.min.js";
const FORMAT_BARCODE = ['code_128', 'code_39', 'ean_13', 'code_93'];

function muatScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Gagal memuat: " + src));
        document.head.appendChild(s);
    });
}

async function siapkanDetector() {
    try {
        if ('BarcodeDetector' in window) {
            // Android/Chrome: pakai yang bawaan browser
            barcodeDetector = new BarcodeDetector({ formats: FORMAT_BARCODE });
            pakaiPonyfill = false;
        } else {
            // iOS Safari: tidak ada BarcodeDetector -> pakai ponyfill ZXing
            await muatScript(URL_PONYFILL);
            const Detektor = window.BarcodeDetectionAPI && window.BarcodeDetectionAPI.BarcodeDetector;
            if (!Detektor) throw new Error("BarcodeDetectionAPI tidak ditemukan setelah script dimuat");
            barcodeDetector = new Detektor({ formats: FORMAT_BARCODE });
            pakaiPonyfill = true;
        }
    } catch (err) {
        console.error("Gagal menyiapkan detector:", err);
        alert("Mesin scan gagal dimuat. Pastikan internet aktif lalu muat ulang halaman.");
    }
}

function mulaiLoopScan() {
    requestAnimationFrame(prosesFrameNative);
}

function inisialisasiScanner() {
    if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
    }

    const constraints = {
        video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [
                { focusMode: "continuous" },
                { focusDistance: 0.1 }
            ]
        },
        audio: false
    };

    function pasangStream(stream) {
        video.srcObject = stream;
        video.play().then(mulaiLoopScan);

        // PERBAIKAN: getVideoTracks() mengembalikan array, ambil elemen pertama
        const track = stream.getVideoTracks()[0];
        const capabilities = (track && track.getCapabilities) ? track.getCapabilities() : {};
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(e => console.log(e));
        }
    }

    navigator.mediaDevices.getUserMedia(constraints)
        .then(pasangStream)
        .catch(() => {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
                .then(pasangStream)
                .catch(() => alert("Kamera Error: Pastikan menggunakan HTTPS dan beri izin akses."));
        });

    siapkanDetector();
}

// Canvas tersembunyi, dipakai hanya saat ponyfill aktif
const canvasMemori = document.createElement('canvas');
const ctxMemori = canvasMemori.getContext('2d', { willReadFrequently: true });

function prosesFrameNative() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && barcodeDetector && !sedangMendeteksi) {
        let sumber = video;

        if (pakaiPonyfill) {
            canvasMemori.width = video.videoWidth;
            canvasMemori.height = video.videoHeight;
            ctxMemori.drawImage(video, 0, 0, canvasMemori.width, canvasMemori.height);
            sumber = canvasMemori;
        }

        sedangMendeteksi = true;
        barcodeDetector.detect(sumber)
            .then(barcodes => {
                barcodes.forEach(b => parseDataBarcode(b.rawValue));
            })
            .catch(err => console.error("Deteksi error:", err))
            .finally(() => { sedangMendeteksi = false; });
    }
    setTimeout(() => { requestAnimationFrame(prosesFrameNative); }, 80);
}

function parseDataBarcode(text) {
    let cleanText = text.trim().toUpperCase();
    
    // 1. FILTER TEGAS: Jika teks berisi angka EID (atau panjangnya lebih dari 15 karakter), langsung ABAIKAN!
    if (cleanText.length > 15 || cleanText.startsWith("EID")) {
        return; 
    }
    
    // Fungsi pembantu untuk memicu efek shadow hijau pada input terkait
    function beriEfekSukses(inputElement) {
        if (inputElement) {
            inputElement.classList.add('input-success');
            setTimeout(() => {
                inputElement.classList.remove('input-success');
            }, 600); // Shadow hijau menyala selama 0.6 detik
        }
    }
    
    // 2. Deteksi IMEI: Hanya menerima string angka yang panjangnya TEPAT 15 digit
    const matchImei = cleanText.match(/\b\d{15}\b/);
    if (matchImei) {
        const inputImei = document.getElementById('imei');
        inputImei.value = matchImei[0];
        vibrateDevice();
        validasiInput();
        beriEfekSukses(inputImei); // Picu shadow hijau di kotak IMEI
        return; 
    } 
    
    // 3. Deteksi SN: Menghapus teks bising dan menyisakan Serial Number
    if (cleanText.startsWith("(S)")) {
        cleanText = cleanText.replace("(S)", "").trim();
    }
    if (cleanText.startsWith("SERIAL NO.")) {
        cleanText = cleanText.replace("SERIAL NO.", "").trim();
    }
    if (cleanText.startsWith("S") && cleanText.length > 10) {
        cleanText = cleanText.substring(1);
    }

    // Pastikan panjang bersihnya berkisar di angka 10 karakter (standar SN Apple)
    if (cleanText.length === 10) {
        const inputSn = document.getElementById('sn');
        inputSn.value = cleanText.substring(0, 10);
        vibrateDevice();
        validasiInput();
        beriEfekSukses(inputSn); // Picu shadow hijau di kotak SN
    }
}

function validasiInput() {
    const inputSn = document.getElementById('sn');
    const inputImei = document.getElementById('imei');
    const errorSn = document.getElementById('sn-error');
    const errorImei = document.getElementById('imei-error');
    const btnSimpan = document.getElementById('btnSimpan');
    const btnCekSn = document.getElementById('btnCekSn'); 

    const valueSn = inputSn.value.trim();
    const valueImei = inputImei.value.trim();

    let snValid = false;
    let imeiValid = false;

    // Validasi Kolom Serial Number (SN)
    if (valueSn.length === 10) {
        inputSn.classList.remove('invalid');
        inputSn.classList.add('valid'); // Tambah warna hijau jika benar
        if (errorSn) errorSn.style.display = 'none';
        snValid = true;
    } else {
        inputSn.classList.remove('valid');
        inputSn.classList.add('invalid'); // Tetap merah jika salah/kosong
        if (errorSn) errorSn.style.display = 'block';
        snValid = false;
    }

    // Validasi Kolom IMEI
    if (valueImei.length === 15) {
        inputImei.classList.remove('invalid');
        inputImei.classList.add('valid'); // Tambah warna hijau jika benar
        if (errorImei) errorImei.style.display = 'none';
        imeiValid = true;
    } else {
        inputImei.classList.remove('valid');
        inputImei.classList.add('invalid'); // Tetap merah jika salah/kosong
        if (errorImei) errorImei.style.display = 'block';
        imeiValid = false;
    }

    // Mengaktifkan atau menonaktifkan tombol aksi
    if (snValid && imeiValid) {
        btnSimpan.disabled = false;
    } else {
        btnSimpan.disabled = true;
    }

    if (snValid) {
        btnCekSn.disabled = false;
    } else {
        btnCekSn.disabled = true;
    }
}

window.addEventListener('beforeunload', function (e) {
    if (dbData.length > 0) {
        e.preventDefault();
        e.returnValue = 'Data antrean saat ini belum didownload dan akan hilang jika halaman dimuat ulang. Tetap keluar?';
        return e.returnValue;
    }
});

document.getElementById('sn').addEventListener('input', function() {
    this.value = this.value.toUpperCase().substring(0, 10);
    validasiInput();
});

document.getElementById('imei').addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').substring(0, 15);
    validasiInput();
});

function vibrateDevice() {
    if (navigator.vibrate) navigator.vibrate(40);
}

// DIKUNCI PERMANEN: Alamat web checkcoverage resmi regional Indonesia sesuai permintaan Anda
function cekAppleCoverage() {
    const inputSn = document.getElementById('sn');
    const valueSn = inputSn.value.trim().toUpperCase();

    if (valueSn.length !== 10) {
        return alert("Serial Number belum valid untuk dicek!");
    }

    navigator.clipboard.writeText(valueSn).then(() => {
        window.open('https://checkcoverage.apple.com/?locale=in_ID', '_blank');
    }).catch(err => {
        inputSn.select();
        inputSn.setSelectionRange(0, 99999);
        document.execCommand("copy");
        window.open('https://checkcoverage.apple.com/?locale=in_ID', '_blank');
    });
}

function simpanData() {
    const asal = document.getElementById('asalBarang').value.trim().toUpperCase();
    const tipe = document.getElementById('tipeBarang').value;
    const varian = document.getElementById('varianBarang').value;
    const sn = document.getElementById('sn').value.trim().toUpperCase();
    const imei = document.getElementById('imei').value.trim().toUpperCase();

    if (!sn || !imei) return alert("Serial Number dan IMEI wajib diisi lengkap!");

    const Clinical_Time = new Date();
    const tgl = String(Clinical_Time.getDate()).padStart(2, '0');
    const bln = String(Clinical_Time.getMonth() + 1).padStart(2, '0');
    const thn = Clinical_Time.getFullYear();
    const jam = String(Clinical_Time.getHours()).padStart(2, '0');
    const mnt = String(Clinical_Time.getMinutes()).padStart(2, '0');
    const dtk = String(Clinical_Time.getSeconds()).padStart(2, '0');
    
    const waktuInput = `${tgl}/${bln}/${thn} ${jam}:${mnt}:${dtk}`;

    dbData.push({ 
        waktu: waktuInput,
        asal: asal || '-',
        tipe: tipe,
        varian: varian,
        sn: sn, 
        imei: imei 
    });

    const nomorUrut = dbData.length;
    const logList = document.getElementById('log-list');
    logList.innerHTML += `<div class="log-item">${nomorUrut}. [${waktuInput}] ${tipe} ${varian} | SN: ${sn}</div>`;
    logList.scrollTop = logList.scrollHeight;

    document.getElementById('sn').value = '';
    document.getElementById('imei').value = '';
    
    validasiInput(); 
}

const URL_SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

async function unduhExcel() {
    if (dbData.length === 0) return alert("Data antrean masih kosong!");

    const btn = document.getElementById('btnExcel');
    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        // Library dimuat sekali saja, saat tombol ditekan pertama kali
        if (typeof XLSX === 'undefined') await muatScript(URL_SHEETJS);

        const headers = ["Waktu Input", "Asal Barang", "Tipe Barang", "Varian Barang", "Serial Number", "IMEI"];
        const baris = dbData.map(item => [item.waktu, item.asal, item.tipe, item.varian, item.sn, item.imei]);

        // Semua nilai berupa teks, jadi IMEI/SN tidak berubah jadi angka ilmiah
        const ws = XLSX.utils.aoa_to_sheet([headers, ...baris]);

        // Lebar kolom otomatis mengikuti isi
        ws['!cols'] = headers.map((h, i) => ({
            wch: Math.max(h.length, ...baris.map(r => String(r[i]).length)) + 2
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data Scan");
        XLSX.writeFile(wb, "Data_Scan_iPhone.xlsx");

    } catch (error) {
        alert("Gagal membuat file Excel: " + error.message + "\nPastikan internet aktif.");
    } finally {
        btn.innerText = "Unduh Excel";
        btn.disabled = false;
    }
}

validasiInput();
inisialisasiScanner();
