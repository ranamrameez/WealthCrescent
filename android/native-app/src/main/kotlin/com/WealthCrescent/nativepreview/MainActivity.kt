package com.WealthCrescent.nativepreview

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                PreviewApp()
            }
        }
    }
}

private enum class PreviewPage(val label: String, val initial: String) {
    Overview("Overview", "O"),
    Accounts("Accounts", "A"),
}

@Composable
private fun PreviewApp() {
    var page by rememberSaveable { mutableStateOf(PreviewPage.Overview) }
    BackHandler(enabled = page != PreviewPage.Overview) { page = PreviewPage.Overview }

    Scaffold(
        bottomBar = {
            NavigationBar {
                PreviewPage.entries.forEach { destination ->
                    NavigationBarItem(
                        selected = page == destination,
                        onClick = { page = destination },
                        icon = { Text(destination.initial) },
                        label = { Text(destination.label) },
                    )
                }
            }
        },
    ) { insets ->
        Column(
            modifier = Modifier.padding(insets).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(page.label, Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineLarge)
            Text("Preview with sample data", style = MaterialTheme.typography.bodyMedium)
            when (page) {
                PreviewPage.Overview -> {
                    BalanceCard("Total balance", "QAR 8,400.00")
                    BalanceCard("Cash on hand", "QAR 400.00")
                }
                PreviewPage.Accounts -> {
                    BalanceCard("Current account", "QAR 8,000.00")
                    BalanceCard("Cash wallet", "QAR 400.00")
                }
            }
        }
    }
}

@Composable
private fun BalanceCard(label: String, balance: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(label, style = MaterialTheme.typography.titleMedium)
            Text(balance, style = MaterialTheme.typography.headlineSmall)
        }
    }
}
