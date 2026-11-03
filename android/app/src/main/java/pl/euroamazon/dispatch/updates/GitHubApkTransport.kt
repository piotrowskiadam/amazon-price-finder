package pl.euroamazon.dispatch.updates

import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

fun interface ApkTransport {
    fun open(release: AppRelease, isCancelled: () -> Boolean): InputStream
}

class GitHubApkTransport : ApkTransport {
    override fun open(release: AppRelease, isCancelled: () -> Boolean): InputStream {
        var url = URL(release.downloadUrl)
        repeat(5) {
            if (isCancelled()) throw InterruptedException("Anulowano pobieranie")
            require(
                url.protocol == "https" &&
                    url.userInfo == null &&
                    url.port in listOf(-1, 443) &&
                    url.host in setOf(
                        "github.com",
                        "release-assets.githubusercontent.com",
                        "objects.githubusercontent.com"
                    )
            ) {
                "Niedozwolone źródło pliku aktualizacji."
            }

            val connection = url.openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 8_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("User-Agent", "EuroAmazonDispatch-Android")
            connection.setRequestProperty("Accept-Encoding", "identity")

            try {
                when (connection.responseCode) {
                    301, 302, 303, 307, 308 -> {
                        val location = connection.getHeaderField("Location") ?: error("Missing redirect")
                        url = URL(url, location)
                        connection.disconnect()
                    }
                    200 -> return object : FilterInputStream(connection.inputStream) {
                        override fun close() {
                            try {
                                super.close()
                            } finally {
                                connection.disconnect()
                            }
                        }
                    }
                    else -> error("APK HTTP ${connection.responseCode}")
                }
            } catch (error: Exception) {
                connection.disconnect()
                throw error
            }
        }
        error("Too many APK redirects")
    }
}
