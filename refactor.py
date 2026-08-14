import os
import re

with open('src/components/DashboardView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Locate components to extract
start_types = content.find('interface DashboardData {')
end_types = content.find('function ChartTooltip')

types_code = content[start_types:end_types]
types_code = types_code.replace('interface DashboardViewProps', 'export interface DashboardViewProps')
types_code = types_code.replace('interface DashboardData', 'export interface DashboardData')
types_code = types_code.replace('const CHART_COLORS', 'export const CHART_COLORS')
types_code = types_code.replace('function parseLocalDate', 'export function parseLocalDate')
types_code = types_code.replace('function matchesRep', 'export function matchesRep')
types_code = types_code.replace('function formatRepCurrency', 'export function formatRepCurrency')
types_code = types_code.replace('function formatRepDate', 'export function formatRepDate')
types_code = types_code.replace('function getStatusBadgeClass', 'export function getStatusBadgeClass')

start_build_metric = content.find('function buildMetricInfo')
end_build_metric = content.rfind('}') + 1

build_metric_code = content[start_build_metric:end_build_metric]
build_metric_code = build_metric_code.replace('function buildMetricInfo', 'export function buildMetricInfo')

start_rep_widget = content.find('export interface RepWidgetConfig')
end_rep_widget = content.find('interface RepDashboardCustomizerProps')
rep_widget_code = content[start_rep_widget:end_rep_widget]

start_hook = content.find('export function DashboardView({')
end_hook = content.find('  if (isLoading) {', start_hook)

hook_code = content[start_hook:end_hook]
hook_code = hook_code.replace('export function DashboardView({ repName, isAdmin, repEmail, triggerCustomize }: DashboardViewProps) {', 'export function useDashboardData({ repName, isAdmin, repEmail, triggerCustomize }: DashboardViewProps) {')
hook_code = hook_code.replace('useDashboardData(repName)', 'useRawDashboardData(repName)')

# Since we need to wrap actions in useCallback, we could try to rewrite hook_code but it's simpler to just replace `const fetchRepStatsData = async () => {` with `const fetchRepStatsData = useCallback(async () => {`
hook_code = hook_code.replace('const fetchRepStatsData = async () => {', 'const fetchRepStatsData = useCallback(async () => {')
hook_code = hook_code.replace('setRepStatsLoading(false)\n    }\n  }', 'setRepStatsLoading(false)\n    }\n  }, [repStatsSelectedRepId, repStatsPeriod, repStatsStartDate, repStatsEndDate])')

hook_code = hook_code.replace('const fetchCompanyStats = async () => {', 'const fetchCompanyStats = useCallback(async () => {')
hook_code = hook_code.replace('setCompanyLoading(false)\n    }\n  }', 'setCompanyLoading(false)\n    }\n  }, [repStatsPeriod, repStatsStartDate, repStatsEndDate])')

hook_code = hook_code.replace('const calculateHours = (entry: any) => {', 'const calculateHours = useCallback((entry: any) => {')
hook_code = hook_code.replace('return Math.max(0, diffHours).toFixed(1)\n  }', 'return Math.max(0, diffHours).toFixed(1)\n  }, [])')

hook_code = hook_code.replace('const handleToggleClock = async () => {', 'const handleToggleClock = useCallback(async () => {')
hook_code = hook_code.replace('setClockLoading(false)\n    }\n  }', 'setClockLoading(false)\n    }\n  }, [currentUser, clockLoading, timeEntry])')

hook_code = hook_code.replace('const checkForUpdates = async (sig: string, url: string) => {', 'const checkForUpdates = useCallback(async (sig: string, url: string) => {')
hook_code = hook_code.replace('remoteSig !== sig) setUpdateAvailable(true)\n    } catch {}\n  }', 'remoteSig !== sig) setUpdateAvailable(true)\n    } catch {}\n  }, [])')

hook_code = hook_code.replace('const handleUpdateRepWidgets = (updated: RepWidgetConfig[]) => {', 'const handleUpdateRepWidgets = useCallback((updated: RepWidgetConfig[]) => {')
hook_code = hook_code.replace('console.error("Failed to save rep layout", e)\n    }\n  }', 'console.error("Failed to save rep layout", e)\n    }\n  }, [])')

hook_code = hook_code.replace('const isVisible = (id: string) => {', 'const isVisible = useCallback((id: string) => {')
hook_code = hook_code.replace('return repWidgets.find(w => w.id === id)?.visible !== false\n  }', 'return repWidgets.find(w => w.id === id)?.visible !== false\n  }, [repWidgets])')


hook_return = '''
  const goalPct = data && data.weeklyTarget > 0 ? Math.round((data.weeklyTotal / data.weeklyTarget) * 100) : 0

  return {
    currentUser,
    rawData, isLoading, isError, refetch,
    showCompanyWide, setShowCompanyWide,
    timeEntry, setTimeEntry,
    clockLoading, setClockLoading,
    selectedMetricInfo, setSelectedMetricInfo,
    rawInvoicesList, setRawInvoicesList,
    repWidgets, setRepWidgets,
    isRepCustomizerOpen, setIsRepCustomizerOpen,
    repStatsReps, setRepStatsReps,
    repStatsSelectedRepId, setRepStatsSelectedRepId,
    repStatsPeriod, setRepStatsPeriod,
    repStatsStartDate, setRepStatsStartDate,
    repStatsEndDate, setRepStatsEndDate,
    repStatsTotals, setRepStatsTotals,
    repStatsLoading, setRepStatsLoading,
    repStatsModalRep, setRepStatsModalRep,
    repStatsActiveTab, setRepStatsActiveTab,
    repStatsSearchQuery, setRepStatsSearchQuery,
    repStatsTileModalInfo, setRepStatsTileModalInfo,
    updateAvailable, setUpdateAvailable,
    refreshTrigger, setRefreshTrigger,
    companyTotals, setCompanyTotals,
    companyReps, setCompanyReps,
    companyLoading, setCompanyLoading,
    companyTileModal, setCompanyTileModal,
    data,
    repStatsAllInvoices,
    repStatsAllSalesOrders,
    handleUpdateRepWidgets,
    isVisible,
    calculateHours,
    handleToggleClock,
    checkForUpdates,
    fetchRepStatsData,
    fetchCompanyStats,
    goalPct
  }
}
'''

new_hook_content = '''"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { MetricDerivationInfo } from "@/components/MetricDerivationModal"
import { extractProfit, extractCommissionAmount, extractVigRate, extractDeadCostTotal, extractCustomFieldValue } from "@/lib/custom-field-extractor"
import { useDashboardData as useRawDashboardData } from '@/hooks/useDashboardData'

''' + types_code + rep_widget_code + hook_code + hook_return + build_metric_code

with open('src/components/useDashboardData.ts', 'w', encoding='utf-8') as f:
    f.write(new_hook_content)

# Now modify DashboardView.tsx
new_dashboard_start = '''export function DashboardView({ repName, isAdmin, repEmail, triggerCustomize }: DashboardViewProps) {
  const hookData = useDashboardData({ repName, isAdmin, repEmail, triggerCustomize })
  const {
    currentUser,
    rawData, isLoading, isError, refetch,
    showCompanyWide, setShowCompanyWide,
    timeEntry, setTimeEntry,
    clockLoading, setClockLoading,
    selectedMetricInfo, setSelectedMetricInfo,
    rawInvoicesList, setRawInvoicesList,
    repWidgets, setRepWidgets,
    isRepCustomizerOpen, setIsRepCustomizerOpen,
    repStatsReps, setRepStatsReps,
    repStatsSelectedRepId, setRepStatsSelectedRepId,
    repStatsPeriod, setRepStatsPeriod,
    repStatsStartDate, setRepStatsStartDate,
    repStatsEndDate, setRepStatsEndDate,
    repStatsTotals, setRepStatsTotals,
    repStatsLoading, setRepStatsLoading,
    repStatsModalRep, setRepStatsModalRep,
    repStatsActiveTab, setRepStatsActiveTab,
    repStatsSearchQuery, setRepStatsSearchQuery,
    repStatsTileModalInfo, setRepStatsTileModalInfo,
    updateAvailable, setUpdateAvailable,
    refreshTrigger, setRefreshTrigger,
    companyTotals, setCompanyTotals,
    companyReps, setCompanyReps,
    companyLoading, setCompanyLoading,
    companyTileModal, setCompanyTileModal,
    data,
    repStatsAllInvoices,
    repStatsAllSalesOrders,
    handleUpdateRepWidgets,
    isVisible,
    calculateHours,
    handleToggleClock,
    checkForUpdates,
    fetchRepStatsData,
    fetchCompanyStats,
    goalPct
  } = hookData

'''

new_content = content[:start_types] + '''
import { 
  useDashboardData, 
  DashboardViewProps, 
  DashboardData,
  RepWidgetConfig,
  CHART_COLORS,
  formatRepCurrency,
  formatRepDate,
  getStatusBadgeClass,
  buildMetricInfo
} from './useDashboardData'

// --- Custom Tooltip ---
''' + content[end_types:start_hook] + new_dashboard_start + content[end_hook:start_build_metric]

# Keep RepDashboardCustomizer at the end (but it's between build_metric and DEFAULT_REP_DASHBOARD_LAYOUT maybe?)
start_rep_dashboard_customizer = content.find('interface RepDashboardCustomizerProps')
if start_rep_dashboard_customizer != -1:
    new_content += content[start_rep_dashboard_customizer:start_build_metric]

# Write back
with open('src/components/DashboardView.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')
