package com.example.hynix

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 한국투자증권 KIS Developers REST API 클라이언트.
 *
 * - 접근토큰(/oauth2/tokenP)은 유효기간이 24시간이고 발급 호출에 분당 1회 제한이 있으므로
 *   SharedPreferences 에 캐시해 두고 만료 직전에만 재발급합니다.
 * - 시세 조회는 /uapi/domestic-stock/v1/quotations/inquire-price (tr_id: FHKST01010100)
 */
object KisClient {

    private const val PREF = "kis"
    private const val KEY_APPKEY = "appkey"
    private const val KEY_APPSECRET = "appsecret"
    private const val KEY_PAPER = "paper"
    private const val KEY_TOKEN = "token"
    private const val KEY_TOKEN_EXP = "token_exp"

    private const val REAL_BASE = "https://openapi.koreainvestment.com:9443"
    private const val PAPER_BASE = "https://openapivts.koreainvestment.com:29443"

    data class Credentials(val appKey: String, val appSecret: String, val paper: Boolean)

    fun saveCredentials(ctx: Context, appKey: String, appSecret: String, paper: Boolean) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putString(KEY_APPKEY, appKey.trim())
            .putString(KEY_APPSECRET, appSecret.trim())
            .putBoolean(KEY_PAPER, paper)
            .remove(KEY_TOKEN)          // 키가 바뀌면 기존 토큰 폐기
            .remove(KEY_TOKEN_EXP)
            .apply()
    }

    fun loadCredentials(ctx: Context): Credentials? {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val k = p.getString(KEY_APPKEY, null) ?: return null
        val s = p.getString(KEY_APPSECRET, null) ?: return null
        if (k.isBlank() || s.isBlank()) return null
        return Credentials(k, s, p.getBoolean(KEY_PAPER, false))
    }

    fun clearCredentials(ctx: Context) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun base(paper: Boolean) = if (paper) PAPER_BASE else REAL_BASE

    /** 캐시된 토큰을 돌려주고, 없거나 만료 30분 전이면 새로 발급합니다. */
    @Synchronized
    private fun accessToken(ctx: Context, c: Credentials): String {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val cached = p.getString(KEY_TOKEN, null)
        val exp = p.getLong(KEY_TOKEN_EXP, 0L)
        if (cached != null && System.currentTimeMillis() < exp - 30 * 60 * 1000L) return cached

        val body = JSONObject()
            .put("grant_type", "client_credentials")
            .put("appkey", c.appKey)
            .put("appsecret", c.appSecret)
            .toString()

        val res = JSONObject(
            httpPost("${base(c.paper)}/oauth2/tokenP", body)
        )
        val token = res.optString("access_token")
        if (token.isBlank()) {
            throw RuntimeException(res.optString("error_description", "토큰 발급 실패"))
        }
        val expiresIn = res.optLong("expires_in", 86400L)
        p.edit()
            .putString(KEY_TOKEN, token)
            .putLong(KEY_TOKEN_EXP, System.currentTimeMillis() + expiresIn * 1000L)
            .apply()
        return token
    }

    /**
     * 실시간 웹소켓 접속키(approval_key) 발급.
     * REST 접근토큰과는 별개의 값이며, 요청 본문의 키 이름이 secretkey 인 점에 주의.
     */
    fun approvalKey(ctx: Context): String {
        val c = loadCredentials(ctx) ?: throw IllegalStateException("APP KEY 가 설정되지 않았습니다")
        val body = JSONObject()
            .put("grant_type", "client_credentials")
            .put("appkey", c.appKey)
            .put("secretkey", c.appSecret)
            .toString()
        val res = JSONObject(httpPost("${base(c.paper)}/oauth2/Approval", body))
        val key = res.optString("approval_key")
        if (key.isBlank()) throw RuntimeException(res.optString("error_description", "접속키 발급 실패"))
        return key
    }

    /** 실시간 웹소켓 엔드포인트 (실전 21000 / 모의 31000) */
    fun wsUrl(ctx: Context): String {
        val paper = loadCredentials(ctx)?.paper ?: false
        return if (paper) "ws://ops.koreainvestment.com:31000"
        else "ws://ops.koreainvestment.com:21000"
    }

    /** 주식 현재가 시세 조회 (웹소켓 연결 전 초기 스냅샷용) */
    fun fetchQuote(ctx: Context, code: String): Quote {
        val c = loadCredentials(ctx) ?: throw IllegalStateException("APP KEY 가 설정되지 않았습니다")
        val token = accessToken(ctx, c)

        val url = "${base(c.paper)}/uapi/domestic-stock/v1/quotations/inquire-price" +
                "?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=$code"

        val json = JSONObject(
            httpGet(
                url,
                mapOf(
                    "authorization" to "Bearer $token",
                    "appkey" to c.appKey,
                    "appsecret" to c.appSecret,
                    "tr_id" to "FHKST01010100",
                    "custtype" to "P"
                )
            )
        )

        if (json.optString("rt_cd", "0") != "0") {
            throw RuntimeException(json.optString("msg1", "조회 실패"))
        }

        val o = json.getJSONObject("output")

        // prdy_vrss_sign : 1 상한, 2 상승, 3 보합, 4 하한, 5 하락
        val direction = when (o.optString("prdy_vrss_sign")) {
            "1", "2" -> 1
            "4", "5" -> -1
            else -> 0
        }

        return Quote(
            name = o.optString("hts_kor_isnm").ifBlank { "종목 $code" },
            price = o.optString("stck_prpr").toGrouped(),
            diff = o.optString("prdy_vrss").removePrefix("-").toGrouped(),
            ratio = o.optString("prdy_ctrt"),
            direction = direction,
            volume = o.optString("acml_vol").toGrouped(),
            high = o.optString("stck_hgpr").toGrouped(),
            low = o.optString("stck_lwpr").toGrouped(),
            open = o.optString("stck_oprc").toGrouped()
        )
    }

    private fun String.toGrouped(): String {
        val n = this.trim().toDoubleOrNull() ?: return this
        return String.format(java.util.Locale.KOREA, "%,d", n.toLong())
    }

    private fun httpPost(urlStr: String, body: String): String {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 5000
            readTimeout = 5000
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
        }
        try {
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            return stream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun httpGet(urlStr: String, headers: Map<String, String>): String {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5000
            readTimeout = 5000
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            val text = stream.bufferedReader().use { it.readText() }
            if (conn.responseCode !in 200..299) {
                val msg = runCatching { JSONObject(text).optString("msg1") }.getOrNull()
                throw RuntimeException(msg?.ifBlank { null } ?: "HTTP ${conn.responseCode}")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }
}

data class Quote(
    val name: String,
    val price: String,
    val diff: String,
    val ratio: String,
    val direction: Int, // 1 상승, -1 하락, 0 보합
    val volume: String,
    val high: String,
    val low: String,
    val open: String
)
