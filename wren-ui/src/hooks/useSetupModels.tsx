import { useState } from 'react';
import { Path, SETUP } from '@/utils/enum';
import { useRouter } from 'next/router';
import {
  useListDataSourceTablesQuery,
  useSaveTablesMutation,
} from '@/apollo/client/graphql/dataSource.generated';

export default function useSetupModels() {
  const [stepKey] = useState(SETUP.SELECT_MODELS);

  const router = useRouter();

  const { data, loading: fetching } = useListDataSourceTablesQuery({
    fetchPolicy: 'no-cache',
    onError: (error) => console.error(error),
  });

  // Handle errors via try/catch blocks rather than onError callback
  const [saveTablesMutation, { loading: submitting }] = useSaveTablesMutation();

  const submitModels = async (data: {
    selectedTables: string[];
    selectedDatasets?: string[];
    manualDatasets?: string[];
    selections?: Array<{ datasetId: string; tableName: string }>;
  }) => {
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
      console.error(error);
    }
  };

  const onBack = () => {
    router.push(Path.OnboardingConnection);
  };

  const onNext = (data: {
    selectedTables: string[];
    selectedDatasets?: string[];
    manualDatasets?: string[];
    selections?: Array<{ datasetId: string; tableName: string }>;
  }) => {
    submitModels(data);
  };

  return {
    submitting,
    fetching,
    stepKey,
    onBack,
    onNext,
    tables: data?.listDataSourceTables || [],
  };
}
