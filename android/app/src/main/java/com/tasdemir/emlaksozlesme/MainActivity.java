package com.tasdemir.emlaksozlesme;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    // Uygulama dosyaları APK içinden, sitenin kendi adresiyle sunulur. Böylece Firebase API anahtarındaki
    // "yalnızca bu siteden" kısıtlaması APK'da da sağlanır; internet olmasa da uygulama açılır.
    private static final String APP_HOST = "ufukcicek81.github.io";
    private static final String APP_PATH = "/emlaksozlesme/";
    private static final String START_URL = "https://" + APP_HOST + APP_PATH + "index.html";
    private static final int FILE_CHOOSER_REQUEST = 41;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);

        final WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler(APP_PATH, path -> assets.handle("www/" + path))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equals(uri.getHost())) return false;
                // Dış bağlantılar (tel:, mailto:, web) sistem uygulamalarında açılır.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    try {
                        startActivityForResult(i, FILE_CHOOSER_REQUEST);
                    } catch (Exception e2) {
                        fileCallback = null;
                        return false;
                    }
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Önce web uygulamasına sor (önizleme açıksa kapat, alt ekrandan ana ekrana dön).
        webView.evaluateJavascript("(window.appBack && window.appBack()) ? '1' : '0'", value -> {
            if (!"\"1\"".equals(value)) finish();
        });
    }

    private File writeShared(String base64, String name) throws Exception {
        File dir = new File(getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Klasör oluşturulamadı");
        File f = new File(dir, safeName(name));
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(Base64.decode(base64, Base64.DEFAULT));
        }
        return f;
    }

    private static String safeName(String name) {
        String n = name == null ? "dosya" : name.replaceAll("[^A-Za-z0-9._-]", "-");
        return n.isEmpty() ? "dosya" : n;
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    /** Web uygulamasının çağırdığı yerel işlevler. */
    private class Bridge {
        @JavascriptInterface
        public void shareFile(String base64, String name, String mime, String title) {
            try {
                File f = writeShared(base64, name);
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_SUBJECT, title);
                send.putExtra(Intent.EXTRA_TEXT, title);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, "Paylaş");
                runOnUiThread(() -> startActivity(chooser));
            } catch (Exception e) {
                toast("Paylaşılamadı: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                // Eski Android: indirme klasörü izni yerine paylaşım ekranından kaydedilir.
                shareFile(base64, name, mime, name);
                return;
            }
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safeName(name));
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("Dosya oluşturulamadı");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new Exception("Dosya açılamadı");
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                toast("İndirilenler klasörüne kaydedildi: " + safeName(name));
            } catch (Exception e) {
                toast("Kaydedilemedi: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void print(String jobName) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                String job = jobName == null || jobName.isEmpty() ? "Sözleşme" : jobName;
                pm.print(job, webView.createPrintDocumentAdapter(job),
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }
    }
}
