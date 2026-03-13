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

export type CreateDto<T> = Omit<T, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'>;
export type UpdateDto<T> = Partial<CreateDto<T>>;
