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

  // Check if we have valid dataset context (either selected datasets or tables with dataset properties)
  const hasValidDatasetContext = () => {
    if (!isBigQuery) return true;

    // Check if datasets are explicitly selected
    if (selectedDatasets.length > 0 || manualDatasets.length > 0) return true;

    // Check if tables have dataset properties (from previous selection)
    if (tables.some((t) => t.properties?.dataset)) return true;

    return false;
  };

  // Initialize form values when selectedDatasets prop changes
  useEffect(() => {
    if (propsSelectedDatasets?.length > 0) {
      form.setFieldsValue({ datasets: propsSelectedDatasets });
    }
  }, [propsSelectedDatasets, form]);

  // Auto-discovery successful - show dataset selection
  const renderDatasetSelection = () => {
    // Always show for BigQuery projects, even if no datasets discovered yet
    if (!datasets?.length && !isBigQuery) return null;

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

    // For BigQuery without discovered datasets, show a message
    if (isBigQuery) {
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

    return null;
  };

  // Manual dataset input when auto-discovery fails
  const renderManualDatasetInput = () => {
    // Always show for BigQuery projects, even if no error
    if (!datasetDiscoveryError?.requiresManualInput && !isBigQuery) return null;

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
              required: true,
              message: 'Please enter at least one dataset ID',
            },
          ]}
        >
          <Input.TextArea
            placeholder="Enter dataset IDs separated by commas (e.g., dataset1, dataset2)"
            rows={3}
            onChange={(e) => {
              const value = e.target.value;
              const datasetIds = value
                .split(',')
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
              setManualDatasets(datasetIds);

              // Trigger table fetch when datasets are entered
              if (datasetIds.length > 0 && onDatasetChange) {
                onDatasetChange(datasetIds);
              }
            }}
          />
        </Form.Item>
      </div>
    );
  };

  // Group tables by dataset for better organization
  const renderTablesByDataset = () => {
    // Add error display for dataset selection failures
    if (datasetDiscoveryError && !datasetDiscoveryError.requiresManualInput) {
      return (
        <div className="text-center py-8">
          <Alert
            message="Dataset Processing Failed"
            description={datasetDiscoveryError.message}
            type="error"
            showIcon
            action={
              <Button size="small" onClick={() => window.location.reload()}>
                Retry
              </Button>
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

        // For BigQuery projects, ensure datasets are selected if available
        if (isBigQuery && !selectedDatasets.length && !manualDatasets.length) {
          // Check if we can build selections from table properties
          let canBuildSelections = false;
          if (values.tables?.length > 0) {
            canBuildSelections = values.tables.some((tableName: string) => {
              const table = tables.find((t) => t.name === tableName);
              return table?.properties?.dataset;
            });
          }

          if (!canBuildSelections) {
            form.setFields([
              {
                name: 'datasets',
                errors: ['Please select at least one dataset'],
              },
            ]);
            return;
          }
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
            }
          });
        }

        onNext &&
          onNext({
            selectedTables: values.tables,
            selections: selections.length > 0 ? selections : undefined,
          });
      })
      .catch((error) => {
        console.error(error);
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

          {/* Show message when BigQuery requires dataset selection first */}
          {isBigQuery && !hasValidDatasetContext() && (
            <Alert
              message="Dataset Selection Required"
              description="Please select or enter datasets above before selecting tables."
              type="info"
              showIcon
              className="mb-4"
            />
          )}
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
