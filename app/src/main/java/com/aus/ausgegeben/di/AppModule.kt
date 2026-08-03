package com.aus.ausgegeben.di

import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.auth.AuthActions
import com.aus.ausgegeben.data.auth.AuthRepository
import com.google.firebase.auth.FirebaseAuth
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {

    @Provides
    @Singleton
    fun provideFirebaseAuth(): FirebaseAuth = FirebaseAuth.getInstance()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthBindModule {
    @Binds
    @Singleton
    abstract fun bindAuthActions(impl: AuthRepository): AuthActions
}

@Module
@InstallIn(SingletonComponent::class)
abstract class CategoryBindModule {
    @Binds
    @Singleton
    abstract fun bindCategoryActions(impl: AppRepository): CategoryActions
}
