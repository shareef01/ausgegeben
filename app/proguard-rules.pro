# Keep data entities (serialized via Firestore)
-keep class com.aus.ausgegeben.data.entity.** { *; }

# WorkManager workers
-keep class com.aus.ausgegeben.notification.** { *; }

# Room instantiates its generated *_Impl database classes reflectively, via
# Class.getDeclaredConstructor(). R8 full mode (the default since AGP 8) sees no
# caller for those no-arg constructors and strips them, so the lookup throws
# NoSuchMethodException at runtime. WorkManager builds its WorkDatabase this way
# on first use, which made every release build die on launch:
#
#   java.lang.NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init> []
#     at androidx.work...  <- from ReminderScheduler.scheduleNext
#
# Debug builds never saw it because R8 does not run there. Keep the constructor
# for every RoomDatabase subclass rather than naming WorkDatabase_Impl alone, so
# adding a Room database later cannot reintroduce the same crash.
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# Kotlin serialization (navigation routes)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

# Firebase/GMS ship consumer ProGuard rules in their AARs; no blanket keeps needed.
-dontwarn com.google.firebase.**
