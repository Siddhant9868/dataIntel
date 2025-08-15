import { useCallback, useEffect } from 'react';
import { Path, SETUP } from '@/utils/enum';
import { useRouter } from 'next/router';
import {
  useListDataSourceTablesQuery,
  useSaveTablesMutation,
} from '@/apollo/client/graphql/dataSource.generated';
import { useQuery } from '@apollo/client';
import { ONBOARDING_STATUS } from '@/apollo/client/graphql/onboarding';
import { useSetupFlow } from './useSetupFlow';

interface SetupModelsNextData {
  selectedTables: string[];
  selectedDatasets?: string[];
  manualDatasets?: string[];
}

export default function useSetupModelsWithDatasets() {
  const router = useRouter();
  const setupFlow = useSetupFlow();

  // Get project information to trigger dataset discovery if needed
  const { data: onboardingData } = useQuery(ONBOARDING_STATUS, {
    fetchPolicy: 'cache-and-network',
  });

  // Fallback to regular table listing if dataset flow is not active
  const { data: fallbackData, loading: fallbackLoading } = useListDataSourceTablesQuery({
    fetchPolicy: 'no-cache',
    onError: (error) => console.error(error),
    skip: setupFlow.hasDatasets || setupFlow.hasDatasetError,
  });

  const [saveTablesMutation, { loading: submitting }] = useSaveTablesMutation();

  // Trigger dataset discovery when component mounts if we have a BigQuery project
  useEffect(() => {
    const projectId = onboardingData?.onboardingStatus?.projectId;
    if (projectId && !setupFlow.hasDatasets && !setupFlow.hasDatasetError) {
      // Try to trigger dataset discovery for BigQuery projects
      // This will only work if it's a BigQuery connection
      setupFlow.handleConnectionCreated(projectId);
    }
  }, [onboardingData, setupFlow]);

  const submitModels = useCallback(async (data: SetupModelsNextData) => {
    try {
      await saveTablesMutation({
        variables: {
          data: {
            tables: data.selectedTables,
            selectedDatasets: data.selectedDatasets,
            manualDatasets: data.manualDatasets,
          },
        },
      });
      router.push(Path.OnboardingRelationships);
    } catch (error) {
      console.error('Failed to save tables:', error);
      throw error;
    }
  }, [saveTablesMutation, router]);

  const onBack = useCallback(() => {
    router.push(Path.OnboardingConnection);
  }, [router]);

  const onNext = useCallback((data: SetupModelsNextData) => {
    submitModels(data);
  }, [submitModels]);

  // Use dataset flow tables if available, otherwise fallback to regular listing
  const tables = setupFlow.hasDatasets || setupFlow.hasDatasetError 
    ? setupFlow.tables 
    : (fallbackData?.listDataSourceTables || []);

  const fetching = setupFlow.hasDatasets || setupFlow.hasDatasetError
    ? setupFlow.loading
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
    onDatasetChange: setupFlow.handleDatasetSelection,
    
    // State helpers
    hasDatasets: setupFlow.hasDatasets,
    requiresManualInput: setupFlow.requiresManualInput,
  };
} 