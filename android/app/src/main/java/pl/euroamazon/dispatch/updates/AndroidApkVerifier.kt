package pl.euroamazon.dispatch.updates

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest

/** Treat the archive as an update to this installation, never as an arbitrary installable app. */
@Suppress("DEPRECATION")
class AndroidApkVerifier(private val context: Context) {
    fun verify(file: File, release: AppRelease) {
        val manager = context.packageManager
        val flags = PackageManager.GET_SIGNATURES or
            if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else 0
        val archive = manager.getPackageArchiveInfo(file.absolutePath, flags)
            ?: throw SecurityException("Pobrany plik nie jest poprawną aplikacją Android.")
        val installed = manager.getPackageInfo(context.packageName, flags)
        require(archive.packageName == context.packageName) {
            "Plik aktualizacji dotyczy innej aplikacji."
        }
        require(archive.versionName == release.version.toString() && code(archive) > code(installed)) {
            "Plik nie zawiera oczekiwanej nowszej wersji EuroAmazon Dispatch. Sprawdź aktualizacje ponownie."
        }
        val own = certificates(installed)
        require(own.isNotEmpty() && own == certificates(archive)) {
            "Podpis aktualizacji nie zgadza się z zainstalowaną aplikacją."
        }
    }

    private fun code(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

    private fun certificates(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            info.signingInfo?.apkContentsSigners ?: info.signatures
        } else {
            info.signatures
        }
        return signatures.orEmpty().map { signature ->
            MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }.toSet()
    }
}
