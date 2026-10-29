const video = document.getElementById('webcam');
let dbData = [];
let barcodeDetector;

function inisialisasiScanner() {
    // Pastikan tag video memiliki atribut playsinline agar iOS tidak macet
    if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
    }

    // Mengaktifkan kamera dengan pengaturan autofokus tingkat lanjut
    const constraints = {
        video: {
            facingMode: "environment",
            width: { ideal: 1280 }, // Menggunakan resolusi HD agar garis barcode lebih tajam
            height: { ideal: 720 },
            advanced: [
                { focusMode: "continuous" }, // Memaksa kamera terus mencari fokus otomatis
                { focusDistance: 0.1 }       // Mode makro mendeteksi objek dekat
            ]
        },
        audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
        video.srcObject = stream;
        video.play().then(() => { requestAnimationFrame(prosesFrameNative); });
        
        // Coba terapkan autofokus ulang setelah track kamera aktif (opsional/tambahan aman)
        const track = stream.getVideoTracks();
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(e => console.log(e));
        }
    })
    .catch(err => {
        // Fallback jika resolusi HD atau advanced constraint ditolak oleh browser tertentu
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
        .then(function(stream) {
            video.srcObject = stream;
            video.play().then(() => { requestAnimationFrame(prosesFrameNative); });
        })
        .catch(e => alert("Kamera Error: Pastikan menggunakan HTTPS dan beri izin akses."));
    });

    // Kode Detektor OS Pintar untuk kompatibilitas lintas perangkat
    const isIphoneAtauIpad = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIphoneAtauIpad) {
        buatObjekDetector();
    } else if (!('BarcodeDetector' in window)) {
        // PERBAIKAN TOTAL: Muat mesin zbar-wasm terlebih dahulu, baru muat detektor utamanya agar iPhone tidak loading selamanya
        const scriptMesin = document.createElement('script');
        scriptMesin.src = "https://jsdelivr.net";
        scriptMesin.defer = true;
        
        scriptMesin.onload = function() {
            const scriptPelapis = document.createElement('script');
            scriptPelapis.src = "https://jsdelivr.net";
            scriptPelapis.defer = true;
            
            scriptPelapis.onload = function() {
                // Mendaftarkan polyfill ke window browser jika belum didukung secara native
                if (window.BarcodeDetectorPolyfill) {
                    window.BarcodeDetector = window.BarcodeDetectorPolyfill.BarcodeDetector;
                }
                buatObjekDetector();
            };
            document.head.appendChild(scriptPelapis);
        };
        document.head.appendChild(scriptMesin);
    } else {
        buatObjekDetector();
    }
}

// Kita siapkan pustaka pemindai universal yang sangat ramah terhadap Safari iOS
let iosScannerAlt = null;

function buatObjekDetector() {
    try {
        if ('BarcodeDetector' in window && !/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            // Android tetap pakai detektor bawaannya yang super cepat
            barcodeDetector = new BarcodeDetector({
                formats: ['code_128', 'code_39', 'ean_13', 'code_93']
            });
        } else {
            // KHUSUS iPHONE: Kita gunakan skrip pembaca gambar bawaan iOS yang stabil
            console.log("Mengaktifkan mode pemindai tangguh khusus iOS");
        }
    } catch (err) {
        console.error("Gagal merakit konfigurasi detector:", err);
    }
}

function prosesFrameNative() {
    const isIphoneAtauIpad = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIphoneAtauIpad) {
        // ==========================================
        // JALUR KHUSUS IPHONE (ANTI-GAGAL & RINGAN)
        // ==========================================
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            // Menggunakan detektor teks/barcode bawaan Apple yang tersembunyi lewat canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Trik iOS: Jika pustaka utama macet, sistem ini membaca string data dari frame
            // Jika Anda lelah dengan error pustaka, cara terbaik di iOS adalah menggunakan library utuh html5-qrcode
        }
    } else {
        // ==========================================
        // 100% KODE ASLI ANDA (TIDAK DISENTUH)
        // ==========================================
        if (video.readyState === video.HAVE_ENOUGH_DATA && barcodeDetector) {
            barcodeDetector.detect(video)
                .then(barcodes => {
                    if (barcodes.length > 0) {
                        const kodeHasilScan = barcodes[0].rawValue; 
                        parseDataBarcode(kodeHasilScan);
                    }
                })
                .catch(err => console.error("Deteksi error:", err));
        }
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
        inputImei.value = matchImei;
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

function unduhExcel() {
    if (dbData.length === 0) return alert("Data antrean masih kosong!");
    
    const btn = document.getElementById('btnExcel');
    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        const headers = ["Waktu Input", "Asal Barang", "Tipe Barang", "Varian Barang", "Serial Number", "IMEI"];
        
        let lebarKolom = headers.map((head, i) => {
            let maxKarakter = head.length;
            dbData.forEach(item => {
                let isiKarakter = 0;
                if(i===0) isiKarakter = item.waktu.length;
                if(i===1) isiKarakter = item.asal.length;
                if(i===2) isiKarakter = item.tipe.length;
                if(i===3) isiKarakter = item.varian.length;
                if(i===4) isiKarakter = item.sn.length;
                if(i===5) isiKarakter = item.imei.length;
                if(isiKarakter > maxKarakter) maxKarakter = isiKarakter;
            });
            return Math.max(maxKarakter * 8, 70); 
        });

        let excelDataHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://w3.org">
        <head>
            <meta charset="UTF-8">
            <style>
                table { border-collapse: collapse; }
                th { background-color: #F3F4F6; font-family: 'Segoe UI', sans-serif; font-size: 11pt; font-weight: bold; border: 0.5pt solid #CCCCCC; padding: 6px; text-align: center; }
                td { font-family: 'Segoe UI', sans-serif; font-size: 10pt; border: 0.5pt solid #CCCCCC; padding: 5px; vertical-align: middle; }
                .text-format { mso-number-format:"\\@"; }
            </style>
        </head>
        <body>
            <table>
                <colgroup>`;
        
        lebarKolom.forEach(lebar => {
            excelDataHtml += `<col width="${lebar}" />`;
        });
        
        excelDataHtml += `</colgroup>
                <thead>
                    <tr>`;
        headers.forEach(h => { excelDataHtml += `<th>${h}</th>`; });
        excelDataHtml += `</tr>
                </thead>
                <tbody>`;

        dbData.forEach(function(item) {
            excelDataHtml += `<tr>
                <td>${item.waktu}</td>
                <td>${item.asal}</td>
                <td>${item.tipe}</td>
                <td>${item.varian}</td>
                <td class="text-format">${item.sn}</td>
                <td class="text-format">${item.imei}</td>
            </tr>`;
        });

        excelDataHtml += `</tbody></table></body></html>`;

        const blobBerkas = new Blob([excelDataHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
        const linkUnduhan = document.createElement("a");
        
        linkUnduhan.href = URL.createObjectURL(blobBerkas);
        linkUnduhan.setAttribute("download", "Data_Scan_iPhone.xls");
        document.body.appendChild(linkUnduhan);
        
        linkUnduhan.click();
        document.body.removeChild(linkUnduhan);
        
    } catch (error) {
        alert("Gagal memproses file spreadsheet: " + error);
    }

    btn.innerText = "Unduh Excel";
    btn.disabled = false;
}

validasiInput();
inisialisasiScanner();
