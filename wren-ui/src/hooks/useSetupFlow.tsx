import { useState, useCallback } from 'react';
import { useLazyQuery } from '@apollo/client';
import { 
  DISCOVER_DATASETS,
  LIST_TABLES_FROM_DATASETS,
  VALIDATE_DATASET_ACCESS 
} from '@/apollo/client/graphql/dataSource';

interface DatasetInfo {
  id: string;
  friendlyName?: string;
  description?: string;
  location?: string;
}

interface DatasetDiscoveryError {
  code: string;
  message: string;
  requiresManualInput: boolean;
}

interface SetupFlowState {
  datasets: DatasetInfo[];
  datasetError: DatasetDiscoveryError | null;
  selectedDatasets: string[];
  tables: any[];
  loading: boolean;
}

export function useSetupFlow() {
  const [state, setState] = useState<SetupFlowState>({
    datasets: [],
    datasetError: null,
    selectedDatasets: [],
    tables: [],
    loading: false,
  });

  const [discoverDatasets, { loading: discoveringDatasets }] = useLazyQuery(
    DISCOVER_DATASETS,
    {
      onCompleted: (data) => {
        const result = data.discoverDatasets;
        if (result.success) {
          setState(prev => ({
            ...prev,
            datasets: result.datasets || [],
            datasetError: null,
          }));
        } else {
          setState(prev => ({
            ...prev,
            datasets: [],
            datasetError: result.error,
          }));
        }
      },
      onError: (error) => {
        setState(prev => ({
          ...prev,
          datasets: [],
          datasetError: {
            code: 'DISCOVERY_FAILED',
            message: error.message || 'Failed to discover datasets',
            requiresManualInput: true,
          },
        }));
      },
    }
  );

  const [fetchTablesFromDatasets, { loading: fetchingTables }] = useLazyQuery(
    LIST_TABLES_FROM_DATASETS,
    {
      onCompleted: (data) => {
        setState(prev => ({
          ...prev,
          tables: data.listTablesFromDatasets || [],
        }));
      },
      onError: (error) => {
        console.error('Failed to fetch tables from datasets:', error);
        setState(prev => ({
          ...prev,
          tables: [],
        }));
      },
    }
  );

  const [validateAccess] = useLazyQuery(VALIDATE_DATASET_ACCESS);

  const handleConnectionCreated = useCallback(async (projectId: number) => {
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      // Attempt dataset discovery for BigQuery connections
      await discoverDatasets({
        variables: { projectId },
      });
    } catch (error) {
      console.error('Dataset discovery failed:', error);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [discoverDatasets]);

  const handleDatasetSelection = useCallback(async (
    projectId: number,
    datasetIds: string[]
  ) => {
    setState(prev => ({ 
      ...prev, 
      selectedDatasets: datasetIds,
      loading: true 
    }));

    try {
      // Validate dataset access
      const accessResult = await validateAccess({
        variables: { projectId, datasetIds },
      });

      const { accessible, inaccessible } = accessResult.data?.validateDatasetAccess || {};
      
      if (inaccessible?.length > 0) {
        console.warn(`No access to datasets: ${inaccessible.join(', ')}`);
      }

      // Fetch tables from accessible datasets
      if (accessible?.length > 0) {
        await fetchTablesFromDatasets({
          variables: { 
            projectId, 
            datasetIds: accessible 
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch tables from datasets:', error);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [validateAccess, fetchTablesFromDatasets]);

  const handleManualDatasetInput = useCallback(async (
    projectId: number,
    datasetIds: string[]
  ) => {
    // Same logic as handleDatasetSelection but for manually entered datasets
    await handleDatasetSelection(projectId, datasetIds);
  }, [handleDatasetSelection]);

  const resetState = useCallback(() => {
    setState({
      datasets: [],
      datasetError: null,
      selectedDatasets: [],
      tables: [],
      loading: false,
    });
  }, []);

  return {
    // State
    datasets: state.datasets,
    datasetError: state.datasetError,
    selectedDatasets: state.selectedDatasets,
    tables: state.tables,
    loading: state.loading || discoveringDatasets || fetchingTables,

    // Actions
    handleConnectionCreated,
    handleDatasetSelection,
    handleManualDatasetInput,
    resetState,

    // Helpers
    hasDatasets: state.datasets.length > 0,
    hasDatasetError: !!state.datasetError,
    requiresManualInput: state.datasetError?.requiresManualInput || false,
  };
} 