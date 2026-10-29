const video = document.getElementById('webcam');
let dbData = [];
let barcodeDetector;

if ('BarcodeDetector' in window) {
    barcodeDetector = new BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'code_93']
    });
} else {
    alert("Browser belum mendukung pemindaian native Hardware. Gunakan Google Chrome versi terbaru.");
}

navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
.then(function(stream) {
    video.srcObject = stream;
    video.play().then(() => { requestAnimationFrame(prosesFrameNative); });
})
.catch(err => alert("Kamera Error: Pastikan menggunakan link HTTPS dan beri izin akses kamera."));

function prosesFrameNative() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && barcodeDetector) {
        barcodeDetector.detect(video)
            .then(barcodes => {
                if (barcodes.length > 0) {
                    const kodeHasilScan = barcodes.rawValue; 
                    parseDataBarcode(kodeHasilScan);
                }
            })
            .catch(err => console.error("Deteksi error:", err));
    }
    setTimeout(() => { requestAnimationFrame(prosesFrameNative); }, 80); 
}

function parseDataBarcode(text) {
    let cleanText = text.trim().toUpperCase();
    
    if (/^\d{15,}/.test(cleanText)) {
        document.getElementById('imei').value = cleanText.substring(0, 15);
        vibrateDevice();
        validasiInput();
    } 
    else if (cleanText.length >= 9 && !/\s/.test(cleanText)) {
        if (cleanText.toUpperCase().startsWith("S")) {
            cleanText = cleanText.substring(1);
        }
        document.getElementById('sn').value = cleanText.substring(0, 10);
        vibrateDevice();
        validasiInput();
    }
}

function validasiInput() {
    const inputSn = document.getElementById('sn');
    const inputImei = document.getElementById('imei');
    const errorSn = document.getElementById('sn-error');
    const errorImei = document.getElementById('imei-error');
    const btnSimpan = document.getElementById('btnSimpan');

    const valueSn = inputSn.value.trim();
    const valueImei = inputImei.value.trim();

    let snValid = false;
    let imeiValid = false;

    if (valueSn.length === 0) {
        inputSn.classList.remove('invalid');
        errorSn.style.display = 'none';
        snValid = true; 
    } else if (valueSn.length === 10) {
        inputSn.classList.remove('invalid');
        errorSn.style.display = 'none';
        snValid = true;
    } else {
        inputSn.classList.add('invalid');
        errorSn.style.display = 'block';
        snValid = false;
    }

    if (valueImei.length === 0) {
        inputImei.classList.remove('invalid');
        errorImei.style.display = 'none';
        imeiValid = true; 
    } else if (valueImei.length === 15) {
        inputImei.classList.remove('invalid');
        errorImei.style.display = 'none';
        imeiValid = true;
    } else {
        inputImei.classList.add('invalid');
        errorImei.style.display = 'block';
        imeiValid = false;
    }

    if ((valueSn.length === 0 && valueImei.length === 0) || !snValid || !imeiValid) {
        btnSimpan.disabled = true;
    } else {
        btnSimpan.disabled = false;
    }
}

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

function simpanData() {
    const asal = document.getElementById('asalBarang').value.trim().toUpperCase();
    const tipe = document.getElementById('tipeBarang').value;
    const varian = document.getElementById('varianBarang').value;
    const sn = document.getElementById('sn').value.trim().toUpperCase();
    const imei = document.getElementById('imei').value.trim().toUpperCase();

    if (!sn && !imei) return alert("Silakan scan barcode terlebih dahulu!");

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
        sn: sn || '-', 
        imei: imei || '-' 
    });

    const logList = document.getElementById('log-list');
    logList.innerHTML += `<div class="log-item">✓ [${waktuInput}] ${tipe} ${varian} | SN: ${sn || '-'}</div>`;
    logList.scrollTop = logList.scrollHeight;

    document.getElementById('sn').value = '';
    document.getElementById('imei').value = '';
    
    validasiInput(); 
}

// SOLUSI UTAMA: Membuat file format .xlsx asli dengan layout kolom otomatis lebar (Auto-Fit)
function unduhExcel() {
    // Memastikan library SheetJS telah sukses termuat ke browser
    if (typeof XLSX === 'undefined') {
        return alert("Gagal memproses: Library Excel belum termuat sempurna. Pastikan perangkat terhubung ke internet saat pertama kali membuka aplikasi.");
    }
    
    if (dbData.length === 0) return alert("Data antrean masih kosong!");
    
    const btn = document.getElementById('btnExcel');
    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        // 1. Definisikan header kolom tabel
        const dataExcel = [
            ["Waktu Input", "Asal Barang", "Tipe Barang", "Varian Barang", "Serial Number", "IMEI"]
        ];
        
        // 2. Tambahkan baris data
        dbData.forEach(function(item) {
            dataExcel.push([
                item.waktu,
                item.asal,
                item.tipe,
                item.varian,
                item.sn,
                item.imei
            ]);
        });
        
        // 3. Bangun workbook Excel
        const wb = XLSX.utils.book_new();
        
        // raw: false memastikan data angka panjang (IMEI) dikunci sebagai format TEXT otomatis oleh SheetJS
        const ws = XLSX.utils.aoa_to_sheet(dataExcel, { raw: false });
        
        // 4. FITUR LEBAR KOLOM OTOMATIS (.xlsx NATIVE): Menghitung panjang karakter tiap sel secara dinamis
        const lebarKolom = dataExcel[0].map((col, i) => {
            return {
                wch: Math.max(...dataExcel.map(row => (row[i] ? row[i].toString().length : 0))) + 3
            };
        });
        ws['!cols'] = lebarKolom;
        
        // 5. Satukan sheet lalu unduh dengan format kompresi .xlsx murni
        XLSX.utils.book_append_sheet(wb, ws, "Data Scan iPhone");
        XLSX.writeFile(wb, "Data_Scan_iPhone.xlsx");
        
    } catch (error) {
        alert("Gagal mengunduh file spreadsheet .xlsx: " + error);
    }

    btn.innerText = "Unduh Excel";
    btn.disabled = false;
}

validasiInput();
