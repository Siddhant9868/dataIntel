import { useEffect, useMemo, useState } from 'react';
import {
  Form,
  Input,
  Button,
  Upload,
  UploadProps,
  message,
  Alert,
  Spin,
  Typography,
  Select,
} from 'antd';
import UploadOutlined from '@ant-design/icons/UploadOutlined';
import { ERROR_TEXTS } from '@/utils/error';
import { FORM_MODE } from '@/utils/enum';
import { readFileContent } from '@/utils/file';

interface Props {
  mode?: FORM_MODE;
}

const UploadCredentials = (props: {
  onChange?: (value: string) => void;
  value?: string;
}) => {
  const { onChange, value } = props;

  const [fileList, setFileList] = useState<UploadProps['fileList']>([]);

  useEffect(() => {
    if (!value) setFileList([]);
  }, [value]);

  const onUploadChange = async (info) => {
    const { file, fileList } = info;
    if (fileList.length) {
      const uploadFile = fileList[0];

      try {
        const result = await readFileContent(file.originFileObj);
        const parsedJson = JSON.parse(result);
        onChange && onChange(parsedJson);
        setFileList([uploadFile]);
      } catch (error) {
        console.error('Failed to handle file', error);
        message.error(
          'Failed to handle file. Please upload a valid credentials file.',
        );
      }
    }
  };

  const onRemove = () => {
    setFileList([]);
    onChange && onChange(undefined);
  };

  return (
    <Upload
      accept=".json"
      fileList={fileList}
      onChange={onUploadChange}
      onRemove={onRemove}
      maxCount={1}
    >
      <Button icon={<UploadOutlined />}>Click to upload JSON key file</Button>
    </Upload>
  );
};

export default function BigQueryProperties(props: Props) {
  const { mode } = props;
  const isEditMode = mode === FORM_MODE.EDIT;
  const form = Form.useFormInstance();

  const [localState, setLocalState] = useState({
    validating: false,
    discovered: [] as { id: string; friendlyName?: string }[],
    discoveryError: null as null | {
      code: string;
      message: string;
      requiresManualInput: boolean;
    },
  });

  const projectId = Form.useWatch('projectId');
  const credentials = Form.useWatch('credentials');

  const triggerDiscovery = async (projectIdValue: string) => {
    if (!projectIdValue || !credentials) return;
    setLocalState((s) => ({
      ...s,
      validating: true,
      discovered: [],
      discoveryError: null,
    }));
    // inform parent to disable Next
    try {
      form?.setFieldsValue?.({ bq_discoveryValidating: true });
    } catch {}

    try {
      const res = await fetch('/api/internal/bigquery/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectIdValue, credentials }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalState((s) => ({
          ...s,
          discovered: data.datasets || [],
          discoveryError: null,
        }));
      } else {
        setLocalState((s) => ({
          ...s,
          discovered: [],
          discoveryError: data.error,
        }));
      }
    } catch (error: any) {
      setLocalState((s) => ({
        ...s,
        discovered: [],
        discoveryError: {
          code: 'DISCOVERY_FAILED',
          message: error?.message || 'Failed to discover datasets',
          requiresManualInput: true,
        },
      }));
    } finally {
      setLocalState((s) => ({ ...s, validating: false }));
      try {
        form?.setFieldsValue?.({ bq_discoveryValidating: false });
      } catch {}
    }
  };

  // When projectId and credentials are present, trigger discovery
  useEffect(() => {
    if (!isEditMode && projectId && credentials) {
      triggerDiscovery(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, credentials]);

  const showManualInput = useMemo(
    () => !!localState.discoveryError?.requiresManualInput,
    [localState.discoveryError],
  );

  return (
    <>
      <Form.Item
        label="Display name"
        required
        name="displayName"
        rules={[
          {
            required: true,
            message: ERROR_TEXTS.CONNECTION.DISPLAY_NAME.REQUIRED,
          },
        ]}
      >
        <Input placeholder="Our BigQuery" />
      </Form.Item>
      <Form.Item
        label="Project ID"
        required
        name="projectId"
        rules={[
          {
            required: !isEditMode,
            message: ERROR_TEXTS.CONNECTION.PROJECT_ID.REQUIRED,
          },
        ]}
      >
        <Input placeholder="The GCP project ID" disabled={isEditMode} />
      </Form.Item>
      <Form.Item
        label="Credentials"
        required={!isEditMode}
        name="credentials"
        rules={[
          {
            required: !isEditMode,
            message: ERROR_TEXTS.CONNECTION.CREDENTIAL.REQUIRED,
          },
        ]}
      >
        <UploadCredentials />
      </Form.Item>

      {/* Inline validation status */}
      {!isEditMode && (projectId || credentials) && (
        <div className="mb-4">
          {localState.validating ? (
            <div className="flex items-center gap-2">
              <Spin size="small" />{' '}
              <Typography.Text>
                Validating BigQuery access and discovering datasets…
              </Typography.Text>
            </div>
          ) : localState.discoveryError ? (
            <Alert
              type="warning"
              showIcon
              message="Dataset Discovery Failed"
              description={
                (localState.discoveryError.message ||
                  'Failed to discover datasets') +
                '. You can specify dataset IDs manually below.'
              }
            />
          ) : localState.discovered.length > 0 ? (
            <Alert
              type="success"
              showIcon
              message={`Discovered ${localState.discovered.length} datasets`}
              description={
                localState.discovered
                  .slice(0, 5)
                  .map((d) => d.friendlyName || d.id)
                  .join(', ') + (localState.discovered.length > 5 ? ' …' : '')
              }
            />
          ) : null}
        </div>
      )}

      {/* Dataset selection when discovery succeeded */}
      {localState.discovered.length > 0 && (
        <Form.Item
          name="selectedDatasets"
          label="Select Datasets"
          rules={[
            { required: true, message: 'Please select at least one dataset' },
          ]}
        >
          <Select
            mode="multiple"
            placeholder="Select datasets"
            options={localState.discovered.map((d) => ({
              value: d.id,
              label: d.friendlyName ? `${d.friendlyName} (${d.id})` : d.id,
            }))}
          />
        </Form.Item>
      )}

      {/* Manual dataset IDs when discovery fails */}
      {showManualInput && (
        <Form.Item
          label="Dataset IDs"
          name="manualDatasets"
          rules={[
            {
              required: true,
              message: 'Please enter at least one dataset ID',
            },
          ]}
          help="Enter dataset IDs separated by commas (e.g., dataset1, dataset2)"
        >
          <Input.TextArea placeholder="dataset1, dataset2, dataset3" />
        </Form.Item>
      )}
    </>
  );
}
