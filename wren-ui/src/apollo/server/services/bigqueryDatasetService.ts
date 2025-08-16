import { getLogger } from '@server/utils';

const logger = getLogger('BigQueryDatasetService');

export interface DatasetInfo {
  id: string;
  friendlyName?: string;
  description?: string;
  location?: string;
  creationTime?: string;
  lastModifiedTime?: string;
}

export interface DatasetDiscoveryResult {
  success: boolean;
  datasets?: DatasetInfo[];
  error?: {
    code: string;
    message: string;
    requiresManualInput: boolean;
  };
}

export interface IbigQueryDatasetService {
  discoverDatasets(
    projectId: string,
    credentials: string,
  ): Promise<DatasetDiscoveryResult>;
  validateDatasetAccess(
    projectId: string,
    datasetId: string,
    credentials: string,
  ): Promise<boolean>;
  validateMultipleDatasetAccess(
    projectId: string,
    datasetIds: string[],
    credentials: string,
  ): Promise<{ accessible: string[]; inaccessible: string[] }>;
}

export class BigQueryDatasetService implements IbigQueryDatasetService {
  // Discover all accessible datasets in a BigQuery project
  async discoverDatasets(
    projectId: string,
    credentials: string,
  ): Promise<DatasetDiscoveryResult> {
    try {
      logger.debug(`Attempting to discover datasets for project: ${projectId}`);

      // Validate and parse credentials with better error handling
      let parsedCredentials;
      try {
        // First, try to decode from base64
        const decodedCredentials = Buffer.from(
          credentials,
          'base64',
        ).toString();
        logger.debug(
          `Decoded credentials length: ${decodedCredentials.length}`,
        );

        // Try to parse as JSON
        parsedCredentials = JSON.parse(decodedCredentials);
        logger.debug('Successfully parsed credentials as JSON');
      } catch (parseError: any) {
        logger.error(`Failed to parse credentials: ${parseError.message}`);

        // Check if credentials might already be a JSON string
        try {
          parsedCredentials = JSON.parse(credentials);
          logger.debug('Credentials were already JSON, not base64 encoded');
        } catch (jsonError: any) {
          logger.error(
            `Credentials are neither valid base64+JSON nor direct JSON: ${jsonError.message}`,
          );
          return {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message:
                'Invalid credentials format. Please check your service account key format.',
              requiresManualInput: false,
            },
          };
        }
      }

      // Import BigQuery client dynamically to avoid dependency issues
      const { BigQuery } = await import('@google-cloud/bigquery');

      const bigquery = new BigQuery({
        projectId,
        credentials: parsedCredentials,
      });

      // Attempt to list datasets
      const [datasets] = await bigquery.getDatasets();

      logger.debug(`Successfully discovered ${datasets.length} datasets`);

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
          } catch (error: any) {
            // If we can't get metadata for a specific dataset, return basic info
            logger.debug(
              `Could not get metadata for dataset ${dataset.id}: ${error.message}`,
            );
            return {
              id: dataset.id!,
            };
          }
        }),
      );

      return {
        success: true,
        datasets: datasetInfos,
      };
    } catch (error: any) {
      logger.error(`Dataset discovery failed: ${error.message}`);

      // Handle specific BigQuery API errors
      if (error.code === 403 || error.code === 'PERMISSION_DENIED') {
        return {
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message:
              'Service account lacks permission to list datasets. You can specify dataset IDs manually.',
            requiresManualInput: true,
          },
        };
      }

      if (error.code === 401 || error.code === 'UNAUTHENTICATED') {
        return {
          success: false,
          error: {
            code: 'AUTHENTICATION_FAILED',
            message:
              'Invalid credentials. Please check your service account key.',
            requiresManualInput: false,
          },
        };
      }

      if (error.code === 404 || error.code === 'NOT_FOUND') {
        return {
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found. Please verify the project ID.',
            requiresManualInput: false,
          },
        };
      }

      // Generic error fallback
      return {
        success: false,
        error: {
          code: 'DISCOVERY_FAILED',
          message:
            error.message ||
            'Failed to discover datasets. You can specify dataset IDs manually.',
          requiresManualInput: true,
        },
      };
    }
  }

  // Validate access to a specific dataset
  async validateDatasetAccess(
    projectId: string,
    datasetId: string,
    credentials: string,
  ): Promise<boolean> {
    try {
      logger.debug(`Validating access to dataset: ${projectId}.${datasetId}`);

      const { BigQuery } = await import('@google-cloud/bigquery');

      const bigquery = new BigQuery({
        projectId,
        credentials: JSON.parse(Buffer.from(credentials, 'base64').toString()),
      });

      const dataset = bigquery.dataset(datasetId);
      await dataset.getMetadata();

      logger.debug(`Access validated for dataset: ${datasetId}`);
      return true;
    } catch (error: any) {
      logger.debug(
        `Access validation failed for dataset ${datasetId}: ${error.message}`,
      );
      return false;
    }
  }

  // Validate access to multiple datasets and return accessible/inaccessible lists
  async validateMultipleDatasetAccess(
    projectId: string,
    datasetIds: string[],
    credentials: string,
  ): Promise<{ accessible: string[]; inaccessible: string[] }> {
    logger.debug(`Validating access to ${datasetIds.length} datasets`);

    const results = await Promise.all(
      datasetIds.map(async (datasetId) => ({
        datasetId,
        accessible: await this.validateDatasetAccess(
          projectId,
          datasetId,
          credentials,
        ),
      })),
    );

    const accessible = results
      .filter((r) => r.accessible)
      .map((r) => r.datasetId);
    const inaccessible = results
      .filter((r) => !r.accessible)
      .map((r) => r.datasetId);

    logger.debug(
      `Dataset access validation complete: ${accessible.length} accessible, ${inaccessible.length} inaccessible`,
    );

    return { accessible, inaccessible };
  }
}
