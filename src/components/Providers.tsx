'use client'

import { NextAuthProvider } from '@/components/NextAuthProvider'
import { ZohoProvider } from '@/components/ZohoProvider'
import { DebugProvider } from '@/components/DebugProvider'
import { PreferencesProvider } from '@/components/PreferencesProvider'
import { AuthWrapper } from '@/components/AuthWrapper'
import { ProductModalProvider } from '@/components/ProductModalProvider'
import { NotificationProvider } from '@/components/NotificationProvider'
import { CampaignProgressProvider } from '@/components/CampaignProgressProvider'
import { QueryProvider } from '@/components/QueryProvider'
import { CustomerIdentityCallback } from '@/components/CustomerIdentityCallback'

const providers = [
  NextAuthProvider,
  QueryProvider,
  ZohoProvider,
  DebugProvider,
  PreferencesProvider,
  AuthWrapper,
  ProductModalProvider,
  NotificationProvider,
  CampaignProgressProvider,
] as const

export function Providers({ children }: { children: React.ReactNode }) {
  const app = providers.reduceRight<React.ReactNode>(
    (acc, Provider) => <Provider>{acc}</Provider>,
    children
  ) as React.ReactElement

  return <><CustomerIdentityCallback />{app}</>
}
