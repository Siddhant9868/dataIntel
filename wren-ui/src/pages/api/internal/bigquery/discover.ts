import type { NextApiRequest, NextApiResponse } from 'next';

// Shape matches server-side DatasetDiscoveryResult
type DatasetInfo = {
  id: string;
  friendlyName?: string;
  description?: string;
  location?: string;
  creationTime?: string;
  lastModifiedTime?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST is allowed',
        requiresManualInput: false,
      },
    });
  }

  try {
    const { projectId, credentials } = req.body || {};

    if (!projectId || !credentials) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing projectId or credentials',
          requiresManualInput: false,
        },
      });
    }

    // credentials is expected to be the parsed JSON service account object
    const { BigQuery } = await import('@google-cloud/bigquery');

    const bigquery = new BigQuery({
      projectId,
      credentials,
    });

    const [datasets] = await bigquery.getDatasets();

    const datasetInfos: DatasetInfo[] = await Promise.all(
      datasets.map(async (dataset) => {
        try {
          const [metadata] = await dataset.getMetadata();
          return {
            id: dataset.id!,
            friendlyName: metadata.friendlyName,
            description: metadata.description,
            location: metadata.location,
            creationTime: metadata.creationTime,
            lastModifiedTime: metadata.lastModifiedTime,
          };
        } catch (_err: any) {
          return { id: dataset.id! };
        }
      }),
    );

    return res.status(200).json({ success: true, datasets: datasetInfos });
  } catch (error: any) {
    const code = error?.code;
    if (code === 403 || code === 'PERMISSION_DENIED') {
      return res.status(200).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message:
            'Service account lacks permission to list datasets. You can specify dataset IDs manually.',
          requiresManualInput: true,
        },
      });
    }

    if (code === 401 || code === 'UNAUTHENTICATED') {
      return res.status(200).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message:
            'Invalid credentials. Please check your service account key.',
          requiresManualInput: false,
        },
      });
    }

    if (code === 404 || code === 'NOT_FOUND') {
      return res.status(200).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found. Please verify the project ID.',
          requiresManualInput: false,
        },
      });
    }

    return res.status(200).json({
      success: false,
      error: {
        code: 'DISCOVERY_FAILED',
        message:
          error?.message ||
          'Failed to discover datasets. You can specify dataset IDs manually.',
        requiresManualInput: true,
      },
    });
  }
}
