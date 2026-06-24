# Taşdemir Emlak Sözleşme Hazırlama Programı

Bu paket GitHub Pages üzerinde çalışacak şekilde hazırlandı. Telefon, tablet ve bilgisayarda tarayıcıdan açılır; Chrome/Edge üzerinden uygulama gibi kurulabilir.

## GitHub'a yükleme

1. GitHub'da yeni bir repo aç. Örnek ad: `emlak-sozlesme-programi`
2. ZIP içindeki tüm dosyaları repoya yükle. `index.html` ana dizinde kalmalı.
3. GitHub'da **Settings > Pages** bölümüne gir.
4. **Build and deployment > Source** alanında `Deploy from a branch` seç.
5. Branch olarak `main`, klasör olarak `/root` seçip kaydet.
6. Birkaç dakika sonra GitHub Pages linki açılır.

## Telefona / tablete kurulum

Android Chrome:
- GitHub Pages linkini aç.
- Üstteki **Uygulama olarak kur** butonu çıkarsa bas.
- Çıkmazsa Chrome üç nokta menüsünden **Ana ekrana ekle** veya **Uygulamayı yükle** seç.

 iPhone / iPad Safari:
- Linki Safari ile aç.
- Paylaş butonuna bas.
- **Ana Ekrana Ekle** seç.

## Bilgisayara masaüstü uygulama gibi kurulum

Chrome veya Edge:
- GitHub Pages linkini aç.
- Adres çubuğundaki kurulum simgesine bas veya menüden **Uygulamayı yükle** seç.
- Program masaüstünde bağımsız pencere gibi açılır.

## Dosyalar

- `index.html`: Programın ana dosyası.
- `manifest.webmanifest`: Telefon/tablet/masaüstü kurulum ayarları.
- `sw.js`: Offline çalışma ve hızlı açılış desteği.
- `app-config.json`: Firma ve çıktı ayarları için referans dosyası.
- `assets/icons/`: Uygulama ikonları.
- `assets/logo/`: Logo dosyaları.

## Not

Sözleşme kayıtları cihazın tarayıcı hafızasında saklanır. Telefon değiştirirken program içindeki **Arşivi Dışa Aktar** ve yeni cihazda **Arşiv İçe Aktar** kullanılmalı.


## Logo görünmüyorsa
Eski PWA önbelleği kalmış olabilir. Yeni dosyaları yükledikten sonra Chrome menüsünden sayfayı yenileyin. Gerekirse site ayarlarından verileri temizleyip tekrar açın veya uygulamayı kaldırıp yeniden kurun. Bu pakette logo hem dosya olarak hem de program içine gömülü yedek olarak eklenmiştir.


## Logo güncellemesi
Bu paket, kullanıcının gönderdiği eski Taşdemir Gayrimenkul logosu programa gömülü olacak şekilde güncellenmiştir. PWA önbelleği için `sw.js` sürümü artırılmıştır.
