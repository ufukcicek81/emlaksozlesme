# Taşdemir Emlak Sözleşme Programı

GitHub Pages üzerinde çalışan, telefona/tablete uygulama olarak eklenebilen (PWA) emlak sözleşme programı.

## Dosya yapısı
- `index.html` — uygulama arayüzü
- `assets/app.css` — tüm görünüm (ekran, yazdırma, mobil)
- `assets/app.js` — sözleşme metinleri, kayıt, Firebase, PDF, imza
- `sw.js` — çevrimdışı açılış için önbellek (önce ağ, sonra önbellek)
- `manifest.webmanifest`, ikonlar ve `tasdemir-sozlesme-logo.jpg`
- `emlak-sozlesme-programi.html` — eski tek dosyalık sürüm (kullanılmıyor)

## Yükleme
1. Dosyaları `assets` klasörüyle birlikte reponun ana dizinine yükleyin.
2. GitHub > Settings > Pages > Source: Deploy from a branch > Branch: main > Folder: / root > Save.
3. Link: `https://ufukcicek81.github.io/emlaksozlesme/`

Yeni sürüm yüklerken `index.html` ve `sw.js` içindeki `20261025` sürüm etiketini değiştirin; uygulama kendini otomatik günceller.

## Güncelleme 20261025 — yeni arayüz ve hata düzeltmeleri
- Yeni arayüz: masaüstünde sol menü + canlı önizleme, mobilde alt menü ve tam ekran önizleme.
- Sözleşme hazırlama 3 adım: Taraflar & Taşınmaz → Şartlar → İmza.
- Arşivde arama, türe göre filtre, JSON yedek indir/yükle; cari kayıtlarda arama ve filtre.
- Kontroller: eksik alanlar, geçersiz T.C. kimlik no, tahliye taahhüdü tarih uyarısı, yasal hizmet bedeli üst sınırı hesaplama.
- PDF: okunur yazı boyutu, kenar boşluğu, sayfalar satır/madde sınırından bölünür.
- **Güvenlik düzeltmesi:** Eski sürüm giriş e-postası ve şifresini her sözleşme kaydına (cihaz + Firebase) yazıyordu. Artık yazılmıyor; mevcut kayıtlardan da otomatik temizleniyor. Eski sürümü kullanan tüm hesapların şifresini değiştirin.
- Kayıtlı sözleşme düzenlenip kaydedilince yeni numarayla kopya oluşması düzeltildi.
- Kaydettikten sonra form sıfırlanmaz; aynı sözleşme yazdırılabilir/paylaşılabilir. Yeni sözleşme için "Yeni" butonu kullanılır.
- "Kiracıya ait" gibi yazılı değerlerin tutar alanlarında silinmesi düzeltildi.
- Kira kaydından tahliye oluştururken kira sözleşmesindeki imzalar artık taşınmıyor.
- Yönetici danışman filtresi açıkken cari kaydı açma/silmenin yanlış kaydı seçmesi düzeltildi.
