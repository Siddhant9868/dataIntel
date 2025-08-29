import Link from 'next/link';
import { useState } from 'react';
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
    selectedDatasets?: string[];
    manualDatasets?: string[];
  }) => void;
  onBack: () => void;
  onDatasetChange?: (datasets: string[]) => void;
  submitting: boolean;
}

const columns: ColumnsType<CompactTable> = [
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
  } = props;

  const [form] = Form.useForm();
  const [manualDatasets, setManualDatasets] = useState<string[]>([]);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);

  // Helper function to extract dataset from table metadata
  const extractDatasetFromTable = (table: CompactTable): string => {
    return table.properties?.dataset || 'Unknown Dataset';
  };

  // Auto-discovery successful - show dataset selection
  const renderDatasetSelection = () => {
    if (!datasets?.length) return null;

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
          onChange={(values) => {
            setSelectedDatasets(values);
            onDatasetChange && onDatasetChange(values);
          }}
        />
      </Form.Item>
    );
  };

  // Manual dataset input when auto-discovery fails
  const renderManualDatasetInput = () => {
    if (!datasetDiscoveryError?.requiresManualInput) return null;

    return (
      <div className="mb-6">
        <Alert
          message="Dataset Discovery Failed"
          description={
            datasetDiscoveryError.message +
            '. Please specify dataset IDs manually.'
          }
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
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const datasets = value
                  .split(',')
                  .map((ds) => ds.trim())
                  .filter(Boolean);
                if (datasets.length === 0) {
                  return Promise.reject(
                    new Error('Please enter at least one dataset ID'),
                  );
                }
                return Promise.resolve();
              },
            },
          ]}
          help="Enter dataset IDs separated by commas (e.g., dataset1, dataset2)"
        >
          <Input.TextArea
            placeholder="dataset1, dataset2, dataset3"
            onChange={(e) => {
              const datasets = e.target.value
                .split(',')
                .map((ds) => ds.trim())
                .filter(Boolean);
              setManualDatasets(datasets);
              onDatasetChange && onDatasetChange(datasets);
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
                  columns={columns}
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
          columns={columns}
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
        // For BigQuery projects, ensure datasets are selected if available
        if (hasDatasets && !selectedDatasets.length && !manualDatasets.length) {
          form.setFields([
            {
              name: 'datasets',
              errors: ['Please select at least one dataset'],
            },
          ]);
          return;
        }

        onNext &&
          onNext({
            selectedTables: values.tables,
            selectedDatasets:
              selectedDatasets.length > 0 ? selectedDatasets : undefined,
            manualDatasets:
              manualDatasets.length > 0 ? manualDatasets : undefined,
          });
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const hasDatasets =
    datasets?.length || datasetDiscoveryError?.requiresManualInput;
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
            disabled={
              submitting ||
              (hasDatasets &&
                !selectedDatasets.length &&
                !manualDatasets.length)
            }
          >
            Next
          </Button>
        </Col>
      </Row>
    </div>
  );
}
