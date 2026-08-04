package com.example.hynix

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** SK하이닉스 = 000660. 다른 종목을 보려면 이 값만 바꾸면 됩니다. */
private const val DEFAULT_CODE = "000660"

private val BG = Color(0xFF101418)
private val CARD = Color(0xFF1A1F26)
private val MUTED = Color(0xFF9AA0A6)
private val UP = Color(0xFFE12E3F)
private val DOWN = Color(0xFF1B72E8)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { App() }
    }
}

@Composable
fun App() {
    val ctx = LocalContext.current
    var configured by remember { mutableStateOf(KisClient.loadCredentials(ctx) != null) }

    MaterialTheme(colorScheme = darkColorScheme(background = BG, surface = BG)) {
        Surface(color = BG, modifier = Modifier.fillMaxSize()) {
            if (configured) {
                TickerScreen(onReset = {
                    KisClient.clearCredentials(ctx)
                    configured = false
                })
            } else {
                SetupScreen(onSaved = { configured = true })
            }
        }
    }
}

@Composable
fun SetupScreen(onSaved: () -> Unit) {
    val ctx = LocalContext.current
    var appKey by remember { mutableStateOf("") }
    var appSecret by remember { mutableStateOf("") }
    var paper by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("KIS OpenAPI 설정", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            "한국투자증권 KIS Developers에서 발급받은 APP KEY / APP SECRET을 입력하세요. " +
                    "입력값은 이 기기 안에만 저장되며 외부로 전송되지 않습니다.",
            color = MUTED, fontSize = 14.sp
        )

        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = appKey,
            onValueChange = { appKey = it },
            label = { Text("APP KEY") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = appSecret,
            onValueChange = { appSecret = it },
            label = { Text("APP SECRET") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(checked = paper, onCheckedChange = { paper = it })
            Spacer(Modifier.width(12.dp))
            Text(
                if (paper) "모의투자 서버 (31000)" else "실전투자 서버 (21000)",
                color = Color.White, fontSize = 15.sp
            )
        }

        Spacer(Modifier.height(28.dp))
        Button(
            onClick = {
                KisClient.saveCredentials(ctx, appKey, appSecret, paper)
                onSaved()
            },
            enabled = appKey.isNotBlank() && appSecret.isNotBlank(),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Text("시작하기", fontSize = 16.sp)
        }
    }
}

@Composable
fun TickerScreen(onReset: () -> Unit) {
    val ctx = LocalContext.current

    var tick by remember { mutableStateOf<Tick?>(null) }
    var snapshot by remember { mutableStateOf<Quote?>(null) }
    var status by remember { mutableStateOf(WsStatus.CONNECTING) }
    var statusMsg by remember { mutableStateOf<String?>(null) }
    var tickCount by remember { mutableIntStateOf(0) }
    var flash by remember { mutableIntStateOf(0) } // 1 상승체결, -1 하락체결, 0 없음

    // 웹소켓 연결 전에 REST 로 한 번 조회해 화면을 채워 둠 (장 마감 상태 대비)
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { KisClient.fetchQuote(ctx, DEFAULT_CODE) } }
            .onSuccess { snapshot = it }
    }

    // 실시간 체결가 구독
    DisposableEffect(Unit) {
        var prevPrice: Long? = null
        val rt = KisRealtime(
            ctx = ctx,
            code = DEFAULT_CODE,
            onTick = { t ->
                val now = t.price.replace(",", "").toLongOrNull()
                val prev = prevPrice
                flash = when {
                    prev == null || now == null -> 0
                    now > prev -> 1
                    now < prev -> -1
                    else -> 0
                }
                if (now != null) prevPrice = now
                tick = t
                tickCount++
            },
            onStatus = { s, m ->
                status = s
                statusMsg = m
            }
        )
        rt.start()
        onDispose { rt.stop() }
    }

    // 체결 플래시는 잠깐만 유지
    LaunchedEffect(tickCount) {
        if (flash != 0) {
            delay(250)
            flash = 0
        }
    }

    val direction = tick?.direction ?: snapshot?.direction ?: 0
    val accent by animateColorAsState(
        targetValue = when (direction) {
            1 -> UP
            -1 -> DOWN
            else -> MUTED
        },
        label = "accent"
    )
    val flashBg by animateColorAsState(
        targetValue = when (flash) {
            1 -> UP.copy(alpha = 0.18f)
            -1 -> DOWN.copy(alpha = 0.18f)
            else -> Color.Transparent
        },
        animationSpec = tween(200),
        label = "flash"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        StatusBadge(status, statusMsg)

        Spacer(Modifier.height(20.dp))
        Text(
            snapshot?.name ?: "SK하이닉스",
            color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.SemiBold
        )
        Text(DEFAULT_CODE, color = MUTED, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))

        Spacer(Modifier.height(24.dp))
        Box(
            modifier = Modifier
                .background(flashBg, RoundedCornerShape(12.dp))
                .padding(horizontal = 16.dp, vertical = 6.dp)
        ) {
            Text(
                tick?.price ?: snapshot?.price ?: "—",
                color = accent, fontSize = 62.sp, fontWeight = FontWeight.Bold
            )
        }

        Spacer(Modifier.height(8.dp))
        val sign = when (direction) {
            1 -> "▲"
            -1 -> "▼"
            else -> "-"
        }
        val diff = tick?.diff ?: snapshot?.diff
        val ratio = tick?.ratio ?: snapshot?.ratio
        if (diff != null) {
            Text(
                "$sign $diff   ($ratio%)",
                color = accent, fontSize = 22.sp, fontWeight = FontWeight.Medium
            )
        }

        Spacer(Modifier.height(32.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(CARD, RoundedCornerShape(16.dp))
                .padding(20.dp)
        ) {
            InfoRow("체결시각", tick?.time ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("체결량", tick?.tradeVolume ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("매도호가", tick?.ask ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("매수호가", tick?.bid ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("시가", tick?.open ?: snapshot?.open ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("고가", tick?.high ?: snapshot?.high ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("저가", tick?.low ?: snapshot?.low ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("누적 거래량", tick?.accVolume ?: snapshot?.volume ?: "—")
            Spacer(Modifier.height(10.dp))
            InfoRow("수신 체결 건수", "$tickCount 건")
        }

        if (tickCount == 0 && status == WsStatus.SUBSCRIBED) {
            Spacer(Modifier.height(14.dp))
            Text(
                "구독 완료. 체결이 발생하면 즉시 갱신됩니다.\n(장 시간 외에는 체결이 없어 값이 멈춰 있습니다)",
                color = MUTED, fontSize = 13.sp
            )
        }

        Spacer(Modifier.height(24.dp))
        TextButton(onClick = onReset) {
            Text("APP KEY 다시 설정", color = MUTED, fontSize = 14.sp)
        }
    }
}

@Composable
private fun StatusBadge(status: WsStatus, msg: String?) {
    val (color, label) = when (status) {
        WsStatus.CONNECTING -> Color(0xFFFFA726) to "연결 중"
        WsStatus.SUBSCRIBED -> Color(0xFF4CAF50) to "실시간 수신 중"
        WsStatus.DISCONNECTED -> MUTED to "연결 끊김 · 재접속 대기"
        WsStatus.ERROR -> Color(0xFFEF5350) to "오류"
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(CARD, RoundedCornerShape(20.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Spacer(Modifier.width(8.dp))
        Text(label, color = Color.White, fontSize = 13.sp)
        if (status == WsStatus.ERROR && !msg.isNullOrBlank()) {
            Spacer(Modifier.width(6.dp))
            Text("· $msg", color = MUTED, fontSize = 12.sp)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = MUTED, fontSize = 15.sp)
        Text(value, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}
