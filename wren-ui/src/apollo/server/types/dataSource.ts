export enum DataSourceName {
  BIG_QUERY = 'BIG_QUERY',
  DUCKDB = 'DUCKDB',
  POSTGRES = 'POSTGRES',
  MYSQL = 'MYSQL',
  ORACLE = 'ORACLE',
  MSSQL = 'MSSQL',
  CLICK_HOUSE = 'CLICK_HOUSE',
  TRINO = 'TRINO',
  SNOWFLAKE = 'SNOWFLAKE',
  ATHENA = 'ATHENA',
  REDSHIFT = 'REDSHIFT',
}

export interface DataSource {
  type: DataSourceName;
  properties: DataSourceProperties;
  sampleDataset?: string;
}

export interface SampleDatasetData {
  name: string;
}

export type DataSourceProperties = { displayName: string } & Partial<
  BigQueryDataSourceProperties &
    DuckDBDataSourceProperties &
    PGDataSourceProperties
>;

export interface BigQueryDataSourceProperties {
  displayName: string;
  projectId: string;
  datasetId?: string; // Optional - will be discovered or specified later
  credentials: JSON;
}

export interface DuckDBDataSourceProperties {
  displayName: string;
  initSql: string;
  extensions: string[];
  configurations: Record<string, any>;
}

export interface PGDataSourceProperties {
  displayName: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

// Dataset discovery types for BigQuery
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

export interface DatasetDiscoveryError {
  code: string;
  message: string;
  requiresManualInput: boolean;
}
