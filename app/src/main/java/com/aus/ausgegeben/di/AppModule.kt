package com.aus.ausgegeben.di

import com.aus.ausgegeben.data.AccountActions
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.TransactionPreferences
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

@Module
@InstallIn(SingletonComponent::class)
abstract class ExpenseBindModule {
    @Binds
    @Singleton
    abstract fun bindExpenseActions(impl: AppRepository): ExpenseActions
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AccountBindModule {
    @Binds
    @Singleton
    abstract fun bindAccountActions(impl: AppRepository): AccountActions
}

@Module
@InstallIn(SingletonComponent::class)
abstract class TransactionPreferencesBindModule {
    @Binds
    @Singleton
    abstract fun bindTransactionPreferences(impl: PreferenceManager): TransactionPreferences
}
