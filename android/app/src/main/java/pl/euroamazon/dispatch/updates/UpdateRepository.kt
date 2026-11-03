package pl.euroamazon.dispatch.updates

import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class UpdateRepository(
    private val directory: File,
    private val source: GitHubReleaseSource,
    private val installed: AppVersion,
    private val onStateChanged: (UpdateState) -> Unit,
    private val clock: () -> Long = System::currentTimeMillis
) {
    @Volatile
    var state: UpdateState = UpdateState()
        private set

    private val lock = ReentrantLock()
    private var loaded = false
    private var lastAttempt = 0L
    private var lastRelease: AppRelease? = null
    private val cache get() = File(directory, "latest.json")

    fun load() {
        lock.withLock {
            loadOnce()
        }
    }

    fun check(force: Boolean = false) {
        if (!lock.tryLock()) return
        try {
            loadOnce()
            val now = clock()
            if (!force && lastAttempt != 0L && now >= lastAttempt && now - lastAttempt < 24 * 60 * 60 * 1000L) {
                return
            }
            lastAttempt = now
            try {
                persist(lastRelease, state.checkedAt)
            } catch (_: Exception) {
                if (!force) {
                    updateState(state.copy(error = "Nie udało się zapisać czasu sprawdzenia. Spróbuj sprawdzić ręcznie."))
                    return
                }
            }
            updateState(state.copy(checking = true, error = null))
            try {
                val release = source.latest()
                lastRelease = release
                val checkedAt = clock()
                var next = UpdateState(
                    available = release.takeIf { it.version > installed },
                    checkedAt = checkedAt
                )
                try {
                    persist(release, checkedAt)
                } catch (_: Exception) {
                    next = next.copy(error = "Sprawdzono aktualizacje, ale nie udało się zapisać wyniku na telefonie.")
                }
                updateState(next)
            } catch (e: Exception) {
                val msg = if (e.message?.contains("PRIVATE_OR_NO_RELEASE") == true) {
                    "Repozytorium GitHub jest prywatne — podaj opcjonalny token odczytu GitHub poniżej lub ustaw repozytorium jako publiczne."
                } else {
                    "Nie udało się sprawdzić aktualizacji. Spróbuj ponownie później."
                }
                updateState(state.copy(error = msg))
            }
        } finally {
            updateState(state.copy(checking = false))
            lock.unlock()
        }
    }

    private fun updateState(next: UpdateState) {
        state = next
        onStateChanged(next)
    }

    private fun loadOnce() {
        if (loaded) return
        loaded = true
        runCatching {
            val json = JSONObject(cache.readText())
            require(json.getInt("schema") == 1)
            val release = json.optString("version").takeIf { it.isNotBlank() }?.let { releaseFromJson(json) }
            val checkedAt = json.optLong("checkedAt").coerceAtLeast(0L)
            lastRelease = release
            lastAttempt = json.optLong("lastAttempt", checkedAt).coerceAtLeast(0L)
            updateState(UpdateState(release?.takeIf { it.version > installed }, checkedAt))
        }
    }

    private fun persist(release: AppRelease?, checkedAt: Long) {
        directory.mkdirs()
        val temporary = File(directory, "latest.tmp")
        temporary.writeText(
            (release?.toJson() ?: JSONObject())
                .put("schema", 1)
                .put("checkedAt", checkedAt)
                .put("lastAttempt", lastAttempt)
                .toString()
        )
        Files.move(
            temporary.toPath(),
            cache.toPath(),
            StandardCopyOption.REPLACE_EXISTING,
            StandardCopyOption.ATOMIC_MOVE
        )
    }
}
