/** 
    This class is responsible for handling the retrieval of metadata from the data source.
    For DuckDB, we control the access logic and directly query the WrenEngine.
    For PostgreSQL and BigQuery, we will use the Ibis server API.
 */

import { IIbisAdaptor } from '../adaptors/ibisAdaptor';
import { IWrenEngineAdaptor } from '../adaptors/wrenEngineAdaptor';
import { Project, BIG_QUERY_CONNECTION_INFO } from '../repositories';
import { DataSourceName, DatasetDiscoveryResult } from '../types';
import { getLogger } from '@server/utils';
import {
  BigQueryDatasetService,
  IbigQueryDatasetService,
} from './bigqueryDatasetService';
import { getConfig } from '../config';
import { Encryptor } from '../utils';

const logger = getLogger('MetadataService');
logger.level = 'debug';

const config = getConfig();
const encryptor = new Encryptor(config);

export interface CompactColumn {
  name: string;
  type: string;
  notNull: boolean;
  description?: string;
  properties?: Record<string, any>;
  nestedColumns?: CompactColumn[];
}

export enum ConstraintType {
  PRIMARY_KEY = 'PRIMARY KEY',
  FOREIGN_KEY = 'FOREIGN KEY',
  UNIQUE = 'UNIQUE',
}

export interface CompactTable {
  name: string;
  columns: CompactColumn[];
  description?: string;
  properties?: Record<string, any>;
  primaryKey?: string;
}

export interface RecommendConstraint {
  constraintName: string;
  constraintType: ConstraintType;
  constraintTable: string;
  constraintColumn: string;
  constraintedTable: string;
  constraintedColumn: string;
}

export interface IDataSourceMetadataService {
  listTables(project: Project): Promise<CompactTable[]>;
  listConstraints(project: Project): Promise<RecommendConstraint[]>;
  getVersion(project: Project): Promise<string>;

  // New methods for dataset discovery
  discoverDatasets(project: Project): Promise<DatasetDiscoveryResult>;
  listTablesFromDatasets(
    project: Project,
    datasetIds: string[],
  ): Promise<CompactTable[]>;
  validateDatasetAccess(
    project: Project,
    datasetIds: string[],
  ): Promise<{ accessible: string[]; inaccessible: string[] }>;
}

export class DataSourceMetadataService implements IDataSourceMetadataService {
  private readonly ibisAdaptor: IIbisAdaptor;
  private readonly wrenEngineAdaptor: IWrenEngineAdaptor;
  private readonly bigQueryDatasetService: IbigQueryDatasetService;

  constructor({
    ibisAdaptor,
    wrenEngineAdaptor,
    bigQueryDatasetService,
  }: {
    ibisAdaptor: IIbisAdaptor;
    wrenEngineAdaptor: IWrenEngineAdaptor;
    bigQueryDatasetService?: IbigQueryDatasetService;
  }) {
    this.ibisAdaptor = ibisAdaptor;
    this.wrenEngineAdaptor = wrenEngineAdaptor;
    this.bigQueryDatasetService =
      bigQueryDatasetService || new BigQueryDatasetService();
  }

  public async listTables(
    project,
    datasetIds?: string[],
  ): Promise<CompactTable[]> {
    const { type: dataSource, connectionInfo } = project;
    if (dataSource === DataSourceName.DUCKDB) {
      const tables = await this.wrenEngineAdaptor.listTables();
      return tables;
    }
    return await this.ibisAdaptor.getTables(
      dataSource,
      connectionInfo,
      datasetIds,
    );
  }

  public async listConstraints(
    project: Project,
  ): Promise<RecommendConstraint[]> {
    const { type: dataSource, connectionInfo } = project;
    if (dataSource === DataSourceName.DUCKDB) {
      return [];
    }
    return await this.ibisAdaptor.getConstraints(dataSource, connectionInfo);
  }

  public async getVersion(project: Project): Promise<string> {
    const { type: dataSource, connectionInfo } = project;
    return await this.ibisAdaptor.getVersion(dataSource, connectionInfo);
  }

  public async discoverDatasets(
    project: Project,
  ): Promise<DatasetDiscoveryResult> {
    const { type: dataSource, connectionInfo } = project;

    if (dataSource !== DataSourceName.BIG_QUERY) {
      throw new Error('Dataset discovery is only supported for BigQuery');
    }

    // Decrypt the connection info to get the actual credentials
    const { credentials, projectId } =
      connectionInfo as BIG_QUERY_CONNECTION_INFO;
    const decryptedCredentials = encryptor.decrypt(credentials);

    // Pass the decrypted JSON string directly - the service will parse it
    return await this.bigQueryDatasetService.discoverDatasets(
      projectId,
      decryptedCredentials,
    );
  }

  public async listTablesFromDatasets(
    project: Project,
    datasetIds: string[],
  ): Promise<CompactTable[]> {
    const { type: dataSource, connectionInfo } = project;

    if (dataSource !== DataSourceName.BIG_QUERY) {
      // For non-BigQuery, fall back to existing behavior
      return await this.listTables(project);
    }

    logger.debug(`Listing tables from ${datasetIds.length} datasets`);

    // Create connection info for each dataset and fetch tables in parallel
    const tableResults = await Promise.all(
      datasetIds.map(async (datasetId) => {
        const datasetConnectionInfo = {
          ...connectionInfo,
          datasetId,
        };

        try {
          const tables = await this.ibisAdaptor.getTables(
            dataSource,
            datasetConnectionInfo,
          );
          // Add dataset info to table metadata for better organization
          return tables.map((table) => ({
            ...table,
            properties: {
              ...table.properties,
              dataset: datasetId,
            },
          }));
        } catch (error) {
          logger.warn(
            `Failed to fetch tables from dataset ${datasetId}: ${error.message}`,
          );
          return [];
        }
      }),
    );

    const allTables = tableResults.flat();
    logger.debug(
      `Retrieved ${allTables.length} total tables from ${datasetIds.length} datasets`,
    );

    return allTables;
  }

  public async validateDatasetAccess(
    project: Project,
    datasetIds: string[],
  ): Promise<{ accessible: string[]; inaccessible: string[] }> {
    const { type: dataSource, connectionInfo } = project;

    if (dataSource !== DataSourceName.BIG_QUERY) {
      // For non-BigQuery, assume all datasets are accessible
      return { accessible: datasetIds, inaccessible: [] };
    }

    // Decrypt the connection info to get the actual credentials
    const { credentials } = connectionInfo as BIG_QUERY_CONNECTION_INFO;
    const decryptedCredentials = encryptor.decrypt(credentials);
    const parsedCredentials = JSON.parse(decryptedCredentials).credentials;

    const { projectId } = connectionInfo as BIG_QUERY_CONNECTION_INFO;

    return await this.bigQueryDatasetService.validateMultipleDatasetAccess(
      projectId,
      datasetIds,
      parsedCredentials,
    );
  }
}
