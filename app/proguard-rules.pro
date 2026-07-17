# Keep data entities (serialized via Firestore)
-keep class com.aus.ausgegeben.data.entity.** { *; }

# WorkManager workers
-keep class com.aus.ausgegeben.notification.** { *; }

# Kotlin serialization (navigation routes)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

# Firebase/GMS ship consumer ProGuard rules in their AARs; no blanket keeps needed.
-dontwarn com.google.firebase.**
