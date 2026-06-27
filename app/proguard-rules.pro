# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**

# Keep Room entities and DAOs
-keep class com.aus.ausgegeben.data.entity.** { *; }
-keep class com.aus.ausgegeben.data.dao.** { *; }

# WorkManager workers
-keep class com.aus.ausgegeben.notification.** { *; }

# Kotlin serialization (navigation routes)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
