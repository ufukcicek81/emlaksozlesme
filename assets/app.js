/* Emlak Sözleşmem — uygulama mantığı */
"use strict";

const APP_VERSION = "20261025";
const LOGO_SRC = "tasdemir-sozlesme-logo.jpg";
const OFFICE_DEFAULTS = {
  yer: "Düzce / Cumayeri",
  ofisAdi: "Taşdemir Gayrimenkul",
  ofisYetkili: "Ufuk Çiçek",
  ofisTel: "0532 766 44 04",
  mahkeme: "Düzce Mahkemeleri ve İcra Daireleri",
};

const labels = {
  kira: ["Kiraya Veren", "Kiracı", "Kira Sözleşmesi"],
  tahliye: ["Kiraya Veren", "Kiracı", "Tahliye Taahhütnamesi"],
  alimSatim: ["Satıcı", "Alıcı", "Taşınmaz Alım Satım / Kapora Sözleşmesi"],
  satisVaadi: ["Satış Vaadinde Bulunan", "Satış Vaadini Kabul Eden", "Taşınmaz Satış Vaadi Sözleşmesi"],
  yetkiSatis: ["Mülk Sahibi", "Emlak İşletmesi", "Satış Yetkilendirme Sözleşmesi"],
  yetkiKiralama: ["Mülk Sahibi", "Emlak İşletmesi", "Kiralama Yetkilendirme Sözleşmesi"],
  yerGosterme: ["Emlak İşletmesi", "Müşteri", "Taşınmaz Yer Gösterme Belgesi"],
  ortaklik: ["1. Emlak Ofisi", "2. Emlak Ofisi", "Hizmet Ortaklığı / Komisyon Paylaşım Sözleşmesi"],
};
const TYPE_SHORT = {
  kira: "KİRA", tahliye: "TAH", alimSatim: "SAT", satisVaadi: "VAAT",
  yetkiSatis: "YETKİ", yetkiKiralama: "YETKİ", yerGosterme: "YER", ortaklik: "ORT",
};
const TYPE_NAME_SHORT = {
  kira: "Kira", tahliye: "Tahliye", alimSatim: "Alım Satım", satisVaadi: "Satış Vaadi",
  yetkiSatis: "Satış Yetki", yetkiKiralama: "Kiralama Yetki", yerGosterme: "Yer Gösterme", ortaklik: "Ortaklık",
};
const ALL_TYPES = Object.keys(labels);
const legacyMap = { aracilikSatis: "alimSatim", aracilikKiralama: "kira" };
// Eski sürümlerde giriş/yönetici formu alanları yanlışlıkla sözleşme kayıtlarına yazılıyordu.
const LEAKED_KEYS = ["authEmail", "authPass", "newUserAd", "newUserEmail", "newUserPass", "newUserRol", "tahliyeSource", "cariAgentFilter", "importFile", "fbApiKey", "fbAuthDomain", "fbProjectId", "fbAppId", "fbCollection", "fbAutoSync"];
const DRAFTS_KEY = "emlakSozlesmeTaslaklari";
const QUICK_KEY = "emlakHizliBilgiKayitlari";
const CARI_KEY = "emlakCariKayitlari";

const $ = (id) => document.getElementById(id);
// Android uygulaması (APK) içinde çalışırken yerel köprü: paylaşma, kaydetme, yazdırma.
const NATIVE = window.AndroidBridge || null;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const val = (id) => ($(id) ? $(id).value : "");
const setVal = (id, v) => { if ($(id)) $(id).value = v ?? ""; };
function trDate() { return new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function nowTr() { return new Date().toLocaleString("tr-TR"); }
function normalizeType(t) { return legacyMap[t] || t || "kira"; }
function readJson(key) { try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { toast("Cihaz hafızasına yazılamadı: " + e.message, "error"); } }
function trLower(s) { return String(s || "").toLocaleLowerCase("tr-TR"); }

/* ---------- Bildirimler ---------- */
function toast(msg, type = "info", ms = 3600) {
  const box = $("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, ms);
}
async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } finally { if (btn) btn.disabled = false; }
}

/* ---------- Sözleşme numarası ---------- */
function codePrefix(type) {
  return { kira: "KIRA", tahliye: "TAH", alimSatim: "SAT", satisVaadi: "VAD", yetkiSatis: "SYT", yetkiKiralama: "KYT", yerGosterme: "YGB", ortaklik: "ORT" }[normalizeType(type)] || "SOZ";
}
function seqKey(type) { return "emlakSozlesmeSeq_" + normalizeType(type); }
function contractNoNumber(no, type) {
  const r = String(no || "").match(new RegExp("^" + codePrefix(type) + "(\\d+)$"));
  return r ? parseInt(r[1], 10) || 0 : 0;
}
function isValidContractNoForType(no, type) {
  return new RegExp("^" + codePrefix(type) + "\\d{4,}$").test(String(no || ""));
}
function maxExistingNo(type) {
  type = normalizeType(type);
  let m = 0;
  const scan = (d) => {
    if (!d) return;
    const no = String(d.sozlesmeNo || d.id || "");
    const n = contractNoNumber(no, type);
    if (n) { m = Math.max(m, n); return; }
    if (normalizeType(d.contractType) === type) {
      const r2 = no.match(/(\d+)$/);
      if (r2) m = Math.max(m, parseInt(r2[1], 10) || 0);
    }
  };
  getDrafts().forEach(scan);
  firebaseCache.forEach(scan);
  return m;
}
function nextContractNo(type) {
  type = normalizeType(type || "kira");
  const seq = parseInt(localStorage.getItem(seqKey(type)) || "1", 10) || 1;
  const n = Math.max(seq, maxExistingNo(type) + 1);
  return codePrefix(type) + String(n).padStart(4, "0");
}
function recalibrateSequence(type) {
  type = normalizeType(type || "kira");
  localStorage.setItem(seqKey(type), String(maxExistingNo(type) + 1));
}
function recalibrateAllSequences() { ALL_TYPES.forEach(recalibrateSequence); }

/* ---------- Veri modeli ---------- */
function defaultData(type = "kira") {
  type = normalizeType(type || "kira");
  return {
    contractType: type, sozlesmeNo: nextContractNo(type), tarih: trDate(), duzenlemeYeri: OFFICE_DEFAULTS.yer,
    ofisAdi: OFFICE_DEFAULTS.ofisAdi, ofisYetkili: OFFICE_DEFAULTS.ofisYetkili, ofisTel: OFFICE_DEFAULTS.ofisTel,
    yetkiBelgeNo: "", ofisVergiNo: "", ofisAdres: OFFICE_DEFAULTS.yer,
    party1Name: "", party2Name: "", party1Tc: "", party2Tc: "", party1Tel: "", party2Tel: "", party1Adres: "", party2Adres: "",
    tasinmazAdres: "", ilIlce: OFFICE_DEFAULTS.yer, mahalle: "", nitelik: "Konut / Daire", ada: "", parselBb: "", m2OdaKat: "", tapuTakyidat: "",
    aylikKira: "", depozito: "", kiraBaslangic: "", kiraBitis: "1 yıl", odemeGunu: "Her ayın 1-5 arası", odemeSekli: "Banka / IBAN",
    aidat: "Kiracıya ait", artisOrani: "Kanuni sınırlar içinde TÜFE (12 aylık ortalama) oranı", demirbaslar: "", yetkiliMahkeme: OFFICE_DEFAULTS.mahkeme, kiraOzel: "",
    tahliyeKiraBaslangic: "", tahliyeTarihi: "", tahliyeDuzenlemeTarihi: trDate(), tahliyeYeri: OFFICE_DEFAULTS.yer,
    alimSatimSatisBedeli: "", alimSatimKapora: "", alimSatimKaporaTuru: "Bağlanma parası / pey akçesi", alimSatimCaymaBedeli: "", alimSatimCezaiSart: "",
    alimSatimKalanOdeme: "", alimSatimOdemePlani: "", alimSatimDevirTarihi: "", alimSatimMasrafPaylasimi: "Taraflarca ayrıca kararlaştırılır",
    alimSatimTapuDurumu: "Satıcı beyanına göre taşınmaz üzerinde satışa engel ipotek, haciz, şerh veya kısıtlama bulunmamaktadır. Varsa özel hükümlerde belirtilir.",
    alimSatimTeslimDurumu: "Tapu devrinde boş ve kullanıma elverişli teslim edilir.", alimSatimHizmetBedeli: "",
    alimSatimKomisyonPaylasimi: "Taraflarca aksi kararlaştırılmadıkça eşit paylaşılır.", alimSatimEkMaddeler: "",
    satisVaadiResmiSekil: "Bilgilendirme yapıldı; resmi işlem ayrıca yapılacak", satisVaadiSerhDurumu: "Taraf talep ederse şerh verilecek",
    satisVaadiNoterTarihi: "", satisVaadiMasrafPaylasimi: "Taraflarca ayrıca kararlaştırılır",
    satisVaadiIfaSarti: "Satış bedelinin tamamı ödendiğinde resmi satış/devri için taraflar ilgili kurumda işlem yapacaktır.", satisVaadiEkMaddeler: "",
    yetkiIlanBedeli: "", yetkiSuresi: "", yetkiTuru: "Münhasır yetki", yetkiHizmetBedeli: "", yetkiKomisyonPaylasimi: "", yetkiCaymaBedeli: "", yetkiCezaiSart: "",
    yetkiPazarlama: "İlan portalları, sosyal medya, fotoğraf/video, tabela, müşteri görüşmesi, yer gösterme ve tanıtım çalışmaları emlak işletmesi tarafından yürütülür.",
    yetkiEkMaddeler: "",
    yerGostermeAmac: "Satın alma / kiralama", yerGostermeTarihi: trDate(), yerGostermeBedel: "", yerGostermeTakipSuresi: "6 ay", yerGostermeHizmetBedeli: "",
    yerGostermeSekli: "Fiziki gösterim / online gösterim / konum paylaşımı", yerGostermeNot: "", yerGostermeEkMaddeler: "",
    ortaklikHizmetBedeli: "", ortaklikOran: "", ortaklikCaymaBedeli: "", ortaklikCezaiSart: "",
    ortaklikGorevPaylasimi: "Portföy sahibi ve müşteri sahibi taraflarca belirlenir.", ortaklikNot: "", ortaklikEkMaddeler: "",
    sigParty1: "", sigParty2: "", sigWitness: "",
  };
}
// Sözleşmeye yazılacak alanlar: yalnızca bu liste (giriş şifresi vb. asla kayda girmez).
let CONTRACT_FIELDS = [];
let CONTRACT_FIELD_SET = new Set();
function initContractFields() {
  CONTRACT_FIELDS = Object.keys(defaultData("kira")).filter((id) => $(id));
  CONTRACT_FIELD_SET = new Set(CONTRACT_FIELDS);
}
function getData() {
  const d = {};
  for (const id of CONTRACT_FIELDS) d[id] = val(id);
  return d;
}
function stripLeaked(o) { for (const k of LEAKED_KEYS) delete o[k]; return o; }
function migrateData(o) {
  o = stripLeaked({ ...(o || {}) });
  o.contractType = normalizeType(o.contractType);
  const cp = (to, from) => { if ((o[to] === undefined || o[to] === "") && o[from]) o[to] = o[from]; };
  if (o.contractType === "alimSatim") {
    cp("alimSatimSatisBedeli", "satisBedeli"); cp("alimSatimKapora", "kapora"); cp("alimSatimCaymaBedeli", "vaadiCaymaBedeli");
    cp("alimSatimCezaiSart", "vaadiCezaiSart"); cp("alimSatimEkMaddeler", "ekMaddeler");
  }
  if (o.contractType === "yetkiSatis") {
    cp("yetkiIlanBedeli", "yetkiSatisIlanFiyati"); cp("yetkiSuresi", "yetkiSatisSuresi"); cp("yetkiHizmetBedeli", "yetkiSatisHizmetBedeli");
    cp("yetkiCaymaBedeli", "yetkiSatisCaymaBedeli"); cp("yetkiCezaiSart", "yetkiSatisCezaiSart"); cp("yetkiEkMaddeler", "yetkiSatisEkMaddeler");
  }
  if (o.contractType === "yetkiKiralama") {
    cp("yetkiIlanBedeli", "yetkiKiralamaIlanKira"); cp("yetkiSuresi", "yetkiKiralamaSuresi"); cp("yetkiHizmetBedeli", "yetkiKiralamaHizmetBedeli");
    cp("yetkiCaymaBedeli", "yetkiKiralamaCaymaBedeli"); cp("yetkiCezaiSart", "yetkiKiralamaCezaiSart"); cp("yetkiEkMaddeler", "yetkiKiralamaEkMaddeler");
  }
  return o;
}
function getDrafts() { return readJson(DRAFTS_KEY).map(migrateData); }
function setDrafts(arr) { writeJson(DRAFTS_KEY, arr.slice(0, 500)); }

/* ---------- Tutar alanları ---------- */
const MONEY_FIELDS = [
  "aylikKira", "depozito", "aidat", "qbBedel", "qbPazarlik", "qbAidat", "qbDepozito",
  "alimSatimSatisBedeli", "alimSatimKapora", "alimSatimCaymaBedeli", "alimSatimCezaiSart", "alimSatimKalanOdeme", "alimSatimHizmetBedeli",
  "yetkiIlanBedeli", "yetkiHizmetBedeli", "yetkiCaymaBedeli", "yetkiCezaiSart",
  "yerGostermeBedel", "yerGostermeHizmetBedeli", "ortaklikHizmetBedeli", "ortaklikCaymaBedeli", "ortaklikCezaiSart", "cariTutar",
];
function digitsOnly(v) { return String(v || "").replace(/[^0-9]/g, ""); }
// Yalnızca rakam/nokta/boşluk ve isteğe bağlı "TL" içeren değerler biçimlenir;
// "Kiracıya ait", "%2 + KDV" gibi metinler olduğu gibi korunur.
function isPlainAmount(v) { return /^[\d.\s]*(tl|₺)?\s*$/i.test(String(v || "").trim()); }
function formatTL(v) {
  const s = String(v ?? "");
  if (!isPlainAmount(s)) return s;
  const d = digitsOnly(s).replace(/^0+(?=\d)/, "");
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " TL" : "";
}
function amountOf(v) { return isPlainAmount(v) ? parseInt(digitsOnly(v) || "0", 10) || 0 : 0; }
function money(n) { return Math.round(Number(n || 0)).toLocaleString("tr-TR") + " TL"; }
function reformatMoneyInput(el) {
  const old = el.value;
  if (!isPlainAmount(old)) return;
  const pos = el.selectionStart ?? old.length;
  const digitsAfter = digitsOnly(old.slice(pos)).length;
  const nv = formatTL(old);
  if (nv === old) return;
  el.value = nv;
  let p = nv.replace(/\s*TL$/, "").length, c = 0;
  while (p > 0 && c < digitsAfter) { p--; if (/\d/.test(nv[p])) c++; }
  try { el.setSelectionRange(p, p); } catch (e) {}
}
function normalizeMoneyFields() { for (const id of MONEY_FIELDS) { const el = $(id); if (el && el.value) el.value = formatTL(el.value); } }
function setupMoneyFields() {
  for (const id of MONEY_FIELDS) {
    const el = $(id);
    if (!el) continue;
    el.inputMode = "decimal";
    el.autocomplete = "off";
    el.classList.add("moneyInputReady");
    if (!el.placeholder) el.placeholder = "Örn: 1.500.000 TL";
    el.addEventListener("input", () => reformatMoneyInput(el), true);
    el.addEventListener("blur", () => { el.value = formatTL(el.value); if (CONTRACT_FIELD_SET.has(id)) render(); });
  }
}

/* ---------- Doğrulama yardımcıları ---------- */
function parseTrDate(s) {
  const m = String(s || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(d) ? null : d;
}
function isValidTC(s) {
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8], even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/* ---------- Belge oluşturma ---------- */
function row(k, v) { return `<tr><th>${esc(k)}</th><td>${esc(v || "")}</td></tr>`; }
function clauseHtml(text) {
  return String(text || "").split("\n").map((l) => (l.trim() ? `<div class="cl">${esc(l)}</div>` : '<div class="gap"></div>')).join("");
}
function sectionIf(title, text) { return text ? `<div class="articleTitle">${esc(title)}</div><div class="clauseList">${clauseHtml(text)}</div>` : ""; }
function signDisplay(name, key) {
  if (name === "Emlak İşletmesi") return [val("ofisAdi") || OFFICE_DEFAULTS.ofisAdi, val("ofisYetkili")].filter(Boolean).join(" / ");
  if (key === "sigParty1") return val("party1Name");
  if (key === "sigParty2") return val("party2Name");
  return "";
}
function sig(name, key) {
  const s = val(key);
  const okSig = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);
  return `<div class="signBox"><b>${esc(name)}</b><div class="signName">${esc(signDisplay(name, key))}</div><div class="printedSig ${okSig ? "" : "empty"}">${okSig ? `<img src="${s}" alt="imza">` : "İmza"}</div><div class="signHint">Ad soyad / kaşe / imza</div></div>`;
}
function signs(a, b, third = "Şahit / 3. İmza") { return `<div class="signs finalSignBlock">${sig(a, "sigParty1")}${sig(b, "sigParty2")}${third ? sig(third, "sigWitness") : ""}</div>`; }
function signs2(a, b) { return `<div class="signs two finalSignBlock">${sig(a, "sigParty1")}${sig(b, "sigParty2")}</div>`; }
function initialSig(name, key) { return `<div class="initialBox"><div class="line"></div><div class="who">${esc(name)}</div><div class="nm">${esc(signDisplay(name, key))}</div><div class="hint">paraf</div></div>`; }
function initials(a, b, third = "Şahit / 3. İmza") { return `<div class="initials">${initialSig(a, "sigParty1")}${initialSig(b, "sigParty2")}${third ? initialSig(third, "sigWitness") : ""}</div>`; }
function initials2(a, b) { return `<div class="initials two">${initialSig(a, "sigParty1")}${initialSig(b, "sigParty2")}</div>`; }
function commonHead(title) {
  return `<div class="meta">Sözleşme No: <b>${esc(val("sozlesmeNo"))}</b> &nbsp;|&nbsp; Tarih: ${esc(val("tarih"))} &nbsp;|&nbsp; Yer: ${esc(val("duzenlemeYeri"))}</div>`
    + `<div class="officeHead"><div class="officeLeft"><img class="docLogo" src="${LOGO_SRC}" alt=""><div><div class="officeName">${esc(val("ofisAdi") || OFFICE_DEFAULTS.ofisAdi)}</div><div>${esc(val("ofisAdres"))}</div></div></div>`
    + `<div class="officeRight"><b>Yetkili:</b> ${esc(val("ofisYetkili"))}<br><b>Tel:</b> ${esc(val("ofisTel"))}${val("yetkiBelgeNo") ? "<br><b>Yetki Belge No:</b> " + esc(val("yetkiBelgeNo")) : ""}${val("ofisVergiNo") ? "<br><b>Vergi/T.C. No:</b> " + esc(val("ofisVergiNo")) : ""}</div></div><h1>${esc(title)}</h1>`;
}
function partiesTable(a, b) {
  return `<h2>Taraflar</h2><table>${row(a, val("party1Name"))}${row(a + " T.C./Vergi No", val("party1Tc"))}${row(a + " Telefon", val("party1Tel"))}${row(a + " Adres", val("party1Adres"))}${row(b, val("party2Name"))}${row(b + " T.C./Vergi No", val("party2Tc"))}${row(b + " Telefon", val("party2Tel"))}${row(b + " Adres", val("party2Adres"))}</table>`;
}
function propertyTable() {
  return `<h2>Taşınmaz Bilgileri</h2><table>${row("Adres", val("tasinmazAdres"))}${row("İl / İlçe", val("ilIlce"))}${row("Mahalle", val("mahalle"))}${row("Nitelik", val("nitelik"))}${row("Ada / Parsel / BB No", [val("ada"), val("parselBb")].filter(Boolean).join(" / "))}${row("m² / Oda / Kat", val("m2OdaKat"))}${row("Tapu / Takyidat Notu", val("tapuTakyidat"))}</table>`;
}
const kiraKosullar = `1. Kiracı, kiralananı özenle kullanmak zorundadır.
2. Kiracı, kiralananda ve çevrede oturanlara iyi niyet kuralları içinde davranmaya zorunludur.
3. Kiracı, kiralananı kısmen veya tamamen üçüncü kişilere kiralayamaz, alt kiraya veremez; devir ve temlik edemez.
4. Kiracı, kiralayanın yazılı izni olmadıkça, kiralananda değişiklik yapamaz; aksi halde, doğacak zararı karşılamak zorundadır.
5. Üçüncü kişilerin kiralanan üzerinde hak iddia etmeleri halinde kiracı, durumu derhal kiralayana haber vermek zorundadır.
6. Kiracı, kiralananda yapılması gereken onarımları derhal kiralayana bildirmek zorundadır; aksi halde doğacak zarardan sorumludur.
7. Kiracı, kat malikleri kurulunca kendisine tebliğ edilen hususları kiralayana haber vermek zorundadır.
8. Kiracı, kat malikleri kurulu kararı uyarınca yapılması gereken işlere izin vermek zorundadır.
9. Kiracı, kiralanandaki onarımlara katlanmak ve kiralanandaki olağan kullanımdan dolayı yapılması gereken onarımları yapmak/yaptırmak ve giderlerini karşılamak zorundadır.
10. Kiralananın mülkiyet hakkından doğan vergileri kiralayana, kullanımdan doğan vergi, resim ve harçları kiracıya aittir. Uyuşmazlık halinde, yerel örf ve adetler uygulanır.
11. Kiracı, kira sözleşmesinin sonunda, kiralananı aldığı şekilde kiralayana teslim etmek zorundadır. Kiralananla birlikte teslim edilen demirbaşlar da alındığı şekilde teslim edilmediği takdirde, oluşan hasarların bedelinin kiralayana ödenmesi veya eski hale getirilmesi zorunludur.
12. Kiralananın iyi ve kullanılmaya elverişli halde teslim edildiği asıldır. Aksi durum kiracı tarafından ispatlanmak zorundadır. Kiralananın normal kullanımından dolayı ortaya çıkacak yıpranma ve eskiliklerden dolayı kiracı sorumlu değildir.
13. Kiracı, kira sözleşmesinin sona ermesi veya satışa çıkarılması halinde, kiralananın gezilmesine ve incelenmesine izin vermek zorundadır.
14. Kiralananın boşaltılması/tahliyesi gerektiği hallerde, kiralananın boşaltılmaması durumunda ortaya çıkacak zararlardan dolayı kiracı sorumlu olacaktır.
15. Kiracı, kendisi veya birlikte oturanların sağlığı için ciddi tehlike oluşturmayan kusurlardan dolayı kiralayanı teslim almaktan kaçınamaz, sözleşmeyi bozamaz ve kiradan indirim talebinde bulunamaz.
16. Kiracı, kiralayana yaptığı faydalı ve lüks şeylerin bedelini kiralayandan isteyemez ve sözleşme bitiminde bunları kiralayana teslim etmek zorundadır.
17. Kiracı, kiralayanın yazılı olurunu almak ve giderleri kendisine ait olmak üzere genel anten, uydu anteni, kablo televizyon gibi donanımları yaptırabilir.
18. İşbu kira sözleşmesinde yer almayan hususlar hakkında 6098 sayılı Türk Borçlar Kanunu hükümleri geçerlidir.`;
function legalWarning(t) {
  const lines = ["Taraflar, sözleşmede yazılı bilgilerin doğru olduğunu, belgeyi okuyup anladıklarını ve serbest iradeleriyle imzaladıklarını kabul eder."];
  if (["kira", "tahliye", "yetkiKiralama"].includes(t)) lines.push("Kira ilişkilerinde dava şartı arabuluculuk, görevli mahkeme ve icra hükümleri saklıdır.");
  if (["alimSatim", "satisVaadi", "yetkiSatis", "yetkiKiralama", "yerGosterme", "ortaklik"].includes(t)) lines.push("Emlak aracılık hizmet bedellerinde yürürlükteki mevzuattaki üst sınırlar ve tek hizmet bedeli ilkesi saklıdır.");
  if (["alimSatim", "satisVaadi", "yetkiSatis", "yetkiKiralama", "ortaklik"].includes(t)) lines.push("Kapora, cayma bedeli ve cezai şart alanları boş bırakılmışsa ilgili hüküm uygulanmaz; yazılı tutar ve şartlar esas alınır.");
  if (t === "alimSatim") lines.push("Tapu devri ilgili kurumlarda tamamlanmadan mülkiyet devri gerçekleşmiş sayılmaz.");
  if (t === "satisVaadi") lines.push("Taşınmaz satış vaadi resmi şekle tabi olduğundan, bu çıktı ön hazırlık/taslak niteliğindedir; taraflar geçerlilik için resmi şekil şartını ayrıca kontrol etmelidir.");
  lines.push(t === "tahliye" ? "Bu tahliye taahhütnamesi tek nüsha olarak hazırlanmış bağımsız belgedir." : "İşbu belge taraf sayısına göre nüsha halinde düzenlenir; imzalı nüshalar taraflarca saklanır.");
  return `<div class="legal"><b>Yasal Uyarı / Kontrol:</b> ${esc(lines.join(" "))}</div>`;
}
function renderKira() {
  return `${commonHead("Kira Sözleşmesi")}${partiesTable("Kiraya Veren", "Kiracı")}${propertyTable()}<h2>Kira Şartları</h2><table>${row("Aylık Kira Bedeli", val("aylikKira"))}${row("Depozito", val("depozito"))}${row("Kira Başlangıç Tarihi", val("kiraBaslangic"))}${row("Kira Süresi / Bitiş", val("kiraBitis"))}${row("Ödeme Günü", val("odemeGunu"))}${row("Ödeme Şekli / IBAN", val("odemeSekli"))}${row("Aidat / Ortak Gider", val("aidat"))}${row("Artış Oranı", val("artisOrani"))}${row("Demirbaş / Teslim Durumu", val("demirbaslar"))}${row("Uyuşmazlık / Yetki", val("yetkiliMahkeme"))}</table>${initials("Kiraya Veren", "Kiracı")}<div class="articleTitle">GENEL KOŞULLAR</div><div class="clauseList">${clauseHtml(kiraKosullar)}</div>${sectionIf("Kira Özel Şartları / Ek Maddeler", val("kiraOzel"))}${legalWarning("kira")}${signs("Kiraya Veren", "Kiracı")}`;
}
function renderTahliye() {
  const text = `Kiracısı olduğum yukarıda bilgileri yazılı taşınmazı, hiçbir ihtar ve ihbara gerek kalmaksızın, ${val("tahliyeTarihi") || "……/……/………"} tarihinde kayıtsız ve şartsız olarak tahliye ederek kiraya verene boş, sağlam ve kullanıma elverişli şekilde teslim etmeyi kabul ve taahhüt ederim.

İşbu tahliye taahhütnamesi; kira sözleşmesinden bağımsız, serbest irade ile ve kira başlangıcından sonra/ayrıca düzenlenmiş bir taahhütname olarak imzalanmıştır. Kiracı, belirtilen tarihte taşınmazı tahliye etmemesi halinde kiraya verenin yasal icra ve dava yollarına başvurabileceğini kabul eder.`;
  return `${commonHead("Tahliye Taahhütnamesi")}${partiesTable("Kiraya Veren", "Kiracı")}${propertyTable()}<div class="articleTitle">TAHLİYE TAAHHÜDÜ</div><div class="clauseList">${clauseHtml(text)}</div><h2>Taahhüt Bilgileri</h2><table>${row("Kira Başlangıç Tarihi", val("tahliyeKiraBaslangic") || val("kiraBaslangic"))}${row("Taahhüt Edilen Tahliye Tarihi", val("tahliyeTarihi"))}${row("Taahhütname Düzenleme Tarihi", val("tahliyeDuzenlemeTarihi"))}${row("Düzenleme Yeri", val("tahliyeYeri"))}</table>${initials("Kiraya Veren", "Kiracı")}${legalWarning("tahliye")}${signs("Kiraya Veren", "Kiracı")}`;
}
const alimSatimMaddeleri = `1. Satıcı, yukarıda bilgileri yazılı taşınmazı formda belirtilen satış bedeli ve şartlarla alıcıya satmayı; alıcı da bu şartlarla satın almayı kabul eder.
2. Alıcı tarafından verilen kapora/bağlanma parası sözleşmenin kurulduğuna delil niteliğindedir. Kapora türü açıkça cayma parası olarak seçilmişse, cayan taraf için yazılı cayma bedeli hükümleri uygulanır.
3. Cayma bedeli yazılmışsa, haklı sebep olmaksızın işlemden vazgeçen taraf formda yazılı cayma bedelini diğer tarafa ve varsa emlak hizmet bedeline ilişkin kararlaştırılan tutarları ödemeyi kabul eder.
4. Cezai şart yazılmışsa, tapuya gelmemek, ödeme planına uymamak, taşınmazı kararlaştırılan şekilde teslim etmemek, takyidatı gizlemek veya belge ibrazından kaçınmak gibi sözleşmeye aykırılıklarda cezai şart uygulanır.
5. Satıcı; taşınmazın tapu kaydı, imar/kullanım durumu, ipotek, haciz, şerh, kira, aidat, vergi ve fiili kullanım durumuna ilişkin bilgileri doğru beyan ettiğini kabul eder.
6. Alıcı, taşınmazı görerek ve mevcut fiili/tapusal durumunu inceleyerek işbu sözleşmeyi imzaladığını kabul eder. Gizli ayıp ve hile halleri saklıdır.
7. Satış bedelinin ödeme şekli ve kalan ödeme planı formda yazılıdır. Ödemelerin banka kanalıyla yapılması ve dekontların saklanması esastır.
8. Tapu harcı, döner sermaye, vergi, ekspertiz, kredi ve diğer masrafların paylaşımı formda yazılı şekilde uygulanır; boşsa taraflar tapu öncesinde ayrıca yazılı kararlaştırır.
9. Emlak işletmesi tarafından tarafların bir araya getirilmesi, pazarlık ve belge hazırlık süreçlerinin yürütülmesi halinde hizmet bedeli doğar. Tarafların emlak işletmesini bertaraf ederek işlem yapması hizmet bedeli sorumluluğunu ortadan kaldırmaz.
10. Uyuşmazlıklarda dava şartı arabuluculuk ve görevli mahkeme kuralları saklı kalmak kaydıyla formda yazılı mahkeme ve icra daireleri yetkilidir.`;
function renderAlimSatim() {
  return `${commonHead("Taşınmaz Alım Satım / Kapora Sözleşmesi")}${partiesTable("Satıcı", "Alıcı")}${propertyTable()}<h2>Satış ve Kapora Şartları</h2><table>${row("Satış Bedeli", val("alimSatimSatisBedeli"))}${row("Kapora / Bağlanma Parası", val("alimSatimKapora"))}${row("Kapora Türü", val("alimSatimKaporaTuru"))}${row("Cayma Bedeli", val("alimSatimCaymaBedeli"))}${row("Cezai Şart", val("alimSatimCezaiSart"))}${row("Kalan Ödeme", val("alimSatimKalanOdeme"))}${row("Ödeme Planı", val("alimSatimOdemePlani"))}${row("Tapu Devir Tarihi", val("alimSatimDevirTarihi"))}${row("Tapu Harcı / Masraf Paylaşımı", val("alimSatimMasrafPaylasimi"))}${row("İpotek / Haciz / Şerh / Kiracı Durumu", val("alimSatimTapuDurumu"))}${row("Teslim Durumu", val("alimSatimTeslimDurumu"))}${row("Emlak Hizmet Bedeli", val("alimSatimHizmetBedeli"))}${row("Komisyon Paylaşımı", val("alimSatimKomisyonPaylasimi"))}</table>${initials("Satıcı", "Alıcı")}<div class="articleTitle">ALIM SATIM / KAPORA SÖZLEŞME MADDELERİ</div><div class="clauseList">${clauseHtml(alimSatimMaddeleri)}</div>${sectionIf("Alım Satım Ek Maddeleri", val("alimSatimEkMaddeler"))}${legalWarning("alimSatim")}${signs("Satıcı", "Alıcı")}`;
}
const satisVaadiMaddeleri = `1. Satış vaadinde bulunan taraf, yukarıda bilgileri yazılı taşınmazı formda belirtilen bedel, ödeme planı ve şartlarla satış vaadini kabul eden tarafa devretmeyi; karşı taraf da bedeli ödemeyi ve resmi devir işlemlerine katılmayı kabul eder.
2. Taraflar, taşınmaz satış vaadi sözleşmelerinde resmi şekil şartının önemini bildiklerini; bu belgenin emlak ofisi ön hazırlık/taslak ve taraf iradesini düzenleme amacı taşıdığını kabul eder. Geçerlilik ve icra edilebilirlik için resmi şekil şartı ve tapu işlemleri ayrıca kontrol edilir.
3. Satış bedeli, kapora/bağlanma parası, kalan ödeme, ödeme planı ve resmi işlem tarihi formda yazılıdır. Ödemelerin banka kanalıyla yapılması ve dekontların saklanması esastır.
4. Kapora türü açıkça cayma parası olarak seçilmişse, haklı sebep olmaksızın işlemden dönen taraf için formda yazılı cayma bedeli uygulanır. Cayma bedeli boş bırakılmışsa bu hüküm uygulanmaz.
5. Cezai şart yazılmışsa; resmi işlem gününde hazır bulunmamak, ödeme planına uymamak, takyidat veya hukuki engel gizlemek, gerekli belgeyi vermemek, taşınmazı kararlaştırılan şekilde teslim etmemek gibi aykırılıklarda uygulanır.
6. Satış vaadinde bulunan taraf; taşınmazın tapu kaydı, malikliği, hisse durumu, imar/yapı kullanma durumu, ipotek, haciz, şerh, kira, aidat, vergi ve fiili kullanım durumuna ilişkin bilgileri doğru beyan ettiğini kabul eder.
7. Satış vaadini kabul eden taraf, taşınmazı görerek ve mevcut tapusal/fiili durumunu inceleyerek işlem yaptığını kabul eder. Gizli ayıp, hile, sahte beyan ve üçüncü kişi hakları saklıdır.
8. Tapu harcı, noter/şerh masrafı, döner sermaye, vergi, ekspertiz, kredi ve benzeri giderlerin kim tarafından karşılanacağı formda yazılıdır; boşsa taraflar resmi işlem öncesinde ayrıca yazılı kararlaştırır.
9. Taraflardan biri satış vaadinin tapuya şerhini talep ederse, şerh masrafı ve işlemleri formda belirtilen şekilde karşılanır. Şerh verilmesi veya verilmemesi tarafların yasal haklarını ortadan kaldırmaz.
10. Emlak işletmesi tarafından tarafların bir araya getirilmesi, pazarlık, portföy, ilan, belge hazırlığı ve takip işlemlerinin yürütülmesi halinde hizmet bedeli doğar. Tarafların emlak işletmesini bertaraf ederek işlem yapması hizmet bedeli sorumluluğunu ortadan kaldırmaz.
11. Taraflar, tebligat adreslerinin formda yazılı adresler olduğunu; adres değişiklikleri yazılı bildirilmedikçe eski adrese yapılan bildirimlerin geçerli sayılacağını kabul eder.
12. Uyuşmazlıklarda dava şartı arabuluculuk, görevli mahkeme ve icra hükümleri saklı kalmak kaydıyla formda yazılı mahkeme ve icra daireleri yetkilidir.`;
function renderSatisVaadi() {
  return `${commonHead("Taşınmaz Satış Vaadi Sözleşmesi")}${partiesTable("Satış Vaadinde Bulunan", "Satış Vaadini Kabul Eden")}${propertyTable()}<h2>Satış Vaadi ve Ödeme Şartları</h2><table>${row("Satış Bedeli", val("alimSatimSatisBedeli"))}${row("Kapora / Bağlanma Parası", val("alimSatimKapora"))}${row("Kapora Türü", val("alimSatimKaporaTuru"))}${row("Cayma Bedeli", val("alimSatimCaymaBedeli"))}${row("Cezai Şart", val("alimSatimCezaiSart"))}${row("Kalan Ödeme", val("alimSatimKalanOdeme"))}${row("Ödeme Planı", val("alimSatimOdemePlani"))}${row("Resmi İşlem / Devir Tarihi", val("alimSatimDevirTarihi"))}${row("Resmi Şekil / Noter Durumu", val("satisVaadiResmiSekil"))}${row("Tapuya Şerh Durumu", val("satisVaadiSerhDurumu"))}${row("Resmi İşlem / Noter Tarihi", val("satisVaadiNoterTarihi"))}${row("Tapu / Noter / Şerh Masraf Paylaşımı", val("satisVaadiMasrafPaylasimi") || val("alimSatimMasrafPaylasimi"))}${row("İpotek / Haciz / Şerh / Kiracı Durumu", val("alimSatimTapuDurumu"))}${row("Teslim Durumu", val("alimSatimTeslimDurumu"))}${row("Vaadin Yerine Getirilme Şartı", val("satisVaadiIfaSarti"))}${row("Emlak Hizmet Bedeli", val("alimSatimHizmetBedeli"))}${row("Komisyon Paylaşımı", val("alimSatimKomisyonPaylasimi"))}</table>${initials("Satış Vaadinde Bulunan", "Satış Vaadini Kabul Eden")}<div class="articleTitle">SATIŞ VAADİ SÖZLEŞME MADDELERİ</div><div class="clauseList">${clauseHtml(satisVaadiMaddeleri)}</div>${sectionIf("Satış Vaadi Ek Maddeleri", val("satisVaadiEkMaddeler"))}${legalWarning("satisVaadi")}${signs("Satış Vaadinde Bulunan", "Satış Vaadini Kabul Eden")}`;
}
function yetkiMaddeleri(sale) {
  return `1. İş sahibi, yukarıda bilgileri yazılı taşınmazın ${sale ? "satış" : "kiralama"} pazarlaması için emlak işletmesini işbu sözleşmede yazılı süre ve şartlarla yetkilendirir.
2. Emlak işletmesi; ilan, pazarlama, fotoğraf/video, sosyal medya, müşteri görüşmesi, yer gösterme, teklif alma-verme ve belge hazırlık süreçlerini yürütür.
3. İş sahibi, taşınmaza ilişkin tapu, imar, yapı kullanma, aidat, vergi, takyidat, kiracı/oturum ve fiili kullanım bilgilerini doğru verdiğini kabul eder. Eksik veya yanlış beyandan doğacak sorumluluk iş sahibine aittir.
4. Yetki türü münhasır olarak belirlenmişse iş sahibi, yetki süresi içinde aynı taşınmaz için başka kişi/ofis üzerinden veya doğrudan işlem yapması halinde hizmet bedeli, cayma bedeli ve cezai şart hükümlerinden sorumlu olur.
5. Emlak işletmesi tarafından bulunan müşteriyle, iş sahibi veya yakınları/şirketleri/temsilcileri üzerinden doğrudan işlem yapılması emlak işletmesini bertaraf etme sayılır ve hizmet bedeli doğar.
6. Cayma bedeli ve cezai şart yazılmışsa; iş sahibinin haklı sebep olmadan pazarlamayı durdurması, müşteriyi gizlemesi, işlemden vazgeçmesi veya bilgi saklaması halinde uygulanır. Bu bedellerde mevzuattaki hizmet bedeli sınırları saklıdır.
7. Hizmet bedeli; ${sale ? "satışın gerçekleşmesi veya tarafların satış işleminde anlaşması" : "kiralama işleminin gerçekleşmesi veya kira sözleşmesinin imzalanması"} halinde muaccel olur.
8. Yetki süresi sonunda taraflar yazılı olarak yenileme yapmadıkça yetki sona erer; ancak yetki süresinde gösterilen/ilişki kurulan müşteriyle yapılan işlemlerde hizmet bedeli hakkı saklıdır.
9. Taraflar tebligat adreslerinin formda yazılı adresler olduğunu, değişikliklerin yazılı bildirilmedikçe eski adrese yapılacak bildirimlerin geçerli olacağını kabul eder.`;
}
function renderYetki(type) {
  const sale = type === "yetkiSatis";
  return `${commonHead(sale ? "Satış Yetkilendirme Sözleşmesi" : "Kiralama Yetkilendirme Sözleşmesi")}${partiesTable("Mülk Sahibi", "Emlak İşletmesi")}${propertyTable()}<h2>Yetki ve Pazarlama Şartları</h2><table>${row(sale ? "İlan / Hedef Satış Bedeli" : "İlan / Hedef Kira Bedeli", val("yetkiIlanBedeli"))}${row("Yetki Süresi", val("yetkiSuresi"))}${row("Yetki Türü", val("yetkiTuru"))}${row("Hizmet Bedeli / Komisyon", val("yetkiHizmetBedeli"))}${row("Komisyon Paylaşımı", val("yetkiKomisyonPaylasimi"))}${row("Cayma Bedeli", val("yetkiCaymaBedeli"))}${row("Cezai Şart", val("yetkiCezaiSart"))}${row("Pazarlama / İlan Koşulları", val("yetkiPazarlama"))}</table>${initials2("Mülk Sahibi", "Emlak İşletmesi")}<div class="articleTitle">${sale ? "SATIŞ" : "KİRALAMA"} YETKİ SÖZLEŞME MADDELERİ</div><div class="clauseList">${clauseHtml(yetkiMaddeleri(sale))}</div>${sectionIf("Yetki Ek Maddeleri", val("yetkiEkMaddeler"))}${legalWarning(type)}${signs2("Mülk Sahibi", "Emlak İşletmesi")}`;
}
const yerGostermeMaddeleri = `1. Emlak işletmesi, yukarıda bilgileri yazılı taşınmazı müşteriye fiziki olarak, elektronik ortamda veya konum/ilan bilgisi paylaşımı yoluyla göstermiştir.
2. Taşınmaz gösterme hizmeti karşılığında ayrıca yer gösterme ücreti alınmaz; hizmet bedeli ancak satış/kiralama işleminin gerçekleşmesi halinde formda yazılı şartlara ve mevzuat sınırlarına göre doğar.
3. Müşteri, gösterilen taşınmazı emlak işletmesini devre dışı bırakarak doğrudan mal sahibi, yakınları, şirketi, ortağı, temsilcisi veya üçüncü kişiler üzerinden satın alır/kiralarsa hizmet bedelinden sorumlu olacağını kabul eder.
4. Takip süresi içinde aynı taşınmaza ilişkin doğrudan veya dolaylı işlem yapılması halinde, işlem emlak işletmesinin gösterme/aracılık faaliyeti sonucu gerçekleşmiş sayılır.
5. Müşteri, kendisine verilen adres, mal sahibi iletişim bilgisi, fiyat ve portföy bilgilerini üçüncü kişilerle paylaşamaz; paylaşım nedeniyle doğacak işlem ve zararlardan sorumludur.
6. Birden fazla taşınmaz gösterilmişse, her taşınmaz için gösterim bilgisi ayrıca yazılır ve müşteri imzası tüm gösterimleri kapsar.
7. Hizmet bedeli oranı/tutarı formda yazılıdır; boş bırakılmışsa mevzuattaki üst sınırlar aşılmamak üzere tarafların ayrıca imzaladığı aracılık/yetki hükümleri esas alınır.
8. Taraflar, bu belgenin taşınmazın gösterildiğini ve müşteri-portföy bağlantısını ispat için düzenlendiğini kabul eder.`;
function renderYerGosterme() {
  return `${commonHead("Taşınmaz Yer Gösterme Belgesi")}${partiesTable("Emlak İşletmesi", "Müşteri")}${propertyTable()}<h2>Gösterim Bilgileri</h2><table>${row("Gösterim Amacı", val("yerGostermeAmac"))}${row("Gösterim Tarihi / Saati", val("yerGostermeTarihi"))}${row("İlan / Satış / Kira Bedeli", val("yerGostermeBedel"))}${row("Takip Süresi", val("yerGostermeTakipSuresi"))}${row("Hizmet Bedeli / Komisyon", val("yerGostermeHizmetBedeli"))}${row("Gösterim Şekli", val("yerGostermeSekli"))}${row("Gösterim Notu", val("yerGostermeNot"))}</table>${initials2("Emlak İşletmesi", "Müşteri")}<div class="articleTitle">YER GÖSTERME MADDELERİ</div><div class="clauseList">${clauseHtml(yerGostermeMaddeleri)}</div>${sectionIf("Yer Gösterme Ek Maddeleri", val("yerGostermeEkMaddeler"))}${legalWarning("yerGosterme")}${signs2("Emlak İşletmesi", "Müşteri")}`;
}
const ortaklikMaddeleri = `1. Taraflar, yukarıda bilgileri yazılı taşınmaz/müşteri/iş için hizmet ortaklığı ve komisyon paylaşımı yapmak üzere anlaşmıştır.
2. Portföy sahibi ofis; taşınmaz bilgileri, mal sahibi irtibatı, yetki durumu ve portföy doğruluğundan, müşteri sahibi ofis ise müşteri bilgileri, talep ve ödeme yeterliliği konusunda bildiği bilgileri paylaşmaktan sorumludur.
3. Hizmet bedeli, formda yazılı oran/tutar üzerinden ve mevzuattaki üst sınırlar aşılmadan paylaşılır. Paylaşım oranı yazılmamışsa taraflar eşit paylaşımı kabul eder.
4. Taraflardan biri diğer tarafı devre dışı bırakarak müşteri/mal sahibi ile doğrudan işlem yaparsa, diğer tarafın komisyon payı, cayma bedeli ve varsa cezai şart alacağı saklıdır.
5. Taraflar, iş sahibinin hizmet ortaklığından bilgilendirilmesi ve gerekli belge/örneklerin süresinde gönderilmesi konusunda birlikte hareket eder.
6. Müşteri, portföy, fiyat, pazarlık, kimlik ve iletişim bilgileri gizlidir; taraflar bu bilgileri işin gereği dışında üçüncü kişilerle paylaşamaz.
7. Komisyon tahsilatı hangi ofis tarafından yapılırsa yapılsın, tahsil eden taraf diğer tarafın payını gecikmeksizin öder.
8. Uyuşmazlıklarda dava şartı arabuluculuk ve görevli mahkeme kuralları saklı kalmak kaydıyla formda yazılı mahkeme ve icra daireleri yetkilidir.`;
function renderOrtaklik() {
  return `${commonHead("Hizmet Ortaklığı / Komisyon Paylaşım Sözleşmesi")}${partiesTable("1. Emlak Ofisi", "2. Emlak Ofisi")}${propertyTable()}<h2>Ortaklık Şartları</h2><table>${row("Hizmet Bedeli", val("ortaklikHizmetBedeli"))}${row("Paylaşım Oranı", val("ortaklikOran"))}${row("Cayma Bedeli", val("ortaklikCaymaBedeli"))}${row("Cezai Şart", val("ortaklikCezaiSart"))}${row("Görev Paylaşımı", val("ortaklikGorevPaylasimi"))}${row("Portföy / Müşteri Notu", val("ortaklikNot"))}</table>${initials2("1. Emlak Ofisi", "2. Emlak Ofisi")}<div class="articleTitle">HİZMET ORTAKLIĞI MADDELERİ</div><div class="clauseList">${clauseHtml(ortaklikMaddeleri)}</div>${sectionIf("Ortaklık Ek Maddeleri", val("ortaklikEkMaddeler"))}${legalWarning("ortaklik")}${signs2("1. Emlak Ofisi", "2. Emlak Ofisi")}`;
}
function renderCopies(html, t) {
  const copies = t === "tahliye" ? 1 : 2;
  let out = "";
  for (let i = 1; i <= copies; i++) {
    out += `<section class="copy"><div class="copyStamp">${copies === 1 ? "Tek nüsha" : i + ". nüsha"}</div>${html}</section>`;
    if (i < copies) out += '<div class="pageBreak"></div>';
  }
  return out;
}
let lastType = "kira";
function render() {
  const t = normalizeType(val("contractType"));
  if (val("contractType") !== t) setVal("contractType", t);
  lastType = t;
  const info = labels[t] || labels.kira;
  $("party1Label").textContent = info[0];
  $("party2Label").textContent = info[1];
  $("previewTitle").textContent = info[2];
  updateDetailGroups(t);
  updateSignatureLabels(t);
  let html;
  if (t === "kira") html = renderKira();
  else if (t === "tahliye") html = renderTahliye();
  else if (t === "alimSatim") html = renderAlimSatim();
  else if (t === "satisVaadi") html = renderSatisVaadi();
  else if (t === "yetkiSatis" || t === "yetkiKiralama") html = renderYetki(t);
  else if (t === "yerGosterme") html = renderYerGosterme();
  else html = renderOrtaklik();
  $("doc").innerHTML = renderCopies(html, t);
  checkMissing(t);
  updateFeeHints(t);
  updateEditState();
}
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function updateDetailGroups(t) {
  document.querySelectorAll(".detailGroup").forEach((g) => g.classList.toggle("hide", !(g.dataset.contracts || "").split(",").includes(t)));
}
const FIELD_NAMES = {
  tarih: "Düzenleme tarihi", party1Name: "1. taraf adı", party2Name: "2. taraf adı", tasinmazAdres: "Taşınmaz adresi", aylikKira: "Aylık kira",
  kiraBaslangic: "Kira başlangıcı", alimSatimSatisBedeli: "Satış bedeli", tahliyeKiraBaslangic: "Kira başlangıcı", tahliyeTarihi: "Tahliye tarihi",
  yetkiIlanBedeli: "İlan/hedef bedel", yerGostermeTarihi: "Gösterim tarihi", ortaklikOran: "Paylaşım oranı",
};
function checkMissing(t) {
  const req = ["tarih", "party1Name", "party2Name", "tasinmazAdres"];
  if (t === "kira") req.push("aylikKira", "kiraBaslangic");
  if (t === "tahliye") req.push("tahliyeKiraBaslangic", "tahliyeTarihi");
  if (t === "alimSatim" || t === "satisVaadi") req.push("alimSatimSatisBedeli");
  if (t === "yetkiSatis" || t === "yetkiKiralama") req.push("yetkiIlanBedeli");
  if (t === "yerGosterme") req.push("yerGostermeTarihi");
  if (t === "ortaklik") req.push("ortaklikOran");
  const info = labels[t] || labels.kira;
  const miss = req.filter((id) => !val(id).trim()).map((id) => (id === "party1Name" ? info[0] : id === "party2Name" ? info[1] : FIELD_NAMES[id] || id));
  const warns = [];
  for (const [id, who] of [["party1Tc", info[0]], ["party2Tc", info[1]]]) {
    const v = digitsOnly(val(id));
    if (v.length === 11 && !isValidTC(v)) warns.push(`${who} T.C. kimlik numarası geçersiz görünüyor`);
  }
  if (t === "tahliye") {
    const kb = parseTrDate(val("tahliyeKiraBaslangic")), dz = parseTrDate(val("tahliyeDuzenlemeTarihi")), th = parseTrDate(val("tahliyeTarihi"));
    if (kb && dz && dz <= kb) warns.push("Tahliye taahhüdü kira başlangıcıyla aynı gün veya önce düzenlenmiş; Yargıtay uygulamasına göre geçersiz sayılabilir");
    if (dz && th && th <= dz) warns.push("Tahliye tarihi, taahhütname tarihinden sonra olmalı");
  }
  let html = "";
  if (miss.length) html += `<div class="issues err"><b>Eksik:</b> ${esc(miss.join(", "))}</div>`;
  if (warns.length) html += `<div class="issues warn"><b>Kontrol:</b> ${esc(warns.join(" • "))}</div>`;
  $("missingBox").innerHTML = html;
  const st = $("statusText").parentElement;
  st.classList.toggle("ok", !miss.length && !warns.length);
  st.classList.toggle("warn", !!(miss.length || warns.length));
  $("statusText").textContent = miss.length ? `${miss.length} eksik alan` : warns.length ? "Kontrol önerilir" : "Çıktı almaya hazır";
}
// Taşınmaz Ticareti Hakkında Yönetmelik: satışta toplam %4, kiralamada bir aylık kira (KDV hariç) üst sınır;
// aksi yazılı kararlaştırılmadıkça taraflar arasında eşit paylaşılır.
function feeCaps(kind, base) {
  if (!base) return null;
  const total = kind === "satis" ? base * 0.04 : base;
  return { total, side: total / 2 };
}
function feeHintHtml(kind, base, targetId) {
  const c = feeCaps(kind, base);
  if (!c) return "";
  const what = kind === "satis" ? "satış bedelinin %4'ü" : "bir aylık kira bedeli";
  return `<span>Yasal üst sınır (KDV hariç): toplam <b>${money(c.total)}</b> (${what}); aksi kararlaştırılmadıkça taraf başına <b>${money(c.side)}</b>.</span><button class="linkBtn" type="button" data-fee-target="${targetId}" data-fee-value="${Math.round(c.side)}">Taraf payını yaz</button>`;
}
function updateFeeHints(t) {
  const hs = $("feeHintSatis"), hy = $("feeHintYetki");
  if (hs) {
    const h = feeHintHtml("satis", amountOf(val("alimSatimSatisBedeli")), "alimSatimHizmetBedeli");
    hs.innerHTML = h; hs.classList.toggle("hide", !h);
  }
  if (hy) {
    const h = feeHintHtml(t === "yetkiKiralama" ? "kira" : "satis", amountOf(val("yetkiIlanBedeli")), "yetkiHizmetBedeli");
    hy.innerHTML = h; hy.classList.toggle("hide", !h);
  }
}

/* ---------- Form durumu ---------- */
let editingExistingNo = "";
function setData(data) {
  data = { ...defaultData(normalizeType(data?.contractType || "kira")), ...migrateData(data) };
  for (const id of CONTRACT_FIELDS) setVal(id, data[id]);
  normalizeMoneyFields();
  render();
  loadSignaturesToCanvas();
}
function updateEditState() {
  const chip = $("editState"), no = $("noChip");
  if (no) no.textContent = val("sozlesmeNo") || "-";
  if (chip) {
    const editing = !!editingExistingNo && editingExistingNo === val("sozlesmeNo");
    chip.textContent = editing ? "Kayıtlı sözleşme düzenleniyor" : "Yeni sözleşme (kaydedilmedi)";
    chip.classList.toggle("editing", editing);
  }
  const os = $("officeSummary");
  if (os) os.textContent = [val("ofisAdi"), val("ofisYetkili")].filter(Boolean).join(" • ");
}
function formHasUserData() { return ["party1Name", "party2Name", "tasinmazAdres", "party1Tc", "party2Tc"].some((id) => val(id).trim()); }
function setContract(t) {
  editingExistingNo = "";
  setData(defaultData(normalizeType(t)));
}
function startNewContract() {
  editingExistingNo = "";
  setData(defaultData(val("contractType") || "kira"));
  activateTab("form");
}
function newDraft() {
  if (formHasUserData() && !confirm("Form temizlenip yeni sözleşme açılsın mı? Kaydedilmemiş değişiklikler kaybolur.")) return;
  startNewContract();
}

/* ---------- Görünüm / gezinme ---------- */
const VIEW_TITLES = { quick: "Portföy Ön Bilgi", contract: "Sözleşme", archive: "Arşiv", cari: "Kasa / Cari", admin: "Kullanıcılar" };
function activateTab(name) {
  const isStep = ["form", "details", "sign"].includes(name);
  const view = isStep ? "contract" : name === "contract" ? "contract" : name;
  if (view === "admin" && !(currentUser && currentUser.rol === "admin")) return;
  const step = isStep ? name : document.body.dataset.step || "form";
  const prevView = document.body.dataset.view;
  document.body.dataset.view = view;
  document.body.dataset.step = step;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hide", v.id !== "view-" + view));
  document.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
  document.querySelectorAll(".stepTab").forEach((b) => b.classList.toggle("active", b.dataset.tab === step));
  document.querySelectorAll(".stepPanel").forEach((p) => p.classList.toggle("hide", p.id !== "tab-" + step));
  if ($("mobileTitle")) $("mobileTitle").textContent = VIEW_TITLES[view] || "";
  if (view !== "contract") togglePreview(false);
  if (prevView !== view || isStep) window.scrollTo({ top: 0, behavior: prevView === view ? "smooth" : "auto" });
  if (view === "contract" && step === "sign") setTimeout(loadSignaturesToCanvas, 60);
  if (view === "archive") { renderSaved(); syncFirebaseToLocal(true); }
  if (view === "cari") { renderCariList(); syncCariFirebaseToLocal(true); }
  if (view === "quick") renderQuickList();
  if (view === "admin") loadUsersList();
}
function togglePreview(open) {
  document.body.classList.toggle("previewOpen", !!open);
}

/* ---------- Kaydetme / arşiv ---------- */
async function saveDraft(ev) {
  const btn = ev?.target?.closest?.("button");
  return withBusy(btn, async () => {
    const data = migrateData(getData());
    const t = normalizeType(data.contractType || "kira");
    data.contractType = t;
    const isUpdate = !!editingExistingNo && editingExistingNo === data.sozlesmeNo && isValidContractNoForType(data.sozlesmeNo, t);
    const old = isUpdate ? getDrafts().find((x) => x.sozlesmeNo === data.sozlesmeNo) : null;
    if (!isUpdate) {
      await refreshFirebaseCacheSilent();
      data.sozlesmeNo = nextContractNo(t);
      setVal("sozlesmeNo", data.sozlesmeNo);
    }
    const me = currentUser || {};
    data.olusturanAd = old?.olusturanAd || me.ad || "";
    data.olusturanEmail = old?.olusturanEmail || me.email || "";
    if (isUpdate) { data.guncelleyenAd = me.ad || ""; data.guncelleyenEmail = me.email || ""; }
    data.updatedAt = nowTr();
    data.updatedAtIso = new Date().toISOString();
    const arr = getDrafts().filter((x) => x.sozlesmeNo !== data.sozlesmeNo);
    arr.unshift(data);
    setDrafts(arr);
    firebaseCache = [data, ...firebaseCache.filter((x) => x.sozlesmeNo !== data.sozlesmeNo)];
    const savedNum = contractNoNumber(data.sozlesmeNo, t);
    const cur = parseInt(localStorage.getItem(seqKey(t)) || "1", 10) || 1;
    if (savedNum + 1 > cur) localStorage.setItem(seqKey(t), String(savedNum + 1));
    editingExistingNo = data.sozlesmeNo;
    updateEditState();
    renderSaved();
    const ok = await saveContractToFirebase(data);
    const msg = (isUpdate ? "Sözleşme güncellendi: " : "Sözleşme kaydedildi: ") + data.sozlesmeNo;
    toast(ok ? msg : msg + " (bulut kaydı yapılamadı, cihazda saklandı)", ok ? "success" : "warn", 4500);
  });
}
function recordTitle(x) { return [x.party1Name, x.party2Name].filter(Boolean).join(" / ") || "İsimsiz taraflar"; }
let archiveTypeFilter = "";
function renderSaved() {
  fillTahliyeSourceOptions();
  const all = getDrafts().filter(isRealContractRecord);
  if ($("navArchiveCount")) $("navArchiveCount").textContent = all.length || "";
  const el = $("savedList");
  if (!el) return;
  const q = trLower(val("archiveSearch"));
  const tf = val("archiveType");
  const counts = {};
  all.forEach((x) => { counts[x.contractType] = (counts[x.contractType] || 0) + 1; });
  const stats = $("archiveStats");
  if (stats) stats.innerHTML = all.length ? `<span class="chip ${tf ? "" : "on"}" data-act="ftype" data-type="">Tümü ${all.length}</span>` + ALL_TYPES.filter((k) => counts[k]).map((k) => `<span class="chip ${tf === k ? "on" : ""}" data-act="ftype" data-type="${k}">${esc(TYPE_NAME_SHORT[k])} ${counts[k]}</span>`).join("") : "";
  const arr = all.filter((x) => (!tf || x.contractType === tf) && (!q || trLower([x.sozlesmeNo, x.party1Name, x.party2Name, x.tasinmazAdres, x.mahalle, x.olusturanAd].join(" ")).includes(q)));
  if (!arr.length) { el.innerHTML = `<div class="empty">${all.length ? "Aramaya uygun kayıt bulunamadı." : "Henüz kayıtlı sözleşme yok."}</div>`; return; }
  el.innerHTML = arr.map((x) => {
    const no = esc(x.sozlesmeNo);
    const tah = x.contractType === "kira" ? `<button class="btn ghost sm" data-act="tahliye" data-no="${no}">Tahliye</button>` : "";
    return `<div class="rec"><div class="recMain"><span class="typeBadge ${esc(x.contractType)}">${esc(TYPE_SHORT[x.contractType] || "SÖZ")}</span><div><div class="recTitle">${esc(recordTitle(x))}</div><div class="recMeta"><span class="mono">${no}</span> • ${esc(TYPE_NAME_SHORT[x.contractType] || "")} • ${esc(x.updatedAt || "")}${x.olusturanAd ? " • " + esc(x.olusturanAd) : ""}</div>${x.tasinmazAdres ? `<div class="recDesc">${esc(x.tasinmazAdres)}</div>` : ""}</div></div><div class="recActions"><button class="btn primary sm" data-act="open" data-no="${no}">Aç</button>${tah}<button class="btn ghost sm danger" data-act="del" data-no="${no}">Sil</button></div></div>`;
  }).join("");
}
function findDraft(no) { return getDrafts().find((x) => x.sozlesmeNo === no); }
function loadDraft(no) {
  const item = findDraft(no);
  if (!item) return;
  editingExistingNo = item.sozlesmeNo || "";
  setData(item);
  activateTab("form");
  toast(item.sozlesmeNo + " açıldı", "info", 2200);
}
async function deleteDraft(no) {
  const item = findDraft(no);
  if (!item) return;
  if (!confirm(`${item.sozlesmeNo} silinsin mi?\n\nKayıt hem bu cihazdan hem buluttan silinir.`)) return;
  setDrafts(getDrafts().filter((x) => x.sozlesmeNo !== no));
  const ok = await deleteContractFromFirebaseByNo(no);
  firebaseCache = firebaseCache.filter((x) => x.sozlesmeNo !== no);
  recalibrateSequence(item.contractType);
  renderSaved();
  if (editingExistingNo === no) editingExistingNo = "";
  if (val("sozlesmeNo") === no) setData(defaultData(item.contractType));
  toast(no + (ok ? " silindi." : " cihazdan silindi; buluttan silinemedi."), ok ? "success" : "warn");
}
function fillTahliyeSourceOptions() {
  const sel = $("tahliyeSource");
  if (!sel) return;
  const cur = sel.value;
  const arr = getDrafts().filter((x) => x.contractType === "kira");
  sel.innerHTML = '<option value="">Kayıt seç</option>' + arr.map((x) => `<option value="${esc(x.sozlesmeNo)}">${esc(x.sozlesmeNo)} — ${esc(recordTitle(x))}</option>`).join("");
  sel.value = cur;
}
function applyTahliyeData(src) {
  if (!src) return;
  const d = {
    ...defaultData("tahliye"), ...src,
    contractType: "tahliye", sozlesmeNo: nextContractNo("tahliye"), tarih: trDate(),
    tahliyeKiraBaslangic: src.kiraBaslangic || src.tahliyeKiraBaslangic || "",
    tahliyeDuzenlemeTarihi: trDate(), tahliyeYeri: src.duzenlemeYeri || OFFICE_DEFAULTS.yer, tahliyeTarihi: "",
    // Kira sözleşmesindeki imzalar tahliye taahhüdüne taşınmaz; taahhütname ayrıca imzalanmalıdır.
    sigParty1: "", sigParty2: "", sigWitness: "",
  };
  editingExistingNo = "";
  setData(d);
  activateTab("details");
  toast("Kira kaydından tahliye taahhütnamesi oluşturuldu. Tahliye tarihini girin.", "info");
}
function applyTahliyeSource() {
  const src = findDraft(val("tahliyeSource"));
  if (src) applyTahliyeData(src); else toast("Önce bir kira kaydı seçin.", "warn");
}
function exportJson() {
  const blob = new Blob([JSON.stringify(getDrafts(), null, 2)], { type: "application/json" });
  downloadBlob(blob, "emlak-sozlesme-yedek-" + new Date().toISOString().slice(0, 10) + ".json");
}
function importJsonFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const incoming = JSON.parse(r.result);
      if (!Array.isArray(incoming)) throw new Error("Liste değil");
      const map = new Map(getDrafts().map((x) => [x.sozlesmeNo, x]));
      let n = 0;
      incoming.map(migrateData).filter(isRealContractRecord).forEach((x) => {
        const old = map.get(x.sozlesmeNo);
        if (!old || parseSyncTime(x) >= parseSyncTime(old)) { map.set(x.sozlesmeNo, x); n++; }
      });
      setDrafts([...map.values()].sort((a, b) => parseSyncTime(b) - parseSyncTime(a)));
      recalibrateAllSequences();
      renderSaved();
      toast(n + " kayıt içe aktarıldı.", "success");
    } catch (err) { toast("Yedek dosyası okunamadı.", "error"); }
  };
  r.readAsText(file);
}

/* ---------- Portföy ön bilgi ---------- */
const QUICK_FIELDS = ["qbDate", "qbType", "qbOwner", "qbOwnerTel", "qbOwnerAdres", "qbAdres", "qbIlIlce", "qbMahalle", "qbNitelik", "qbM2OdaKat", "qbAdaParsel", "qbTapuDurumu", "qbBedel", "qbPazarlik", "qbAidat", "qbDepozito", "qbDemirbas", "qbKullanimTeslim", "qbImarIskan", "qbAnahtar", "qbIlanIzin", "qbNot"];
let currentQuickId = "";
function getQuickInfo() { const q = {}; for (const id of QUICK_FIELDS) q[id] = val(id); return q; }
function setQuickInfo(q) {
  q = q || {};
  for (const id of QUICK_FIELDS) setVal(id, q[id] || (id === "qbType" ? "Satılık" : ""));
  normalizeMoneyFields();
  currentQuickId = q.id || "";
  if ($("quickEditState")) { $("quickEditState").textContent = currentQuickId ? "Kayıtlı bilgi düzenleniyor" : "Yeni kayıt"; $("quickEditState").classList.toggle("editing", !!currentQuickId); }
}
function blankQuick() { return { qbDate: trDate(), qbIlIlce: OFFICE_DEFAULTS.yer, qbNitelik: "Konut / Daire" }; }
function clearQuickInfo() {
  if (QUICK_FIELDS.some((id) => id !== "qbDate" && id !== "qbType" && id !== "qbIlIlce" && id !== "qbNitelik" && val(id).trim()) && !confirm("Form temizlensin mi?")) return;
  setQuickInfo(blankQuick());
}
function quickNotes(q) {
  return [`Pazarlık payı: ${q.qbPazarlik || "-"}`, `Kullanım/teslim: ${q.qbKullanimTeslim || "-"}`, `İmar/iskân/kredi: ${q.qbImarIskan || "-"}`, `Anahtar/gösterim: ${q.qbAnahtar || "-"}`, `İlan izni: ${q.qbIlanIzin || "-"}`, `Not: ${q.qbNot || "-"}`].join("\n");
}
function appendText(oldText, add) { return oldText && !oldText.includes(add) ? oldText + "\n" + add : add; }
function applyQuickInfoToContract() {
  const q = getQuickInfo();
  if (!q.qbOwner && !q.qbAdres) { toast("Önce mal sahibi veya taşınmaz adresini girin.", "warn"); return; }
  const d = getData();
  d.party1Name = q.qbOwner || d.party1Name; d.party1Tel = q.qbOwnerTel || d.party1Tel; d.party1Adres = q.qbOwnerAdres || d.party1Adres;
  d.tasinmazAdres = q.qbAdres || d.tasinmazAdres; d.ilIlce = q.qbIlIlce || d.ilIlce; d.mahalle = q.qbMahalle || d.mahalle;
  d.nitelik = q.qbNitelik || d.nitelik; d.m2OdaKat = q.qbM2OdaKat || d.m2OdaKat; d.parselBb = q.qbAdaParsel || d.parselBb; d.tapuTakyidat = q.qbTapuDurumu || d.tapuTakyidat;
  const t = normalizeType(d.contractType);
  const notes = quickNotes(q);
  if (t === "kira") {
    d.aylikKira = q.qbBedel || d.aylikKira; d.depozito = q.qbDepozito || d.depozito; d.aidat = q.qbAidat || d.aidat; d.demirbaslar = q.qbDemirbas || d.demirbaslar;
    d.kiraOzel = appendText(d.kiraOzel, notes);
  }
  if (t === "alimSatim" || t === "satisVaadi") {
    d.alimSatimSatisBedeli = q.qbBedel || d.alimSatimSatisBedeli; d.alimSatimTapuDurumu = q.qbTapuDurumu || d.alimSatimTapuDurumu;
    d.alimSatimTeslimDurumu = q.qbKullanimTeslim || d.alimSatimTeslimDurumu;
    if (t === "alimSatim") d.alimSatimEkMaddeler = appendText(d.alimSatimEkMaddeler, notes); else d.satisVaadiEkMaddeler = appendText(d.satisVaadiEkMaddeler, notes);
  }
  if (t === "yetkiSatis" || t === "yetkiKiralama") {
    d.yetkiIlanBedeli = q.qbBedel || d.yetkiIlanBedeli;
    if (q.qbIlanIzin) d.yetkiPazarlama = appendText(d.yetkiPazarlama, "İlan izni: " + q.qbIlanIzin);
    d.yetkiEkMaddeler = appendText(d.yetkiEkMaddeler, notes);
  }
  if (t === "yerGosterme") {
    d.yerGostermeBedel = q.qbBedel || d.yerGostermeBedel;
    d.yerGostermeNot = [q.qbAnahtar, q.qbKullanimTeslim, q.qbNot].filter(Boolean).join("\n") || d.yerGostermeNot;
  }
  if (t === "ortaklik") d.ortaklikNot = appendText(d.ortaklikNot, notes);
  setData(d);
  activateTab("form");
  toast("Ön bilgiler " + (labels[t]?.[2] || "sözleşme") + " formuna aktarıldı.", "success");
}
function getQuickList() { return readJson(QUICK_KEY); }
function saveQuickInfo() {
  const q = getQuickInfo();
  if (!q.qbOwner && !q.qbAdres) { toast("Mal sahibi veya adres girin.", "warn"); return; }
  q.id = currentQuickId || "PF" + Date.now();
  q.updatedAt = nowTr();
  const arr = getQuickList().filter((x) => x.id !== q.id);
  arr.unshift(q);
  writeJson(QUICK_KEY, arr.slice(0, 200));
  setQuickInfo(q);
  renderQuickList();
  toast("Ön bilgi kaydedildi.", "success");
}
function renderQuickList() {
  const el = $("quickList");
  if (!el) return;
  const qs = trLower(val("quickSearch"));
  const all = getQuickList();
  const arr = all.filter((q) => !qs || trLower([q.qbOwner, q.qbAdres, q.qbMahalle, q.qbOwnerTel].join(" ")).includes(qs));
  if (!arr.length) { el.innerHTML = `<div class="empty">${all.length ? "Sonuç yok." : "Henüz ön bilgi kaydı yok."}</div>`; return; }
  el.innerHTML = arr.map((q) => `<div class="rec"><div class="recMain"><div><div class="recTitle">${esc(q.qbOwner || "Portföy")}</div><div class="recMeta">${esc(q.qbType || "-")} • ${esc(q.qbBedel || "-")} • ${esc(q.updatedAt || "")}</div>${q.qbAdres ? `<div class="recDesc">${esc(q.qbAdres)}</div>` : ""}</div></div><div class="recActions"><button class="btn ghost sm" data-act="qopen" data-id="${esc(q.id)}">Aç</button><button class="btn accent sm" data-act="qapply" data-id="${esc(q.id)}">Aktar</button><button class="btn ghost sm danger" data-act="qdel" data-id="${esc(q.id)}">Sil</button></div></div>`).join("");
}
function loadQuickInfo(id) { const q = getQuickList().find((x) => x.id === id); if (q) { setQuickInfo(q); window.scrollTo({ top: 0, behavior: "smooth" }); } return q; }
function deleteQuickInfo(id) {
  const q = getQuickList().find((x) => x.id === id);
  if (!q || !confirm((q.qbOwner || "Kayıt") + " ön bilgisi silinsin mi?")) return;
  writeJson(QUICK_KEY, getQuickList().filter((x) => x.id !== id));
  if (currentQuickId === id) setQuickInfo(blankQuick());
  renderQuickList();
}

/* ---------- Firebase ---------- */
const FIREBASE_SETTINGS = {
  apiKey: "AIzaSyDvuNdOrDEt4oRZb1QeyzyToDNmms2RXV0",
  authDomain: "emlak-sozlesmem.firebaseapp.com",
  projectId: "emlak-sozlesmem",
  appId: "1:1023226700306:web:a3367ca2409d7d9bcf6ecb",
  collection: "sozlesmeler",
};
const FB_VER = "12.15.0";
let fbModsPromise = null;
function fbMods() {
  if (!fbModsPromise) {
    fbModsPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`),
    ]).then(([appMod, fs, authMod]) => {
      const s = FIREBASE_SETTINGS;
      const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp({ apiKey: s.apiKey, authDomain: s.authDomain, projectId: s.projectId, appId: s.appId });
      return { app, fs, authMod, db: fs.getFirestore(app), auth: authMod.getAuth(app) };
    }).catch((e) => { fbModsPromise = null; throw e; });
  }
  return fbModsPromise;
}
async function firebaseDb() { const m = await fbMods(); return { db: m.db, fs: m.fs, collection: FIREBASE_SETTINGS.collection }; }
async function firebaseAuth() { const m = await fbMods(); return { auth: m.auth, authMod: m.authMod }; }
function setSyncState(ok, text) {
  const el = $("syncState");
  if (!el) return;
  el.classList.toggle("ok", ok === true);
  el.classList.toggle("err", ok === false);
  $("syncText").textContent = text;
}
let firebaseCache = [];
async function saveContractToFirebase(data) {
  try {
    const { db, fs, collection } = await firebaseDb();
    const payload = { ...data, updatedAtIso: data.updatedAtIso || new Date().toISOString() };
    for (const k of LEAKED_KEYS) payload[k] = fs.deleteField();
    await fs.setDoc(fs.doc(db, collection, data.sozlesmeNo), payload, { merge: true });
    setSyncState(true, "Bulut eşitlendi");
    return true;
  } catch (e) {
    console.warn("Firebase kayıt hatası", e);
    setSyncState(false, "Bulut kaydı yapılamadı");
    return false;
  }
}
async function deleteContractFromFirebaseByNo(no) {
  if (!no) return false;
  try {
    const { db, fs, collection } = await firebaseDb();
    await fs.deleteDoc(fs.doc(db, collection, no));
    return true;
  } catch (e) { console.warn("Firebase silme hatası", e); return false; }
}
function contractTypeFromNo(no) {
  no = String(no || "").toUpperCase();
  for (const t of ALL_TYPES) if (no.startsWith(codePrefix(t))) return t;
  return "";
}
function parseSyncTime(d) {
  const iso = d && d.updatedAtIso;
  if (iso) { const t = Date.parse(iso); if (!Number.isNaN(t)) return t; }
  const m = String((d && d.updatedAt) || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() : 0;
}
function isRealContractRecord(d) {
  if (!d) return false;
  const no = String(d.sozlesmeNo || d.id || "");
  if (!no || no === "baglanti_testi") return false;
  let type = normalizeType(d.contractType || "");
  if (!labels[type]) type = contractTypeFromNo(no);
  return !!(labels[type] && /[A-ZÇĞİÖŞÜ]{2,}\d{3,}/i.test(no));
}
async function fetchRemoteContracts() {
  const { db, fs, collection } = await firebaseDb();
  const snap = await fs.getDocs(fs.collection(db, collection));
  const remote = [], dirty = [];
  snap.forEach((docSnap) => {
    const raw = docSnap.data() || {};
    if (LEAKED_KEYS.some((k) => k in raw)) dirty.push(docSnap.ref);
    const data = migrateData({ ...raw, id: docSnap.id, sozlesmeNo: raw.sozlesmeNo || docSnap.id });
    if (!labels[data.contractType]) data.contractType = contractTypeFromNo(data.sozlesmeNo) || "kira";
    if (isRealContractRecord(data)) remote.push(data);
  });
  // Eski sürümün kayıtlara yazdığı giriş bilgilerini buluttan temizle.
  if (dirty.length && currentUser) {
    const del = {}; LEAKED_KEYS.forEach((k) => { del[k] = fs.deleteField(); });
    Promise.all(dirty.map((ref) => fs.updateDoc(ref, del).catch(() => {}))).then(() => console.info(dirty.length + " kayıttan eski giriş alanları temizlendi."));
  }
  return remote;
}
async function refreshFirebaseCacheSilent() {
  try { firebaseCache = await fetchRemoteContracts(); recalibrateAllSequences(); return true; }
  catch (e) { console.warn("Firebase sıra kontrolü yapılamadı", e); return false; }
}
let syncing = null;
function syncFirebaseToLocal(silent = true) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const remote = await fetchRemoteContracts();
      firebaseCache = remote;
      const map = new Map();
      getDrafts().forEach((d) => { if (isRealContractRecord(d)) map.set(d.sozlesmeNo, d); });
      remote.forEach((r) => {
        const old = map.get(r.sozlesmeNo);
        if (!old || parseSyncTime(r) >= parseSyncTime(old)) map.set(r.sozlesmeNo, old ? { ...old, ...r } : r);
      });
      const merged = [...map.values()].sort((a, b) => parseSyncTime(b) - parseSyncTime(a) || String(b.sozlesmeNo).localeCompare(String(a.sozlesmeNo)));
      setDrafts(merged);
      recalibrateAllSequences();
      renderSaved();
      const msg = remote.length ? `Bulut eşitlendi • ${remote.length} kayıt` : "Bulut bağlı • kayıt yok";
      if ($("firebaseStatus")) $("firebaseStatus").textContent = msg + " • " + new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      setSyncState(true, msg);
      if (!silent) toast(msg, "success");
      return true;
    } catch (e) {
      console.warn("Firebase senkronizasyon hatası", e);
      setSyncState(false, "Bulut bağlantısı yok");
      if ($("firebaseStatus")) $("firebaseStatus").textContent = "Bulut eşitlemesi yapılamadı; cihazdaki kayıtlar gösteriliyor.";
      if (!silent) toast("Bulut eşitlemesi yapılamadı: " + e.message, "error");
      return false;
    } finally { syncing = null; }
  })();
  return syncing;
}

/* ---------- Kasa / Cari ---------- */
function getCariRecords() { return readJson(CARI_KEY); }
function setCariRecords(arr) { writeJson(CARI_KEY, (arr || []).slice(0, 2000)); }
function cariAmount(v) { return parseInt(digitsOnly(v) || "0", 10) || 0; }
function cariNewId() { return "CARI" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(); }
const CARI_TUR = { gelir: "Gelir", gider: "Gider", alacak: "Alacak", tahsilat: "Tahsilat" };
const CARI_DURUM = { tamam: "Tamamlandı", bekliyor: "Bekliyor", iptal: "İptal" };
function cariFormData(old) {
  return {
    id: val("cariId") || cariNewId(),
    olusturanAd: old?.olusturanAd || currentUser?.ad || "",
    olusturanEmail: old?.olusturanEmail || currentUser?.email || "",
    tur: val("cariTur") || "gelir", durum: val("cariDurum") || "tamam",
    tarih: val("cariTarih") || trDate(), vade: val("cariVade"), kisi: val("cariKisi"),
    tutar: formatTL(val("cariTutar")), tutarNum: cariAmount(val("cariTutar")),
    kategori: val("cariKategori"), sozlesmeNo: val("cariSozlesmeNo").trim().toUpperCase(), aciklama: val("cariAciklama"),
    updatedAtIso: new Date().toISOString(), updatedAt: nowTr(),
  };
}
function clearCariForm() {
  ["cariId", "cariVade", "cariKisi", "cariTutar", "cariSozlesmeNo", "cariAciklama"].forEach((id) => setVal(id, ""));
  setVal("cariTarih", trDate());
  setVal("cariTur", "gelir"); setVal("cariDurum", "tamam");
  if ($("cariKategori")) $("cariKategori").selectedIndex = 0;
  if ($("cariFormTitle")) $("cariFormTitle").textContent = "Yeni Kayıt";
}
function renderCariSummary(arr) {
  let gelir = 0, gider = 0, alacak = 0;
  arr.forEach((x) => {
    const n = Number(x.tutarNum || cariAmount(x.tutar) || 0);
    if (x.durum === "iptal") return;
    if (x.tur === "gider") gider += n;
    else if (x.tur === "alacak") { if (x.durum !== "tamam") alacak += n; }
    else if (x.tur === "gelir" || x.tur === "tahsilat") gelir += n;
  });
  $("cariTotalGelir").textContent = money(gelir);
  $("cariTotalGider").textContent = money(gider);
  $("cariNet").textContent = money(gelir - gider);
  $("cariNet").classList.toggle("neg", gelir - gider < 0);
  $("cariAlacak").textContent = money(alacak);
}
function populateCariAgentFilter(all) {
  const sel = $("cariAgentFilter");
  if (!sel) return;
  const cur = sel.value, names = {};
  all.forEach((x) => { if (x.olusturanEmail) names[x.olusturanEmail] = x.olusturanAd || x.olusturanEmail; });
  sel.innerHTML = '<option value="">Tüm danışmanlar</option>' + Object.keys(names).map((k) => `<option value="${esc(k)}">${esc(names[k])}</option>`).join("");
  if (cur && names[cur]) sel.value = cur;
}
function renderCariList() {
  const all = getCariRecords();
  populateCariAgentFilter(all);
  let arr = all.slice().sort((a, b) => parseSyncTime(b) - parseSyncTime(a));
  if (currentUser?.rol === "admin" && val("cariAgentFilter")) arr = arr.filter((x) => x.olusturanEmail === val("cariAgentFilter"));
  renderCariSummary(arr);
  const tf = val("cariTypeFilter"), q = trLower(val("cariSearch"));
  arr = arr.filter((x) => (!tf || x.tur === tf) && (!q || trLower([x.kisi, x.aciklama, x.sozlesmeNo, x.kategori].join(" ")).includes(q)));
  const el = $("cariList");
  if (!el) return;
  if (!arr.length) { el.innerHTML = `<div class="empty">${all.length ? "Filtreye uygun kayıt yok." : "Henüz cari kaydı yok."}</div>`; return; }
  el.innerHTML = arr.map((x) => `<div class="rec"><div class="recMain"><div><div class="recTitle"><span class="pill ${esc(x.tur)}">${esc(CARI_TUR[x.tur] || x.tur)}</span>${esc(x.kisi || x.kategori || "Cari kayıt")}</div><div class="recMeta">${esc(x.tarih || "-")} • ${esc(x.kategori || "-")}${x.sozlesmeNo ? " • " + esc(x.sozlesmeNo) : ""} • ${esc(CARI_DURUM[x.durum] || x.durum || "-")}${x.vade ? " • Vade: " + esc(x.vade) : ""}${x.olusturanAd ? " • " + esc(x.olusturanAd) : ""}</div>${x.aciklama ? `<div class="recDesc">${esc(x.aciklama)}</div>` : ""}</div></div><div class="recActions"><span class="amount">${esc(x.tutar || money(x.tutarNum))}</span><button class="btn ghost sm" data-act="copen" data-id="${esc(x.id)}">Aç</button><button class="btn ghost sm danger" data-act="cdel" data-id="${esc(x.id)}">Sil</button></div></div>`).join("");
}
async function saveCari(ev) {
  const btn = ev?.target?.closest?.("button");
  const old = getCariRecords().find((x) => x.id === val("cariId"));
  const data = cariFormData(old);
  if (!data.kisi && !data.aciklama) { toast("Cari kişi/firma veya açıklama girin.", "warn"); return; }
  if (!data.tutarNum) { toast("Tutar girin.", "warn"); return; }
  await withBusy(btn, async () => {
    const arr = getCariRecords().filter((x) => x.id !== data.id);
    arr.unshift(data);
    setCariRecords(arr);
    renderCariList();
    const ok = await saveCariToFirebase(data);
    clearCariForm();
    toast(ok ? "Cari kayıt kaydedildi." : "Cari kayıt cihazda saklandı; buluta yazılamadı.", ok ? "success" : "warn");
  });
}
function editCari(id) {
  const d = getCariRecords().find((x) => x.id === id);
  if (!d) return;
  setVal("cariId", d.id); setVal("cariTur", d.tur || "gelir"); setVal("cariDurum", d.durum || "tamam"); setVal("cariTarih", d.tarih);
  setVal("cariVade", d.vade); setVal("cariKisi", d.kisi); setVal("cariTutar", d.tutar || money(d.tutarNum));
  setVal("cariKategori", d.kategori || "Diğer"); setVal("cariSozlesmeNo", d.sozlesmeNo); setVal("cariAciklama", d.aciklama);
  if ($("cariFormTitle")) $("cariFormTitle").textContent = "Kaydı Düzenle";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function deleteCari(id) {
  const item = getCariRecords().find((x) => x.id === id);
  if (!item || !confirm(`${item.kisi || "Cari kayıt"} (${item.tutar || ""}) silinsin mi?`)) return;
  setCariRecords(getCariRecords().filter((x) => x.id !== id));
  renderCariList();
  const ok = await deleteCariFromFirebase(id);
  if (!ok) toast("Kayıt cihazdan silindi; buluttan silinemedi.", "warn");
}
async function saveCariToFirebase(data) {
  try { const { db, fs } = await firebaseDb(); await fs.setDoc(fs.doc(db, "cariKayitlari", data.id), data, { merge: true }); return true; }
  catch (e) { console.warn("Cari Firebase kayıt hatası", e); return false; }
}
async function deleteCariFromFirebase(id) {
  try { const { db, fs } = await firebaseDb(); await fs.deleteDoc(fs.doc(db, "cariKayitlari", id)); return true; }
  catch (e) { console.warn("Cari Firebase silme hatası", e); return false; }
}
async function syncCariFirebaseToLocal(silent = true) {
  try {
    const { db, fs } = await firebaseDb();
    const snap = await fs.getDocs(fs.collection(db, "cariKayitlari"));
    const map = new Map(getCariRecords().map((x) => [x.id, x]));
    let n = 0;
    snap.forEach((d) => {
      const r = { ...d.data(), id: d.id }; n++;
      const old = map.get(r.id);
      if (!old || parseSyncTime(r) >= parseSyncTime(old)) map.set(r.id, r);
    });
    setCariRecords([...map.values()]);
    renderCariList();
    if ($("cariStatus")) $("cariStatus").textContent = `Bulut eşitlendi • ${n} kayıt`;
    if (!silent) toast("Cari kayıtlar eşitlendi.", "success");
    return true;
  } catch (e) {
    console.warn("Cari Firebase senkronizasyon hatası", e);
    if ($("cariStatus")) $("cariStatus").textContent = "Bulut eşitlemesi yapılamadı; cihazdaki kayıtlar gösteriliyor.";
    if (!silent) toast("Cari eşitleme yapılamadı: " + e.message, "error");
    return false;
  }
}

/* ---------- Yazdırma / PDF ---------- */
function asciiName(s) {
  const map = { ğ: "g", ü: "u", ş: "s", ı: "i", ö: "o", ç: "c", Ğ: "G", Ü: "U", Ş: "S", İ: "I", Ö: "O", Ç: "C" };
  return String(s).replace(/[ğüşıöçĞÜŞİÖÇ]/g, (c) => map[c]).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function pdfFilename() {
  const title = asciiName(labels[val("contractType")]?.[2] || "Sozlesme") || "sozlesme";
  const who = asciiName(val("party2Name") || val("party1Name")).slice(0, 30);
  return [title, val("sozlesmeNo") || Date.now(), who].filter(Boolean).join("-") + ".pdf";
}
function printContract() {
  render();
  togglePreview(false);
  if (NATIVE) { setTimeout(() => NATIVE.print(labels[val("contractType")]?.[2] || "Sözleşme"), 50); return; }
  setTimeout(() => window.print(), 50);
}
function loadScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-loader-id="${id}"]`);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error(id + " yüklenemedi")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.dataset.loaderId = id;
    s.onload = () => { s.dataset.loaded = "1"; resolve(); };
    s.onerror = () => { s.remove(); reject(new Error(id + " yüklenemedi (internet bağlantısını kontrol edin)")); };
    document.head.appendChild(s);
  });
}
async function ensurePdfLibs() {
  if (!window.html2canvas) await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "html2canvas");
  if (!(window.jspdf && window.jspdf.jsPDF)) await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "jspdf");
}
// Her nüsha ayrı sayfadan başlar; uzun nüshalar satır/madde sınırlarından bölünür (yazı ortadan kesilmez).
async function buildPdfBlob() {
  render();
  await ensurePdfLibs();
  const CSS_W = 720, MARGIN_MM = 10, PAGE_W = 210, PAGE_H = 297;
  const contentWmm = PAGE_W - 2 * MARGIN_MM, contentHmm = PAGE_H - 2 * MARGIN_MM;
  const pxPerMm = CSS_W / contentWmm;
  const pageCss = contentHmm * pxPerMm;
  const wrap = document.createElement("div");
  wrap.className = "pdfRender";
  wrap.style.cssText = `position:fixed;left:-12000px;top:0;width:${CSS_W}px;background:#fff;z-index:-1`;
  wrap.innerHTML = `<article class="doc" style="width:${CSS_W}px">${$("doc").innerHTML}</article>`;
  document.body.appendChild(wrap);
  try {
    await Promise.all([...wrap.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    let first = true;
    for (const el of wrap.querySelectorAll(".copy")) {
      const top = el.getBoundingClientRect().top;
      const totalH = el.getBoundingClientRect().height;
      const cuts = [...new Set([...el.querySelectorAll("tr,.cl,.gap,h1,h2,.articleTitle,.initials,.legal,.signs,.officeHead,.meta,table,.clauseList")].map((n) => Math.round(n.getBoundingClientRect().bottom - top)))].sort((a, b) => a - b);
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 1000, logging: false });
      const k = canvas.width / el.getBoundingClientRect().width;
      let start = 0;
      while (start < totalH - 2) {
        let end = start + pageCss;
        if (end >= totalH) end = totalH;
        else {
          const best = cuts.filter((c) => c > start + pageCss * 0.5 && c <= end).pop();
          if (best) end = best;
        }
        const sliceH = Math.ceil((end - start) * k);
        const pc = document.createElement("canvas");
        pc.width = canvas.width; pc.height = sliceH;
        const ctx = pc.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pc.width, pc.height);
        ctx.drawImage(canvas, 0, Math.floor(start * k), canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(pc.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN_MM, MARGIN_MM, contentWmm, (end - start) / pxPerMm, undefined, "FAST");
        start = end;
      }
    }
    return pdf.output("blob");
  } finally { wrap.remove(); }
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function downloadBlob(blob, name) {
  if (NATIVE) { NATIVE.saveFile(await blobToBase64(blob), name, blob.type || "application/octet-stream"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function downloadPdf(ev) {
  const btn = ev?.target?.closest?.("button");
  await withBusy(btn, async () => {
    try { toast("PDF hazırlanıyor…", "info", 1800); await downloadBlob(await buildPdfBlob(), pdfFilename()); }
    catch (e) { toast("PDF oluşturulamadı: " + e.message + ". Yazdır > PDF olarak kaydet seçeneğini kullanabilirsiniz.", "error", 6000); }
  });
}
function isShareCancelError(e) {
  const s = (String(e?.name || "") + " " + String(e?.message || "")).toLowerCase();
  return s.includes("abort") || s.includes("cancel") || s.includes("iptal");
}
async function sharePdfSystem(ev) {
  const btn = ev?.target?.closest?.("button");
  await withBusy(btn, async () => {
    let blob;
    try { toast("PDF hazırlanıyor…", "info", 1800); blob = await buildPdfBlob(); }
    catch (e) { toast("PDF oluşturulamadı: " + e.message, "error", 6000); return; }
    const title = labels[val("contractType")]?.[2] || "Sözleşme";
    if (NATIVE) { NATIVE.shareFile(await blobToBase64(blob), pdfFilename(), "application/pdf", `${title} - Sözleşme No: ${val("sozlesmeNo") || "-"}`); return; }
    const file = new File([blob], pdfFilename(), { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text: `${title} - Sözleşme No: ${val("sozlesmeNo") || "-"}` }); return; }
      catch (e) { if (isShareCancelError(e)) return; console.warn("Paylaşım başarısız", e); }
    }
    await downloadBlob(blob, pdfFilename());
    toast("Bu cihaz doğrudan paylaşımı desteklemiyor; PDF indirildi. WhatsApp veya e-postaya dosya olarak ekleyebilirsiniz.", "info", 6000);
  });
}

/* ---------- İmza ---------- */
function updateSignatureLabels(t) {
  const info = labels[t] || labels.kira;
  $("sigTitleParty1").textContent = info[0] + " imzası";
  $("sigTitleParty2").textContent = info[1] + " imzası";
  const three = ["kira", "tahliye", "alimSatim", "satisVaadi"].includes(t);
  $("sigCardWitness").classList.toggle("hide", !three);
}
const pads = [
  { canvas: "sigCanvasParty1", input: "sigParty1" },
  { canvas: "sigCanvasParty2", input: "sigParty2" },
  { canvas: "sigCanvasWitness", input: "sigWitness" },
];
function resizeOneSignaturePad(item) {
  const c = $(item.canvas);
  if (!c) return;
  const rect = c.getBoundingClientRect();
  if (!rect.width) return; // görünmüyorken boyutlandırma yapma
  const ctx = c.getContext("2d");
  const w = Math.floor(rect.width), h = 160, ratio = window.devicePixelRatio || 1;
  c.width = w * ratio; c.height = h * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b3a8c";
  ctx.clearRect(0, 0, w, h);
  const src = val(item.input);
  if (src) {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(w / img.width, h / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };
    img.src = src;
  }
}
function loadSignaturesToCanvas() { pads.forEach(resizeOneSignaturePad); }
function initSignaturePads() {
  pads.forEach((item) => {
    const c = $(item.canvas);
    if (!c) return;
    const ctx = c.getContext("2d");
    let drawing = false, last = null, moved = false;
    const point = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      drawing = true; moved = false;
      c.setPointerCapture?.(e.pointerId);
      last = point(e);
      ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    });
    c.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = point(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; moved = true;
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      try { $(item.input).value = c.toDataURL("image/png"); render(); } catch (e) {}
    };
    ["pointerup", "pointercancel"].forEach((ev) => c.addEventListener(ev, end));
  });
  let tm;
  window.addEventListener("resize", () => { clearTimeout(tm); tm = setTimeout(loadSignaturesToCanvas, 250); });
}
function clearSignature(inputId) {
  setVal(inputId, "");
  const item = pads.find((x) => x.input === inputId);
  if (item) resizeOneSignaturePad(item);
  render();
}
function clearAllSignatures() {
  if (!confirm("Tüm imzalar temizlensin mi?")) return;
  ["sigParty1", "sigParty2", "sigWitness"].forEach((id) => setVal(id, ""));
  loadSignaturesToCanvas();
  render();
}

function fillSampleRent() {
  if (formHasUserData() && !confirm("Formdaki bilgiler örnek verilerle değiştirilsin mi?")) return;
  editingExistingNo = "";
  setData({
    ...defaultData("kira"),
    party1Name: "Mülk Sahibi Ad Soyad", party2Name: "Kiracı Ad Soyad",
    tasinmazAdres: "Düzce / Cumayeri ... Mah. ... Sok. No: ... Daire: ...", mahalle: "Merkez",
    aylikKira: "25.000 TL", depozito: "25.000 TL", kiraBaslangic: "01.07.2026", kiraBitis: "1 yıl / 01.07.2027",
    demirbaslar: "Kombi, duşakabin, ankastre set, dolaplar, sayaçlar sağlam teslim edildi.",
  });
}

/* ---------- Giriş / kullanıcılar ---------- */
let currentUser = null;
async function ensureUserProfile(user) {
  const { db, fs } = await firebaseDb();
  const ref = fs.doc(db, "kullanicilar", user.uid);
  const snap = await fs.getDoc(ref);
  if (snap.exists()) return { id: user.uid, ...snap.data() };
  let isFirstAdmin = false;
  try {
    const qs = await fs.getDocs(fs.query(fs.collection(db, "kullanicilar"), fs.where("rol", "==", "admin"), fs.limit(1)));
    isFirstAdmin = qs.empty;
  } catch (e) { console.warn("Yönetici kontrolü yapılamadı", e); }
  const profile = { ad: (user.email || "").split("@")[0], email: user.email, rol: isFirstAdmin ? "admin" : "danisman", aktif: true, createdAt: new Date().toISOString() };
  await fs.setDoc(ref, profile);
  return { id: user.uid, ...profile };
}
function authErrorMessage(e) {
  const map = {
    "auth/invalid-credential": "E-posta veya şifre hatalı.", "auth/wrong-password": "E-posta veya şifre hatalı.",
    "auth/user-not-found": "Bu e-posta ile kayıtlı kullanıcı bulunamadı.", "auth/too-many-requests": "Çok fazla deneme yapıldı, lütfen biraz sonra tekrar deneyin.",
    "auth/invalid-email": "Geçersiz e-posta adresi.", "auth/user-disabled": "Bu hesap devre dışı bırakılmış.",
    "auth/network-request-failed": "İnternet bağlantısı kurulamadı.",
  };
  return map[e?.code] || "Giriş başarısız: " + (e?.message || e?.code || "bilinmeyen hata");
}
function showAuthError(msg) { const b = $("authError"); if (!b) return; b.textContent = msg || ""; b.classList.toggle("hide", !msg); }
async function doLogin(ev) {
  ev?.preventDefault?.();
  const email = val("authEmail").trim(), pass = val("authPass");
  showAuthError("");
  if (!email || !pass) { showAuthError("E-posta ve şifre gerekli."); return; }
  await withBusy($("authSubmit"), async () => {
    try { const { auth, authMod } = await firebaseAuth(); await authMod.signInWithEmailAndPassword(auth, email, pass); }
    catch (e) { showAuthError(authErrorMessage(e)); }
    finally { setVal("authPass", ""); }
  });
}
async function doLogout() {
  try { const { auth, authMod } = await firebaseAuth(); await authMod.signOut(auth); } catch (e) { console.warn("Çıkış yapılamadı", e); }
}
function applyRoleVisibility() {
  const isAdmin = currentUser?.rol === "admin";
  document.querySelectorAll(".adminOnly").forEach((el) => el.classList.toggle("hide", !isAdmin));
  if (!isAdmin && document.body.dataset.view === "admin") activateTab("quick");
}
async function initAuthGate() {
  try {
    const { auth, authMod } = await firebaseAuth();
    authMod.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        currentUser = null;
        applyRoleVisibility();
        $("userBar").classList.add("hide"); $("mobileLogout").classList.add("hide");
        $("authOverlay").classList.remove("hide");
        return;
      }
      try {
        const profile = await ensureUserProfile(user);
        if (profile.aktif === false) { showAuthError("Hesabınız pasif durumda. Yöneticinizle iletişime geçin."); await doLogout(); return; }
        currentUser = { uid: user.uid, email: user.email, ad: profile.ad || user.email, rol: profile.rol || "danisman" };
        showAuthError("");
        $("authOverlay").classList.add("hide");
        $("userBar").classList.remove("hide"); $("mobileLogout").classList.remove("hide");
        $("userBarName").textContent = currentUser.ad;
        $("userBarRole").textContent = currentUser.rol === "admin" ? "Yönetici" : "Danışman";
        $("userAvatar").textContent = (currentUser.ad || "?").trim().charAt(0).toLocaleUpperCase("tr-TR");
        applyRoleVisibility();
        syncFirebaseToLocal(true).then(() => { if (!editingExistingNo) { setVal("sozlesmeNo", nextContractNo(val("contractType"))); render(); } });
        syncCariFirebaseToLocal(true);
      } catch (e) {
        console.warn("Profil yüklenemedi", e);
        showAuthError("Profil bilgisi alınamadı: " + (e.message || ""));
      }
    });
  } catch (e) {
    console.warn("Giriş sistemi başlatılamadı", e);
    showAuthError("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.");
  }
}
async function adminCreateUser(ev) {
  if (currentUser?.rol !== "admin") { toast("Bu işlem için yönetici yetkisi gerekir.", "error"); return; }
  const ad = val("newUserAd").trim(), email = val("newUserEmail").trim(), pass = val("newUserPass"), rol = val("newUserRol") || "danisman";
  if (!ad || !email || !pass) { toast("Ad, e-posta ve şifre zorunludur.", "warn"); return; }
  if (pass.length < 6) { toast("Şifre en az 6 karakter olmalı.", "warn"); return; }
  await withBusy(ev?.target?.closest?.("button"), async () => {
    try {
      // REST ile oluşturulur; böylece yöneticinin kendi oturumu kapanmaz.
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_SETTINGS.apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pass, returnSecureToken: false }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Kullanıcı oluşturulamadı");
      const { db, fs } = await firebaseDb();
      await fs.setDoc(fs.doc(db, "kullanicilar", data.localId), { ad, email, rol, aktif: true, createdAt: new Date().toISOString(), createdBy: currentUser.email });
      $("adminUserStatus").textContent = `${ad} için hesap oluşturuldu. Giriş bilgilerini danışmana iletin.`;
      ["newUserAd", "newUserEmail", "newUserPass"].forEach((id) => setVal(id, ""));
      toast("Kullanıcı oluşturuldu.", "success");
      loadUsersList();
    } catch (e) {
      let msg = e.message || "Bilinmeyen hata";
      if (msg.includes("EMAIL_EXISTS")) msg = "Bu e-posta zaten kayıtlı.";
      if (msg.includes("WEAK_PASSWORD")) msg = "Şifre en az 6 karakter olmalı.";
      if (msg.includes("INVALID_EMAIL")) msg = "Geçersiz e-posta adresi.";
      toast("Kullanıcı oluşturulamadı: " + msg, "error", 6000);
    }
  });
}
async function loadUsersList() {
  if (currentUser?.rol !== "admin") return;
  try {
    const { db, fs } = await firebaseDb();
    const snap = await fs.getDocs(fs.collection(db, "kullanicilar"));
    const arr = [];
    snap.forEach((x) => arr.push({ id: x.id, ...x.data() }));
    arr.sort((a, b) => (a.ad || "").localeCompare(b.ad || "", "tr"));
    $("userList").innerHTML = arr.length ? arr.map((u) => {
      const self = u.id === currentUser.uid;
      const btn = self ? '<span class="muted small">Siz</span>' : `<button class="btn sm ${u.aktif === false ? "ok" : "ghost danger"}" data-act="utoggle" data-id="${esc(u.id)}" data-active="${u.aktif === false ? "1" : "0"}">${u.aktif === false ? "Aktif Et" : "Pasif Yap"}</button>`;
      return `<div class="rec"><div class="recMain"><div class="avatar">${esc((u.ad || u.email || "?").charAt(0).toLocaleUpperCase("tr-TR"))}</div><div><div class="recTitle">${esc(u.ad || u.email || "-")}</div><div class="recMeta"><span class="pill role ${u.rol === "admin" ? "admin" : ""}">${u.rol === "admin" ? "Yönetici" : "Danışman"}</span>${u.aktif === false ? '<span class="pill off">Pasif</span>' : ""}${esc(u.email || "")}</div></div></div><div class="recActions">${btn}</div></div>`;
    }).join("") : '<div class="empty">Henüz kullanıcı yok.</div>';
  } catch (e) { console.warn("Kullanıcı listesi alınamadı", e); $("userList").innerHTML = '<div class="empty">Kullanıcı listesi alınamadı.</div>'; }
}
async function toggleUserActive(uid, makeActive) {
  try {
    const { db, fs } = await firebaseDb();
    await fs.updateDoc(fs.doc(db, "kullanicilar", uid), { aktif: makeActive });
    toast(makeActive ? "Kullanıcı aktif edildi." : "Kullanıcı pasif yapıldı.", "success");
    loadUsersList();
  } catch (e) { toast("Güncellenemedi: " + e.message, "error"); }
}

/* ---------- Olaylar ---------- */
function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.nav)));
  document.querySelectorAll(".stepTab").forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.tab)));
  document.addEventListener("input", (e) => {
    const id = e.target.id;
    if (id === "archiveSearch") renderSaved();
    else if (id === "quickSearch") renderQuickList();
    else if (id === "cariSearch") renderCariList();
    else if (CONTRACT_FIELD_SET.has(id) && id !== "contractType") scheduleRender();
  });
  document.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "contractType") {
      const nt = e.target.value;
      if (formHasUserData() && !confirm("Belge türü değiştiğinde yeni boş form açılır. Mevcut bilgiler temizlensin mi?\n\n(Bilgileri korumak için önce Kaydet'e basın.)")) { e.target.value = lastType; return; }
      setContract(nt);
    } else if (id === "archiveType") renderSaved();
    else if (id === "cariTypeFilter" || id === "cariAgentFilter") renderCariList();
    else if (id === "importFile") { const f = e.target.files[0]; if (f) importJsonFile(f); e.target.value = ""; }
    else if (CONTRACT_FIELD_SET.has(id)) scheduleRender();
  });
  document.addEventListener("click", (e) => {
    const fee = e.target.closest("[data-fee-target]");
    if (fee) { setVal(fee.dataset.feeTarget, formatTL(fee.dataset.feeValue) + " + KDV"); render(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const { act, no, id } = b.dataset;
    if (act === "open") loadDraft(no);
    else if (act === "del") deleteDraft(no);
    else if (act === "tahliye") applyTahliyeData(findDraft(no));
    else if (act === "ftype") { setVal("archiveType", b.dataset.type); renderSaved(); }
    else if (act === "qopen") loadQuickInfo(id);
    else if (act === "qapply") { if (loadQuickInfo(id)) applyQuickInfoToContract(); }
    else if (act === "qdel") deleteQuickInfo(id);
    else if (act === "copen") editCari(id);
    else if (act === "cdel") deleteCari(id);
    else if (act === "utoggle") toggleUserActive(id, b.dataset.active === "1");
  });
  $("authForm").addEventListener("submit", doLogin);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && document.body.dataset.view === "contract") { e.preventDefault(); saveDraft(); }
    if (e.key === "Escape") togglePreview(false);
  });
  window.addEventListener("beforeprint", render);
}

// Android geri tuşu: true dönerse uygulama içinde işlendi, false ise uygulama kapanır.
window.appBack = function () {
  if (document.body.classList.contains("previewOpen")) { togglePreview(false); return true; }
  const view = document.body.dataset.view;
  if (view === "contract" && document.body.dataset.step !== "form") { activateTab(document.body.dataset.step === "sign" ? "details" : "form"); return true; }
  if (view && view !== "quick") { activateTab("quick"); return true; }
  return false;
};

function registerServiceWorker() {
  if (!NATIVE && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker kaydedilemedi", e));
  }
}

(function init() {
  try { localStorage.removeItem("emlakFirebaseSettings"); localStorage.removeItem("emlakSozlesmeSonForm"); } catch (e) {}
  // Eski sürümün cihazda bıraktığı giriş bilgilerini temizle.
  try { const d = readJson(DRAFTS_KEY); if (d.some((x) => x && LEAKED_KEYS.some((k) => k in x))) setDrafts(d.map(migrateData)); } catch (e) {}
  initContractFields();
  bindEvents();
  initSignaturePads();
  setupMoneyFields();
  setData(defaultData("kira"));
  setQuickInfo(blankQuick());
  clearCariForm();
  renderSaved();
  renderQuickList();
  activateTab("quick");
  initAuthGate();
  registerServiceWorker();
})();
