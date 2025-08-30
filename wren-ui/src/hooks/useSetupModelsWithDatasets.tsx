import { useCallback, useEffect } from 'react';
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

  // For BigQuery, use dataset flow; for others, use regular table listing
  const { data: fallbackData, loading: fallbackLoading } =
    useListDataSourceTablesQuery({
      fetchPolicy: 'no-cache',
      onError: (error) => console.error(error),
      skip: isBigQuery,
    });

  const [saveTablesMutation, { loading: submitting }] = useSaveTablesMutation();

  // Trigger dataset discovery for BigQuery projects
  useEffect(() => {
    const projectId = onboardingData?.onboardingStatus?.projectId;
    if (
      projectId &&
      isBigQuery &&
      !setupFlow.hasDatasets &&
      !setupFlow.hasDatasetError
    ) {
      setupFlow.handleConnectionCreated(projectId);
    }
  }, [onboardingData, isBigQuery, setupFlow]);

  const submitModels = useCallback(
    async (data: SetupModelsNextData) => {
      try {
        await saveTablesMutation({
          variables: {
            data: {
              tables: data.selectedTables,
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

  const handleDatasetChange = useCallback(
    (datasetIds: string[]) => {
      const projectId = onboardingData?.onboardingStatus?.projectId;
      if (projectId) {
        setupFlow.handleDatasetSelection(projectId, datasetIds);
      }
    },
    [onboardingData, setupFlow],
  );

  // Use appropriate tables based on project type
  const tables = isBigQuery
    ? setupFlow.tables
    : fallbackData?.listDataSourceTables || [];
  const fetching = isBigQuery ? setupFlow.loading : fallbackLoading;

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

    // Project type information
    isBigQuery,
    hasDatasets: setupFlow.hasDatasets,
  };
}
