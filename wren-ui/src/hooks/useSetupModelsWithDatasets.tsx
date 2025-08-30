import { useCallback, useEffect, useMemo } from 'react';
import { Path, SETUP } from '@/utils/enum';
import { useRouter } from 'next/router';
import {
  useListDataSourceTablesQuery,
  useSaveTablesMutation,
} from '@/apollo/client/graphql/dataSource.generated';
import { useQuery } from '@apollo/client';
import { ONBOARDING_STATUS } from '@/apollo/client/graphql/onboarding';
import { GET_SETTINGS } from '@/apollo/client/graphql/settings';
import { DataSourceName } from '@/apollo/client/graphql/__types__';
import { useSetupFlow } from './useSetupFlow';

interface SetupModelsNextData {
  selectedTables: string[];
  selectedDatasets?: string[];
  manualDatasets?: string[];
  selections?: Array<{ datasetId: string; tableName: string }>;
}

export default function useSetupModelsWithDatasets() {
  const router = useRouter();
  const setupFlow = useSetupFlow();

  // Get project information
  const { data: onboardingData } = useQuery(ONBOARDING_STATUS, {
    fetchPolicy: 'cache-and-network',
  });

  // Get project type to determine if it's BigQuery
  const { data: settingsData } = useQuery(GET_SETTINGS, {
    fetchPolicy: 'cache-and-network',
  });

  const isBigQuery =
    settingsData?.settings?.dataSource?.type === DataSourceName.BIG_QUERY;

  const getStoredDatasetIds = useCallback(() => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem('wren:selectedDatasets');
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length > 0 ? (arr as string[]) : null;
    } catch {
      return null;
    }
  }, []);

  // Avoid fallback query when dataset flow is active (loading, have selected datasets, or tables fetched)
  const datasetFlowActive = useMemo(() => {
    const hasStoredDatasets = !!getStoredDatasetIds();
    return (
      setupFlow.loading ||
      (setupFlow.selectedDatasets && setupFlow.selectedDatasets.length > 0) ||
      (setupFlow.tables && setupFlow.tables.length > 0) ||
      !!setupFlow.hasDatasets ||
      !!setupFlow.hasDatasetError ||
      hasStoredDatasets
    );
  }, [
    setupFlow.loading,
    setupFlow.selectedDatasets,
    setupFlow.tables,
    setupFlow.hasDatasets,
    setupFlow.hasDatasetError,
    getStoredDatasetIds,
  ]);

  // Fallback to regular table listing only if dataset flow is NOT active
  const { data: fallbackData, loading: fallbackLoading } =
    useListDataSourceTablesQuery({
      fetchPolicy: 'no-cache',
      onError: (error) => console.error(error),
      skip: datasetFlowActive || isBigQuery,
    });

  const [saveTablesMutation, { loading: submitting }] = useSaveTablesMutation();

  // Trigger dataset discovery only if we didn't already select datasets during connection
  useEffect(() => {
    const projectId = onboardingData?.onboardingStatus?.projectId;
    const stored = getStoredDatasetIds();
    if (
      projectId &&
      !stored &&
      !setupFlow.hasDatasets &&
      !setupFlow.hasDatasetError
    ) {
      setupFlow.handleConnectionCreated(projectId);
    }
  }, [
    onboardingData,
    setupFlow.hasDatasets,
    setupFlow.hasDatasetError,
    setupFlow.handleConnectionCreated,
    getStoredDatasetIds,
  ]);

  // If dataset IDs were selected during connection, trigger table fetch immediately and clear storage
  useEffect(() => {
    const projectId = onboardingData?.onboardingStatus?.projectId;
    if (!projectId) return;

    const stored = getStoredDatasetIds();
    if (stored) {
      // Add error boundary and logging
      console.log('Processing stored datasets:', stored);

      setupFlow
        .handleDatasetSelection(projectId, stored)
        .then(() => {
          console.log('Successfully processed stored datasets');
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('wren:selectedDatasets');
            }
          } catch (e) {
            console.warn('Failed to clear localStorage:', e);
          }
        })
        .catch((error) => {
          console.error('Failed to process stored datasets:', error);
          // Don't clear localStorage on error so user can retry
        });
    }
  }, [onboardingData, setupFlow.handleDatasetSelection, getStoredDatasetIds]);

  const submitModels = useCallback(
    async (data: SetupModelsNextData) => {
      try {
        await saveTablesMutation({
          variables: {
            data: {
              tables: data.selectedTables,
              selectedDatasets: data.selectedDatasets,
              manualDatasets: data.manualDatasets,
              selections: data.selections,
            },
          },
        });
        router.push(Path.OnboardingRelationships);
      } catch (error) {
        console.error('Failed to save tables:', error);
        throw error;
      }
    },
    [saveTablesMutation, router],
  );

  const onBack = useCallback(() => {
    router.push(Path.OnboardingConnection);
  }, [router]);

  const onNext = useCallback(
    (data: SetupModelsNextData) => {
      submitModels(data);
    },
    [submitModels],
  );

  // Wrapper to inject projectId for dataset change events from the page
  const handleDatasetChange = useCallback(
    (datasetIds: string[]) => {
      const projectId = onboardingData?.onboardingStatus?.projectId;
      if (projectId) {
        setupFlow.handleDatasetSelection(projectId, datasetIds);
      }
    },
    [onboardingData, setupFlow],
  );

  // Add development debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const storedDatasets = getStoredDatasetIds();
      console.log('SetupFlow Debug:', {
        timestamp: new Date().toISOString(),
        hasOnboardingData: !!onboardingData,
        projectId: onboardingData?.onboardingStatus?.projectId,
        hasStoredDatasets: !!storedDatasets,
        storedDatasets: storedDatasets,
        setupFlowState: {
          loading: setupFlow.loading,
          selectedDatasets: setupFlow.selectedDatasets,
          tables: setupFlow.tables?.length || 0,
          hasDatasets: setupFlow.hasDatasets,
          hasDatasetError: setupFlow.hasDatasetError,
          datasetError: setupFlow.datasetError,
        },
        datasetFlowActive,
        fallbackDataActive: !datasetFlowActive,
        fallbackTablesCount: fallbackData?.listDataSourceTables?.length || 0,
        calculatedHasDatasets: setupFlow.hasDatasets || !!storedDatasets,
      });
    }
  }, [
    onboardingData,
    getStoredDatasetIds,
    setupFlow,
    datasetFlowActive,
    fallbackData,
  ]);

  // Prefer dataset-flow tables when active
  const tables = datasetFlowActive
    ? setupFlow.tables
    : isBigQuery
      ? [] // For BigQuery, always return empty array if dataset flow not active
      : fallbackData?.listDataSourceTables || [];

  const fetching = datasetFlowActive
    ? setupFlow.loading
    : isBigQuery
      ? false // Not fetching for BigQuery when dataset flow not active
      : fallbackLoading;

  return {
    // Setup flow data
    datasets: setupFlow.datasets,
    datasetDiscoveryError: setupFlow.datasetError,
    selectedDatasets: setupFlow.selectedDatasets,

    // Standard setup props
    stepKey: SETUP.SELECT_MODELS,
    tables,
    fetching,
    submitting,
    onBack,
    onNext,

    // Dataset change handlers
    onDatasetChange: handleDatasetChange,

    // State helpers - include stored datasets in hasDatasets calculation
    hasDatasets: setupFlow.hasDatasets || !!getStoredDatasetIds(),
    requiresManualInput: setupFlow.requiresManualInput,
  };
}
