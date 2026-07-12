# Keep data entities (serialized via Firestore)
-keep class com.aus.ausgegeben.data.entity.** { *; }

# WorkManager workers
-keep class com.aus.ausgegeben.notification.** { *; }

# Kotlin serialization (navigation routes)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

# Firebase Auth
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
