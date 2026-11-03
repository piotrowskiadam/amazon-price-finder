package pl.euroamazon.dispatch.updates

import org.json.JSONObject

data class AppVersion private constructor(
    val major: Int,
    val minor: Int,
    val patch: Int
) : Comparable<AppVersion> {
    override fun compareTo(other: AppVersion): Int = compareValuesBy(
        this,
        other,
        AppVersion::major,
        AppVersion::minor,
        AppVersion::patch
    )

    override fun toString(): String = "$major.$minor.$patch"

    companion object {
        fun parse(value: String): AppVersion {
            val cleaned = value.trim().removePrefix("v")
            require(cleaned.matches(Regex("(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)"))) {
                "Nieprawidłowy format wersji: $value"
            }
            val numbers = cleaned.split('.').map(String::toInt)
            return AppVersion(numbers[0], numbers[1], numbers[2])
        }
    }
}

data class AppRelease(
    val version: AppVersion,
    val size: Long = 0L,
    val sha256: String? = null,
    val assetName: String = "EuroAmazon-Dispatch-$version.apk",
    val assetApiUrl: String? = null
) {
    val tag: String get() = "v$version"
    val filename: String get() = assetName
    val pageUrl: String get() = "$RepositoryUrl/releases/tag/$tag"
    val downloadUrl: String get() = "$RepositoryUrl/releases/download/$tag/$filename"

    companion object {
        const val Repository = "piotrowskiadam/amazon-price-finder"
        const val RepositoryUrl = "https://github.com/$Repository"
    }
}

data class UpdateState(
    val available: AppRelease? = null,
    val checkedAt: Long = 0L,
    val checking: Boolean = false,
    val error: String? = null
)

internal fun AppRelease.toJson(): JSONObject = JSONObject()
    .put("version", version.toString())
    .put("size", size)
    .put("sha256", sha256 ?: JSONObject.NULL)
    .put("assetName", assetName)
    .put("assetApiUrl", assetApiUrl ?: JSONObject.NULL)

internal fun releaseFromJson(json: JSONObject): AppRelease {
    val ver = AppVersion.parse(json.getString("version"))
    val rawSha = if (json.isNull("sha256")) "" else json.optString("sha256", "")
    val rawAssetName = json.optString("assetName", "").ifBlank { "EuroAmazon-Dispatch-$ver.apk" }
    val rawApiUrl = if (json.isNull("assetApiUrl")) null else json.optString("assetApiUrl", "").ifBlank { null }
    return AppRelease(
        version = ver,
        size = json.optLong("size", 0L),
        sha256 = rawSha.takeIf { it.matches(Regex("[a-f0-9]{64}")) },
        assetName = rawAssetName,
        assetApiUrl = rawApiUrl
    )
}
