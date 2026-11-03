package pl.euroamazon.dispatch.updates

import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

enum class DownloadPhase { Idle, Downloading, Verifying, Ready, Failed }

data class ApkDownloadState(
    val release: AppRelease? = null,
    val phase: DownloadPhase = DownloadPhase.Idle,
    val bytes: Long = 0L,
    val error: String? = null
) {
    val busy: Boolean get() = phase == DownloadPhase.Downloading || phase == DownloadPhase.Verifying
}

class ApkDownloadRepository(
    private val directory: File,
    private val installed: AppVersion,
    private val transport: ApkTransport,
    private val verifyIdentity: (File, AppRelease) -> Unit,
    private val onStateChanged: (ApkDownloadState) -> Unit
) {
    @Volatile
    var state: ApkDownloadState = ApkDownloadState()
        private set

    private val lock = ReentrantLock()
    private val cancelRequested = AtomicBoolean(false)
    private var loaded = false
    private val record get() = File(directory, "download.json")
    private val apk get() = File(directory, "update.apk")
    private val partial get() = File(directory, "update.part.apk")

    fun load() {
        lock.withLock {
            loadOnce()
        }
    }

    fun cancel() {
        cancelRequested.set(true)
    }

    fun download(release: AppRelease) {
        if (!lock.tryLock()) return
        cancelRequested.set(false)
        try {
            loadOnce()
            require(release.version > installed) { "Ta aktualizacja jest już zainstalowana." }
            require(release.size in 1..MAX_APK_BYTES && release.sha256?.matches(Regex("[a-f0-9]{64}")) == true) {
                "Brakuje sumy kontrolnej SHA-256 w wydaniu GitHub. Sprawdź aktualizacje ponownie."
            }
            directory.mkdirs()
            clearFiles()
            persist(release, ready = false)
            updateState(ApkDownloadState(release, DownloadPhase.Downloading))

            transport.open(release) { cancelRequested.get() }.use { input ->
                FileOutputStream(partial).use { output ->
                    val buffer = ByteArray(32 * 1024)
                    var bytes = 0L
                    while (true) {
                        if (cancelRequested.get()) throw InterruptedException("Anulowano pobieranie")
                        val count = input.read(buffer)
                        if (count < 0) break
                        bytes += count
                        require(bytes <= release.size) {
                            "Plik aktualizacji ma nieprawidłowy rozmiar. Pobierz ponownie."
                        }
                        output.write(buffer, 0, count)
                        updateState(state.copy(bytes = bytes))
                    }
                    output.fd.sync()
                }
            }

            if (cancelRequested.get()) throw InterruptedException("Anulowano pobieranie")
            updateState(state.copy(phase = DownloadPhase.Verifying))
            verify(partial, release)
            if (cancelRequested.get()) throw InterruptedException("Anulowano pobieranie")

            Files.move(
                partial.toPath(),
                apk.toPath(),
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE
            )
            persist(release, ready = true)
            updateState(ApkDownloadState(release, DownloadPhase.Ready, release.size))
        } catch (_: InterruptedException) {
            clearFiles()
            updateState(
                ApkDownloadState(
                    release,
                    DownloadPhase.Failed,
                    error = "Anulowano pobieranie. Możesz pobrać ponownie."
                )
            )
        } catch (error: Exception) {
            clearFiles()
            updateState(
                ApkDownloadState(
                    release,
                    DownloadPhase.Failed,
                    error = when (error) {
                        is IllegalArgumentException, is SecurityException -> error.message
                        else -> "Nie udało się pobrać aktualizacji. Sprawdź połączenie i wolne miejsce, a potem spróbuj ponownie."
                    }
                )
            )
        } finally {
            lock.unlock()
        }
    }

    /** Revalidates the private file immediately before giving read access to Android's installer. */
    fun preparedApk(): File? = lock.withLock {
        loadOnce()
        val release = state.release ?: return@withLock null
        if (state.phase != DownloadPhase.Ready) return@withLock null
        try {
            verify(apk, release)
            apk
        } catch (_: Exception) {
            clearFiles()
            updateState(
                ApkDownloadState(
                    release,
                    DownloadPhase.Failed,
                    error = "Nie udało się zweryfikować pobranego pliku. Pobierz aktualizację ponownie."
                )
            )
            null
        }
    }

    fun installationError(message: String?) {
        updateState(state.copy(error = message))
    }

    private fun updateState(next: ApkDownloadState) {
        state = next
        onStateChanged(next)
    }

    private fun verify(file: File, release: AppRelease) {
        require(file.length() == release.size) { "Plik aktualizacji jest niekompletny. Pobierz ponownie." }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        require(actual == release.sha256) { "Plik aktualizacji jest uszkodzony. Pobierz ponownie." }
        verifyIdentity(file, release)
    }

    private fun loadOnce() {
        if (loaded) return
        loaded = true
        if (!record.exists()) return
        try {
            val json = JSONObject(record.readText())
            require(json.getInt("schema") == 1)
            val release = releaseFromJson(json)
            if (release.version <= installed) {
                clearFiles()
                return
            }
            if (!json.getBoolean("ready")) {
                clearFiles()
                updateState(
                    ApkDownloadState(
                        release,
                        DownloadPhase.Failed,
                        error = "Poprzednie pobieranie zostało przerwane. Pobierz aktualizację ponownie."
                    )
                )
                return
            }
            verify(apk, release)
            updateState(ApkDownloadState(release, DownloadPhase.Ready, release.size))
        } catch (_: Exception) {
            clearFiles()
            updateState(ApkDownloadState(error = "Nie udało się odczytać pobranej aktualizacji. Pobierz ją ponownie."))
        }
    }

    private fun persist(release: AppRelease, ready: Boolean) {
        val temporary = File(directory, "download.tmp")
        FileOutputStream(temporary).use { output ->
            output.write(release.toJson().put("schema", 1).put("ready", ready).toString().toByteArray())
            output.fd.sync()
        }
        Files.move(
            temporary.toPath(),
            record.toPath(),
            StandardCopyOption.REPLACE_EXISTING,
            StandardCopyOption.ATOMIC_MOVE
        )
    }

    private fun clearFiles() {
        partial.delete()
        apk.delete()
        record.delete()
    }

    companion object {
        const val MAX_APK_BYTES = 64L * 1024 * 1024
    }
}
