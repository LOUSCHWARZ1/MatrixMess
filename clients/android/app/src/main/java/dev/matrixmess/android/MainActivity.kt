package dev.matrixmess.android

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    companion object {
        private const val ASSET_HOST = "appassets.androidx.dev"
        private const val START_URL = "https://$ASSET_HOST/assets/web/index.html"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true // localStorage persistence for the Matrix session
            // Assets werden ausschliesslich ueber den WebViewAssetLoader (https-Pseudo-
            // Origin) ausgeliefert - direkter Datei-/Content-Zugriff bleibt gesperrt.
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, true)
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                // Only serve requests for the virtual asset host from the APK.
                // All other hosts (e.g. the Matrix homeserver API) load normally.
                if (request.url.host != ASSET_HOST) {
                    return null
                }
                val response = assetLoader.shouldInterceptRequest(request.url)
                // Android kennt keinen MIME-Type fuer .wasm - ohne korrekten
                // Content-Type schlaegt WebAssembly.instantiateStreaming fehl.
                if (response != null && request.url.path?.endsWith(".wasm") == true) {
                    response.mimeType = "application/wasm"
                }
                if (response != null && request.url.path?.endsWith(".mjs") == true) {
                    response.mimeType = "text/javascript"
                }
                return response
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                // Keep navigation within the embedded web app; open everything
                // else in the external browser.
                if (url.host == ASSET_HOST) {
                    return false
                }
                // Only hand plain web links to the system. Blocks intent://,
                // custom-scheme and file:// injection into ACTION_VIEW.
                if (url.scheme != "http" && url.scheme != "https") {
                    return true
                }
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (e: Exception) {
                    // No app available to handle the URL; swallow the click.
                    true
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
