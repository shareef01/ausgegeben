package com.aus.ausgegeben

import android.app.Application
import com.google.firebase.FirebaseApp

class AusgegebenApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this)
        }
    }
}
