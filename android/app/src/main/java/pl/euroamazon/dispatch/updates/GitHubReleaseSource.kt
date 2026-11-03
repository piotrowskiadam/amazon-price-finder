package pl.euroamazon.dispatch.updates

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** The injectable boundary is the public HTTP response, never an internal collaborator. */
class GitHubReleaseSource(
    private val readResponse: () -> String = { fetchLatest() }
) {
    fun latest(): AppRelease {
        val json = JSONObject(readResponse())
        require(!json.optBoolean("draft", false) && !json.optBoolean("prerelease", false)) {
            "Wydanie ma status wersji roboczej."
        }
        val ver = AppVersion.parse(json.getString("tag_name").removePrefix("v"))
        val expectedTag = "v$ver"
        require(json.getString("tag_name") == expectedTag && json.getString("html_url") == "${AppRelease.RepositoryUrl}/releases/tag/$expectedTag") {
            "Niezgodny adres wydania GitHub."
        }

        val assets = json.getJSONArray("assets")
        val allowedNames = setOf("EuroAmazon-Dispatch-$ver.apk", "euroamazon-dispatch.apk")
        val apk = (0 until assets.length())
            .map { assets.getJSONObject(it) }
            .firstOrNull { asset ->
                val name = asset.optString("name")
                name in allowedNames &&
                    asset.optString("state") == "uploaded" &&
                    asset.optLong("size") > 0L &&
                    asset.optString("browser_download_url") == "${AppRelease.RepositoryUrl}/releases/download/$expectedTag/$name"
            } ?: error("Wydanie nie zawiera oficjalnego pliku APK.")

        val digest = apk.optString("digest", "").removePrefix("sha256:").lowercase()
        return AppRelease(
            version = ver,
            size = apk.getLong("size"),
            sha256 = digest.takeIf { it.matches(Regex("[a-f0-9]{64}")) },
            assetName = apk.getString("name")
        )
    }

    companion object {
        private fun fetchLatest(): String {
            val connection = URL("https://api.github.com/repos/${AppRelease.Repository}/releases/latest")
                .openConnection() as HttpURLConnection
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            connection.setRequestProperty("X-GitHub-Api-Version", "2026-03-10")
            connection.setRequestProperty("User-Agent", "EuroAmazonDispatch-Android")
            try {
                check(connection.responseCode == 200) { "Release HTTP ${connection.responseCode}" }
                return connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            } finally {
                connection.disconnect()
            }
        }
    }
}
