export interface PocketBaseRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
}

export interface Expand<T> extends PocketBaseRecord {
  expand: {
    [K in keyof T]: T[K];
  };
}
