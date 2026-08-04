package com.example.hynix

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit

/** 웹소켓으로 들어오는 체결 1건 */
data class Tick(
    val code: String,
    val time: String,      // HH:mm:ss
    val price: String,     // 현재가 (콤마 포함)
    val diff: String,      // 전일 대비 (절대값)
    val ratio: String,     // 등락률
    val direction: Int,    // 1 상승, -1 하락, 0 보합
    val open: String,
    val high: String,
    val low: String,
    val ask: String,       // 매도호가1
    val bid: String,       // 매수호가1
    val tradeVolume: String,   // 이번 체결 수량
    val accVolume: String      // 누적 거래량
)

enum class WsStatus { CONNECTING, SUBSCRIBED, DISCONNECTED, ERROR }

/**
 * 한국투자증권 실시간 웹소켓 (국내주식 실시간체결가, TR: H0STCNT0)
 *
 * 흐름:
 *   1) REST 로 approval_key 발급
 *   2) ws://ops.koreainvestment.com:21000 접속
 *   3) 등록 요청 전송 (tr_type "1" = 등록, "2" = 해제)
 *   4) 이후 "0|H0STCNT0|001|필드^필드^..." 형태의 평문 프레임 수신
 *   5) 서버가 PINGPONG 프레임을 보내면 같은 내용을 되돌려 보내 연결 유지
 */
class KisRealtime(
    private val ctx: Context,
    private val code: String,
    private val onTick: (Tick) -> Unit,
    private val onStatus: (WsStatus, String?) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)   // 웹소켓은 읽기 타임아웃 없음
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private var socket: WebSocket? = null
    @Volatile private var closedByUser = false
    private var retryDelayMs = 2_000L

    fun start() {
        closedByUser = false
        connect()
    }

    fun stop() {
        closedByUser = true
        runCatching { socket?.send(subscribeMessage(unsubscribe = true)) }
        socket?.close(1000, "bye")
        socket = null
        onStatus(WsStatus.DISCONNECTED, null)
    }

    private var approvalKey: String? = null

    private fun connect() {
        onStatus(WsStatus.CONNECTING, null)
        Thread {
            try {
                if (approvalKey == null) approvalKey = KisClient.approvalKey(ctx)
                val req = Request.Builder().url(KisClient.wsUrl(ctx)).build()
                socket = client.newWebSocket(req, listener)
            } catch (e: Exception) {
                onStatus(WsStatus.ERROR, e.message)
                scheduleReconnect()
            }
        }.start()
    }

    private fun scheduleReconnect() {
        if (closedByUser) return
        val delay = retryDelayMs
        retryDelayMs = (retryDelayMs * 2).coerceAtMost(30_000L)
        Thread {
            Thread.sleep(delay)
            if (!closedByUser) connect()
        }.start()
    }

    private fun subscribeMessage(unsubscribe: Boolean = false): String =
        JSONObject()
            .put(
                "header", JSONObject()
                    .put("approval_key", approvalKey)
                    .put("custtype", "P")
                    .put("tr_type", if (unsubscribe) "2" else "1")
                    .put("content-type", "utf-8")
            )
            .put(
                "body", JSONObject().put(
                    "input", JSONObject()
                        .put("tr_id", "H0STCNT0")
                        .put("tr_key", code)
                )
            )
            .toString()

    private val listener = object : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            retryDelayMs = 2_000L
            webSocket.send(subscribeMessage())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            // 실시간 데이터 프레임: 암호화여부|TR_ID|건수|본문
            if (text.startsWith("0|") || text.startsWith("1|")) {
                handleRealtime(text)
                return
            }
            // 그 외에는 JSON 제어 메시지
            runCatching {
                val json = JSONObject(text)
                val header = json.optJSONObject("header")
                when (header?.optString("tr_id")) {
                    "PINGPONG" -> webSocket.send(text)   // 그대로 되돌려 보내기
                    else -> {
                        val body = json.optJSONObject("body")
                        val rt = body?.optString("rt_cd")
                        val msg = body?.optString("msg1")
                        if (rt == "0") onStatus(WsStatus.SUBSCRIBED, msg)
                        else if (rt != null) onStatus(WsStatus.ERROR, msg)
                    }
                }
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            onStatus(WsStatus.ERROR, t.message)
            approvalKey = null   // 접속키 만료 가능성 → 재발급
            scheduleReconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (!closedByUser) {
                onStatus(WsStatus.DISCONNECTED, reason)
                scheduleReconnect()
            }
        }
    }

    private fun handleRealtime(text: String) {
        val parts = text.split("|", limit = 4)
        if (parts.size < 4) return
        if (parts[1] != "H0STCNT0") return

        val count = parts[2].toIntOrNull() ?: 1
        val fields = parts[3].split("^")
        val stride = 46   // H0STCNT0 한 건당 필드 수

        // 한 프레임에 여러 건이 묶여 올 수 있음 → 가장 마지막(최신) 체결만 반영
        val offset = if (count > 1 && fields.size >= stride * count) (count - 1) * stride else 0
        if (fields.size < offset + 14) return

        fun f(i: Int) = fields.getOrElse(offset + i) { "" }

        val sign = f(3)
        onTick(
            Tick(
                code = f(0),
                time = f(1).toHms(),
                price = f(2).grouped(),
                diff = f(4).removePrefix("-").grouped(),
                ratio = f(5),
                direction = when (sign) {
                    "1", "2" -> 1
                    "4", "5" -> -1
                    else -> 0
                },
                open = f(7).grouped(),
                high = f(8).grouped(),
                low = f(9).grouped(),
                ask = f(10).grouped(),
                bid = f(11).grouped(),
                tradeVolume = f(12).grouped(),
                accVolume = f(13).grouped()
            )
        )
    }
}

/** "093015" -> "09:30:15" */
private fun String.toHms(): String =
    if (length >= 6) "${substring(0, 2)}:${substring(2, 4)}:${substring(4, 6)}" else this

private fun String.grouped(): String {
    val n = trim().toDoubleOrNull() ?: return trim()
    return String.format(Locale.KOREA, "%,d", n.toLong())
}
