package com.gameaics.mockplayer

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder

/**
 * 表示签名参数 API 响应的数据类。
 */
data class SignedParamsResponse(val success: Boolean, val data: SignedParams?, val error: String?)

/**
 * 包含游戏/H5 身份验证和会话参数的数据类。
 */
data class SignedParams(
    val h5Url: String,
    val gameid: String,
    val uid: String,
    val areaid: String,
    val playerName: String,
    val ts: Long,
    val nonce: String,
    val sign: String
)

/**
 * MainActivity 处理 Mock Player 应用程序的核心逻辑。
 * 它从服务器获取验证参数，并在 WebView 中显示游戏/客服 H5 页面，同时提供 JavaScript Bridge 交互功能。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    /**
     * 存储当前玩家的签名参数，通过 JavaScript Bridge 与 H5 共享。
     */
    private var currentParams: SignedParams? = null

    private val client = OkHttpClient()
    private val gson = Gson()

    companion object {
        private const val FILE_CHOOSER_REQUEST_CODE = 1001
        private const val TAG = "MockPlayer"
    }

    /**
     * 获取客服身份验证参数的接口地址。
     * 注意：10.0.2.2 是从 Android 模拟器访问宿主机 localhost 的默认 IP。
     */
    private val GAME_SERVER_URL = "http://10.0.2.2:3001/api/get-cs-auth"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)

        // 处理沉浸式状态栏及系统栏间距
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }

        setupWebView()
        // 示例：启动时请求特定玩家的签名参数
        requestSignedParams("player001", "1")
    }

    /**
     * 获取用户的签名参数，然后加载 H5 页面。
     * @param uid 用户唯一 ID。
     * @param areaid 区服 ID。
     */
    private fun requestSignedParams(uid: String, areaid: String) {
        progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val result = fetchAuthFromServer(uid, areaid)
                if (result != null && result.success && result.data != null) {
                    currentParams = result.data
                    loadCustomerServiceUrl(result.data)
                } else {
                    val msg = result?.error ?: "数据解析失败"
                    showError("获取签名失败: $msg")
                }
            } catch (e: Exception) {
                showError("网络请求异常: ${e.message}")
            }
        }
    }

    /**
     * 从后端服务器获取验证数据的网络请求。
     */
    private suspend fun fetchAuthFromServer(uid: String, areaid: String): SignedParamsResponse? = withContext(Dispatchers.IO) {
        val json = gson.toJson(mapOf("uid" to uid, "areaid" to areaid))
        val body = json.toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url(GAME_SERVER_URL).post(body).build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string()
                Log.d(TAG, "Server Response: $bodyStr")
                if (!response.isSuccessful) return@withContext null
                gson.fromJson(bodyStr, SignedParamsResponse::class.java)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Fetch Error", e)
            null
        }
    }

    /**
     * 初始化 WebView 设置，配置 JavaScript 接口，并处理 ChromeClient/WebViewClient 事件。
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // 将 Bridge 以 'roadWebViewService' 的名称暴露给 JavaScript
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun close() = runOnUiThread { finish() }

            /**
             * 向 H5 环境提供当前玩家信息。
             */
            @JavascriptInterface
            fun getPlayerInfo(): String {
                val json = currentParams?.let { gson.toJson(it) } ?: "{}"
                Log.d(TAG, "JS Bridge 调用 getPlayerInfo: $json")
                return json
            }
        }, "roadWebViewService")

        webView.webChromeClient = object : WebChromeClient() {
            /**
             * 处理 WebView 发起的选择文件请求（例如在客服聊天中上传图片）。
             */
            override fun onShowFileChooser(webView: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback
                val intent = Intent(Intent.ACTION_PICK).apply { type = "image/*" }
                startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                return true
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
            }
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "加载失败: ${error?.description}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
    /**
     * 构造带有查询参数的最终 URL 并在 WebView 中加载。
     */
    private fun loadCustomerServiceUrl(params: SignedParams) {
        val url = buildString {
            append(params.h5Url)
            if (!params.h5Url.contains("?")) append("/")
            append("?gameid=${params.gameid}")
            append("&uid=${params.uid}")
            append("&areaid=${params.areaid}")
            append("&ts=${params.ts}")
            append("&nonce=${params.nonce}")
            append("&sign=${params.sign}")
            append("&playerName=${URLEncoder.encode(params.playerName, "UTF-8")}")
            append("&platform=Android")
        }
        Log.d(TAG, "Loading URL: $url")
        webView.loadUrl(url)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            fileChooserCallback?.onReceiveValue(if (resultCode == RESULT_OK) data?.data?.let { arrayOf(it) } else null)
            fileChooserCallback = null
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /**
     * 向用户显示错误消息并隐藏加载进度条。
     */
    private fun showError(msg: String) {
        progressBar.visibility = View.GONE
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }
}
