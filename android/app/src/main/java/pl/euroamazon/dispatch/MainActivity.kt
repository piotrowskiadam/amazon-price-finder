package pl.euroamazon.dispatch

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import pl.euroamazon.dispatch.updates.AndroidApkVerifier
import pl.euroamazon.dispatch.updates.ApkDownloadRepository
import pl.euroamazon.dispatch.updates.AppRelease
import pl.euroamazon.dispatch.updates.AppVersion
import pl.euroamazon.dispatch.updates.DownloadPhase
import pl.euroamazon.dispatch.updates.GitHubApkTransport
import pl.euroamazon.dispatch.updates.GitHubReleaseSource
import pl.euroamazon.dispatch.updates.UpdateFileProvider
import pl.euroamazon.dispatch.updates.UpdateRepository
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.net.CookieHandler
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.zip.GZIPInputStream

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private val mainHandler = Handler(Looper.getMainLooper())
    private val httpPool = Executors.newFixedThreadPool(4)
    private val updatePool = Executors.newSingleThreadExecutor()
    private val downloadPool = Executors.newSingleThreadExecutor()

    private lateinit var installedVersion: AppVersion
    private lateinit var updates: UpdateRepository
    private lateinit var apkDownloads: ApkDownloadRepository

    private var pageLoaded = false
    private var pendingSharedText: String? = null
    @Volatile
    private var openingInstaller = false

    companion object {
        private const val APP_HOST = "appassets.euroamazon.local"
        private const val APP_START_URL = "https://appassets.euroamazon.local/index.html"
        private const val PREFS_NAME = "euroamazon_updates_prefs"
        private const val KEY_GITHUB_TOKEN = "github_token"
        private const val REQ_INSTALL_PERMISSION = 4102

        private val USER_AGENTS = arrayOf(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.parseColor("#141923")
        window.navigationBarColor = Color.parseColor("#141923")

        if (CookieHandler.getDefault() == null) {
            CookieHandler.setDefault(CookieManager(null, CookiePolicy.ACCEPT_ALL))
        }

        val verName = runCatching {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0.0"
        }.getOrDefault("1.0.0")
        installedVersion = runCatching { AppVersion.parse(verName) }.getOrElse { AppVersion.parse("1.0.0") }

        val verifier = AndroidApkVerifier(applicationContext)
        updates = UpdateRepository(
            directory = File(filesDir, "updates"),
            source = GitHubReleaseSource(),
            installed = installedVersion,
            onStateChanged = { pushUpdateStateToWebView() }
        )
        apkDownloads = ApkDownloadRepository(
            directory = File(filesDir, "updates/apk"),
            installed = installedVersion,
            transport = GitHubApkTransport(),
            verifyIdentity = verifier::verify,
            onStateChanged = { pushUpdateStateToWebView() }
        )

        extractSharedIntent(intent)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#EEF2F6"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                setSupportMultipleWindows(true)
                javaScriptCanOpenWindowsAutomatically = true
            }

            addJavascriptInterface(NativeHttpBridge(), "EuroAmazonAndroid")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val uri = request?.url ?: return null
                    if (uri.host.equals(APP_HOST, ignoreCase = true)) {
                        val rawPath = (uri.path ?: "/index.html").trimStart('/')
                        val assetName = if (rawPath.isEmpty()) "index.html" else rawPath
                        val mimeType = when {
                            assetName.endsWith(".html") -> "text/html"
                            assetName.endsWith(".css") -> "text/css"
                            assetName.endsWith(".js") -> "application/javascript"
                            assetName.endsWith(".svg") -> "image/svg+xml"
                            else -> "application/octet-stream"
                        }
                        return try {
                            val stream = assets.open(assetName)
                            WebResourceResponse(
                                mimeType,
                                "UTF-8",
                                200,
                                "OK",
                                mapOf("Access-Control-Allow-Origin" to "*"),
                                stream
                            )
                        } catch (_: Exception) {
                            WebResourceResponse(
                                "text/plain",
                                "UTF-8",
                                404,
                                "Not Found",
                                emptyMap(),
                                ByteArrayInputStream("Not found".toByteArray())
                            )
                        }
                    }
                    return super.shouldInterceptRequest(view, request)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return false
                    if (uri.host.equals(APP_HOST, ignoreCase = true)) {
                        return false
                    }
                    openExternalUrl(uri)
                    return true
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    pageLoaded = true
                    flushPendingSharedText()
                    pushUpdateStateToWebView()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: Message?
                ): Boolean {
                    val hitTestResult = view?.hitTestResult
                    val data = hitTestResult?.extra
                    if (!data.isNullOrBlank()) {
                        openExternalUrl(Uri.parse(data))
                        return false
                    }

                    val tempWebView = WebView(this@MainActivity)
                    tempWebView.webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            v: WebView?,
                            req: WebResourceRequest?
                        ): Boolean {
                            req?.url?.let { openExternalUrl(it) }
                            tempWebView.destroy()
                            return true
                        }
                    }
                    val transport = resultMsg?.obj as? WebView.WebViewTransport
                    transport?.webView = tempWebView
                    resultMsg?.sendToTarget()
                    return true
                }
            }
        }

        setContentView(webView)
        webView.loadUrl(APP_START_URL)

        updatePool.execute {
            updates.load()
            apkDownloads.load()
            updates.check(force = false)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::updates.isInitialized) {
            updatePool.execute {
                updates.check(force = false)
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractSharedIntent(intent)
        flushPendingSharedText()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_INSTALL_PERMISSION) {
            if (packageManager.canRequestPackageInstalls()) {
                triggerInstallUpdate()
            } else {
                apkDownloads.installationError(
                    "Aby zainstalować aktualizację, zezwól EuroAmazon Dispatch na instalowanie aplikacji w ustawieniach Androida."
                )
            }
        }
    }

    private fun triggerInstallUpdate() {
        if (openingInstaller) return
        openingInstaller = true
        downloadPool.execute {
            try {
                apkDownloads.installationError(null)
                val apk = apkDownloads.preparedApk() ?: return@execute
                mainHandler.post {
                    try {
                        if (!packageManager.canRequestPackageInstalls()) {
                            @Suppress("DEPRECATION")
                            startActivityForResult(
                                Intent(
                                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:$packageName")
                                ),
                                REQ_INSTALL_PERMISSION
                            )
                        } else {
                            val uri = UpdateFileProvider.uriForApk(this@MainActivity)
                            val installIntent = Intent(Intent.ACTION_VIEW)
                                .setDataAndType(uri, "application/vnd.android.package-archive")
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                .apply {
                                    clipData = ClipData.newRawUri("Aktualizacja EuroAmazon Dispatch", uri)
                                }
                            startActivity(installIntent)
                        }
                    } catch (_: ActivityNotFoundException) {
                        apkDownloads.installationError("Nie udało się otworzyć instalatora Androida. Spróbuj ponownie.")
                    } catch (_: SecurityException) {
                        apkDownloads.installationError("Android nie zezwolił na instalację. Sprawdź zgodę i spróbuj ponownie.")
                    }
                }
            } finally {
                openingInstaller = false
            }
        }
    }

    private fun buildUpdateSnapshotJson(): String {
        val up = updates.state
        val dl = apkDownloads.state
        val activeRelease: AppRelease? = dl.release?.takeIf {
            dl.busy || dl.phase == DownloadPhase.Ready
        } ?: up.available ?: dl.release

        return JSONObject().apply {
            put("installedVersion", installedVersion.toString())
            put("repository", AppRelease.Repository)
            put("repositoryUrl", AppRelease.RepositoryUrl)
            put("checking", up.checking)
            put("checkedAt", up.checkedAt)
            put("checkError", up.error ?: JSONObject.NULL)
            put("availableVersion", up.available?.version?.toString() ?: JSONObject.NULL)
            put("releaseVersion", activeRelease?.version?.toString() ?: JSONObject.NULL)
            put("releaseSize", activeRelease?.size ?: 0L)
            put("releasePageUrl", activeRelease?.pageUrl ?: JSONObject.NULL)
            put("downloadPhase", dl.phase.name)
            put("downloadedBytes", dl.bytes)
            put("downloadError", dl.error ?: JSONObject.NULL)
        }.toString()
    }

    private fun pushUpdateStateToWebView() {
        mainHandler.post {
            if (!isDestroyed && pageLoaded && ::webView.isInitialized) {
                val json = buildUpdateSnapshotJson()
                webView.evaluateJavascript(
                    "window.__onAndroidUpdateState && window.__onAndroidUpdateState($json);",
                    null
                )
            }
        }
    }

    private fun extractSharedIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val shared = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!shared.isNullOrBlank()) {
                pendingSharedText = shared.trim()
            }
        }
    }

    private fun flushPendingSharedText() {
        val text = pendingSharedText ?: return
        if (!pageLoaded) return
        pendingSharedText = null
        val escaped = JSONObject.quote(text)
        mainHandler.post {
            webView.evaluateJavascript(
                "if (window.__handleExternalSharedInput) window.__handleExternalSharedInput($escaped);",
                null
            )
        }
    }

    private fun openExternalUrl(uri: Uri) {
        try {
            val browserIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
            }
            startActivity(browserIntent)
        } catch (_: Exception) {
            // Ignore if no browser installed
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        httpPool.shutdownNow()
        updatePool.shutdownNow()
        downloadPool.shutdownNow()
        super.onDestroy()
    }

    inner class NativeHttpBridge {
        @JavascriptInterface
        fun requestUpdateSnapshot() {
            pushUpdateStateToWebView()
        }

        @JavascriptInterface
        fun checkUpdates() {
            updatePool.execute {
                updates.check(force = true)
            }
        }

        @JavascriptInterface
        fun downloadUpdate() {
            downloadPool.execute {
                val target = updates.state.available ?: apkDownloads.state.release ?: return@execute
                apkDownloads.download(target)
            }
        }

        @JavascriptInterface
        fun cancelUpdateDownload() {
            apkDownloads.cancel()
        }

        @JavascriptInterface
        fun installUpdate() {
            triggerInstallUpdate()
        }

        @JavascriptInterface
        fun startHttpFetch(
            reqId: Int,
            url: String,
            domain: String,
            acceptLanguage: String,
            cookieHeader: String
        ) {
            httpPool.execute {
                val resultJson = performNativeGet(url, domain, acceptLanguage, cookieHeader, reqId)
                mainHandler.post {
                    if (!isDestroyed && ::webView.isInitialized) {
                        webView.evaluateJavascript(
                            "window.__resolveAndroidFetch && window.__resolveAndroidFetch($reqId, $resultJson);",
                            null
                        )
                    }
                }
            }
        }

        private fun performNativeGet(
            rawUrl: String,
            domain: String,
            acceptLanguage: String,
            cookieHeader: String,
            reqId: Int
        ): String {
            var connection: HttpURLConnection? = null
            return try {
                val url = URL(rawUrl)
                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    instanceFollowRedirects = true
                    connectTimeout = 9000
                    readTimeout = 9000
                    setRequestProperty(
                        "User-Agent",
                        USER_AGENTS[reqId % USER_AGENTS.size]
                    )
                    setRequestProperty(
                        "Accept",
                        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7"
                    )
                    setRequestProperty(
                        "Accept-Language",
                        acceptLanguage.ifBlank { "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7" }
                    )
                    setRequestProperty("Accept-Encoding", "gzip")
                    setRequestProperty("Sec-Fetch-Dest", "document")
                    setRequestProperty("Sec-Fetch-Mode", "navigate")
                    setRequestProperty("Sec-Fetch-Site", "none")
                    setRequestProperty("Upgrade-Insecure-Requests", "1")
                    if (cookieHeader.isNotBlank()) {
                        setRequestProperty("Cookie", cookieHeader.trim())
                    }
                }

                val status = connection.responseCode
                val rawStream: InputStream? = try {
                    if (status in 200..399) connection.inputStream else connection.errorStream
                } catch (_: Exception) {
                    connection.errorStream
                }

                val bodyText = if (rawStream != null) {
                    val encoding = connection.contentEncoding ?: ""
                    val decodedStream = if (encoding.contains("gzip", ignoreCase = true)) {
                        GZIPInputStream(rawStream)
                    } else {
                        rawStream
                    }
                    decodedStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                } else {
                    ""
                }

                JSONObject().apply {
                    put("status", status)
                    put("body", bodyText)
                    put("error", JSONObject.NULL)
                }.toString()
            } catch (e: Exception) {
                JSONObject().apply {
                    put("status", 0)
                    put("body", "")
                    put("error", e.message ?: "Błąd połączenia HTTP")
                }.toString()
            } finally {
                connection?.disconnect()
            }
        }
    }
}
