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

data class SignedParamsResponse(val success: Boolean, val data: SignedParams?, val error: String?)
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

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    
    // 新增：用于保存当前的玩家参数，供 H5 以后通过 Bridge 获取
    private var currentParams: SignedParams? = null
    
    private val client = OkHttpClient()
    private val gson = Gson()

    companion object {
        private const val FILE_CHOOSER_REQUEST_CODE = 1001
        private const val TAG = "MockPlayer"
    }

    private val GAME_SERVER_URL = "http://10.0.2.2:3001/api/get-cs-auth"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }

        setupWebView()
        requestSignedParams("player001", "1")
    }

    private fun requestSignedParams(uid: String, areaid: String) {
        progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val result = fetchAuthFromServer(uid, areaid)
                if (result != null && result.success && result.data != null) {
                    currentParams = result.data // 保存参数
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

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // 修改：增加 getPlayerInfo 方法
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun close() = runOnUiThread { finish() }

            @JavascriptInterface
            fun getPlayerInfo(): String {
                val json = currentParams?.let { gson.toJson(it) } ?: "{}"
                Log.d(TAG, "JS Bridge 调用 getPlayerInfo: $json")
                return json
            }
        }, "AndroidBridge")

        webView.webChromeClient = object : WebChromeClient() {
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
            append("&platform=android")
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

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun showError(msg: String) {
        progressBar.visibility = View.GONE
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }
}
