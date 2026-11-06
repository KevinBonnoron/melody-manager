export type CreateDto<T> = Omit<T, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'>;
export type UpdateDto<T> = Partial<CreateDto<T>>;
