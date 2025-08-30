import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Button,
  Col,
  Form,
  Row,
  Typography,
  Alert,
  Input,
  Spin,
  Collapse,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ERROR_TEXTS } from '@/utils/error';
import MultiSelectBox from '@/components/table/MultiSelectBox';
import { CompactTable } from '@/apollo/client/graphql/__types__';

const { Title, Text } = Typography;
const { Panel } = Collapse;

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

interface Props {
  fetching: boolean;
  tables: CompactTable[];
  datasets?: DatasetInfo[];
  datasetDiscoveryError?: DatasetDiscoveryError;
  onNext: (data: {
    selectedTables: string[];
    selections?: Array<{ datasetId: string; tableName: string }>;
  }) => void;
  onBack: () => void;
  onDatasetChange?: (datasets: string[]) => void;
  submitting: boolean;
  isBigQuery?: boolean;
  selectedDatasets?: string[];
}

const getTableColumns = (hasDatasets: boolean): ColumnsType<CompactTable> => [
  ...(hasDatasets
    ? [
        {
          title: 'Dataset',
          dataIndex: 'dataset',
          render: (_: any, record: CompactTable) =>
            record.properties?.dataset || 'Unknown',
          width: 200,
        },
      ]
    : []),
  {
    title: 'Table name',
    dataIndex: 'name',
  },
];

export default function SelectModels(props: Props) {
  const {
    fetching,
    tables,
    datasets,
    datasetDiscoveryError,
    onBack,
    onNext,
    onDatasetChange,
    submitting,
    isBigQuery,
    selectedDatasets: propsSelectedDatasets,
  } = props;

  const [form] = Form.useForm();
  const [manualDatasets, setManualDatasets] = useState<string[]>([]);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>(
    propsSelectedDatasets || [],
  );

  // Helper function to extract dataset from table metadata
  const extractDatasetFromTable = (table: CompactTable): string => {
    return table.properties?.dataset || 'Unknown Dataset';
  };

  // Check if we have valid dataset context for BigQuery
  const hasValidDatasetContext = () => {
    if (!isBigQuery) return true;

    // For BigQuery, we need tables with dataset properties
    return tables.some((t) => t.properties?.dataset);
  };

  // Initialize form values when selectedDatasets prop changes
  useEffect(() => {
    if (propsSelectedDatasets?.length > 0) {
      form.setFieldsValue({ datasets: propsSelectedDatasets });
    }
  }, [propsSelectedDatasets, form]);

  // Auto-discovery successful - show dataset selection
  const renderDatasetSelection = () => {
    // Only show discovery message when actually discovering or when manual input is required
    if (!datasets?.length && datasetDiscoveryError?.requiresManualInput) {
      return (
        <div className="mb-6">
          <Alert
            message="Dataset Discovery Required"
            description="Please wait while we discover available datasets, or manually enter dataset IDs below."
            type="info"
            showIcon
          />
        </div>
      );
    }

    // If we have datasets, show the selection
    if (datasets?.length) {
      const datasetItems = datasets.map((ds) => ({
        ...ds,
        value: ds.id,
        name: ds.friendlyName || ds.id,
      }));

      return (
        <Form.Item
          name="datasets"
          label="Select Datasets"
          rules={[
            {
              required: true,
              message: 'Please select at least one dataset',
            },
          ]}
        >
          <MultiSelectBox
            columns={[
              { title: 'Dataset ID', dataIndex: 'id' },
              { title: 'Name', dataIndex: 'friendlyName' },
              { title: 'Description', dataIndex: 'description' },
            ]}
            items={datasetItems}
            loading={fetching}
            value={selectedDatasets}
            onChange={(values) => {
              setSelectedDatasets(values);
              form.setFieldsValue({ datasets: values });
              onDatasetChange && onDatasetChange(values);
            }}
          />
        </Form.Item>
      );
    }

    return null;
  };

  // Manual dataset input when auto-discovery fails
  const renderManualDatasetInput = () => {
    // Only show when manual input is explicitly required
    if (!datasetDiscoveryError?.requiresManualInput) return null;

    const handleLoadTables = () => {
      const value = form.getFieldValue('manualDatasets') || '';
      const datasetIds = value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (datasetIds.length === 0) {
        form.setFields([
          {
            name: 'manualDatasets',
            errors: ['Please enter at least one dataset ID'],
          },
        ]);
        return;
      }

      setManualDatasets(datasetIds);
      onDatasetChange && onDatasetChange(datasetIds);
    };

    return (
      <div className="mb-6">
        <Alert
          message="Manual Dataset Input"
          description="Please enter the dataset IDs you want to use. You can find these in your BigQuery console."
          type="warning"
          showIcon
          className="mb-4"
        />
        <Form.Item
          name="manualDatasets"
          label="Dataset IDs"
          rules={[
            {
              required: selectedDatasets.length === 0,
              message: 'Please enter at least one dataset ID',
            },
          ]}
        >
          <Input.TextArea
            placeholder="Enter dataset IDs separated by commas (e.g., dataset1, dataset2)"
            rows={3}
          />
        </Form.Item>
        <Button
          onClick={handleLoadTables}
          loading={fetching}
          type="primary"
          className="mb-4"
        >
          Load Tables
        </Button>
      </div>
    );
  };

  // Group tables by dataset for better organization
  const renderTablesByDataset = () => {
    // Add error display for dataset selection failures
    if (datasetDiscoveryError && !datasetDiscoveryError.requiresManualInput) {
      const isCredentialError =
        datasetDiscoveryError.message.includes('credential') ||
        datasetDiscoveryError.message.includes('Invalid') ||
        datasetDiscoveryError.code === 'INVALID_CREDENTIALS';

      return (
        <div className="text-center py-8">
          <Alert
            message="Dataset Processing Failed"
            description={datasetDiscoveryError.message}
            type="error"
            showIcon
            action={
              <div>
                {isCredentialError && (
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => (window.location.href = '/setup/connection')}
                    className="mr-2"
                  >
                    Back to Connection
                  </Button>
                )}
                <Button size="small" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            }
            className="mb-4"
          />
        </div>
      );
    }

    // Show loading spinner with more context
    if (fetching) {
      return (
        <div className="text-center py-8">
          <Spin size="large" />
          <div className="mt-4 text-gray-500">
            {hasDatasets
              ? 'Loading tables from selected datasets...'
              : 'Loading available tables...'}
          </div>
        </div>
      );
    }

    // If we have datasets but no tables, show a message prompting to select datasets
    if (hasDatasets && !tables.length) {
      if (selectedDatasets.length === 0 && manualDatasets.length === 0) {
        return (
          <div className="text-center py-8 text-gray-500">
            Please select datasets above to view available tables.
          </div>
        );
      }
      return (
        <div className="text-center py-8">
          <Alert
            message="No Tables Found"
            description="No tables found in the selected datasets. Please check your dataset selection or try different datasets."
            type="warning"
            showIcon
            className="mb-4"
          />
        </div>
      );
    }

    // If no datasets are available (non-BigQuery case), show regular table list
    if (!hasDatasets) {
      if (!tables.length) {
        return (
          <div className="text-center py-8">
            <Alert
              message="No Tables Available"
              description="No tables found in your data source. Please check your connection settings."
              type="info"
              showIcon
            />
          </div>
        );
      }
    }

    // If we have tables, render them
    if (tables.length) {
      const tablesByDataset = tables.reduce(
        (acc, table) => {
          const dataset = extractDatasetFromTable(table);
          if (!acc[dataset]) acc[dataset] = [];
          acc[dataset].push(table);
          return acc;
        },
        {} as Record<string, CompactTable[]>,
      );

      const tableItems = tables.map((item) => ({
        ...item,
        value: item.name,
      }));

      // If we have dataset grouping, show in collapsible panels
      if (Object.keys(tablesByDataset).length > 1) {
        return (
          <Collapse ghost>
            {Object.entries(tablesByDataset).map(([dataset, datasetTables]) => (
              <Panel
                key={dataset}
                header={`${dataset} (${datasetTables.length} tables)`}
              >
                <MultiSelectBox
                  columns={getTableColumns(hasDatasets)}
                  items={datasetTables.map((table) => ({
                    ...table,
                    value: table.name,
                  }))}
                  loading={false}
                />
              </Panel>
            ))}
          </Collapse>
        );
      }

      // Single dataset or no dataset grouping, show flat list
      return (
        <MultiSelectBox
          columns={getTableColumns(hasDatasets)}
          items={tableItems}
          loading={fetching}
        />
      );
    }

    // Fallback case
    return (
      <div className="text-center py-8">
        <Alert
          message="Unable to Load Tables"
          description="There was an issue loading tables. Please try refreshing the page or check your connection."
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          }
        />
      </div>
    );
  };

  const submit = () => {
    console.log('=== TABLE SELECTION DEBUG ===');
    console.log('Form selected tables:', form.getFieldValue('tables'));
    console.log(
      'Available table names:',
      tables.map((t) => ({ name: t.name, dataset: t.properties?.dataset })),
    );

    form
      .validateFields()
      .then((values) => {
        // Validate that at least one table is selected
        if (!values.tables || values.tables.length === 0) {
          form.setFields([
            {
              name: 'tables',
              errors: ['Please select at least one table'],
            },
          ]);
          return;
        }

        // Create structured selections for BigQuery multi-dataset scenarios
        const selections: Array<{ datasetId: string; tableName: string }> = [];

        if (isBigQuery && values.tables?.length > 0) {
          // For each selected table, find its dataset and create a structured selection
          values.tables.forEach((tableName: string) => {
            const table = tables.find((t) => t.name === tableName);
            const tableDataset = table?.properties?.dataset;

            if (tableDataset) {
              selections.push({
                datasetId: tableDataset,
                tableName: tableName,
              });
            } else {
              // If table doesn't have dataset property, try to infer from manual datasets
              // This is a fallback for edge cases
              if (manualDatasets.length === 1) {
                selections.push({
                  datasetId: manualDatasets[0],
                  tableName: tableName,
                });
              } else if (selectedDatasets.length === 1) {
                selections.push({
                  datasetId: selectedDatasets[0],
                  tableName: tableName,
                });
              }
            }
          });
        }

        // For BigQuery projects, ensure we have valid selections
        if (isBigQuery && selections.length === 0) {
          form.setFields([
            {
              name: 'tables',
              errors: [
                'Unable to determine dataset context for selected tables. Please try reloading tables.',
              ],
            },
          ]);
          return;
        }

        onNext &&
          onNext({
            selectedTables: values.tables,
            selections: isBigQuery ? selections : undefined,
          });
      })
      .catch((info) => {
        console.log('Validate Failed:', info);
      });
  };

  const hasDatasets = Boolean(
    datasets?.length ||
      datasetDiscoveryError?.requiresManualInput ||
      isBigQuery,
  );
  const pageTitle = hasDatasets
    ? 'Select Datasets and Tables'
    : 'Select tables to create data models';
  const pageDescription = hasDatasets
    ? "Select datasets and tables to create data models. We'll help AI better understand your data structure."
    : 'We will create data models based on selected tables to help AI better understand your data.';

  return (
    <div>
      <Title level={1} className="mb-3">
        {pageTitle}
      </Title>
      <Text>
        {pageDescription}
        <br />
        <Link
          href="https://docs.getwren.ai/oss/guide/modeling/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more
        </Link>{' '}
        about data models.
      </Text>

      <div className="my-6">
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          {/* Dataset Selection */}
          {renderDatasetSelection()}
          {renderManualDatasetInput()}

          {/* Table Selection */}
          <Form.Item
            name="tables"
            label="Select Tables"
            rules={[
              {
                required: tables.length > 0,
                message: ERROR_TEXTS.SETUP_MODEL.TABLE.REQUIRED,
              },
            ]}
          >
            {renderTablesByDataset()}
          </Form.Item>
        </Form>
      </div>

      <Row gutter={16} className="pt-6">
        <Col span={12}>
          <Button
            onClick={onBack}
            size="large"
            className="adm-onboarding-btn"
            disabled={submitting}
          >
            Back
          </Button>
        </Col>
        <Col className="text-right" span={12}>
          <Button
            type="primary"
            size="large"
            onClick={submit}
            className="adm-onboarding-btn"
            loading={submitting}
            disabled={submitting || (isBigQuery && !hasValidDatasetContext())}
          >
            Next
          </Button>
        </Col>
      </Row>
    </div>
  );
}
