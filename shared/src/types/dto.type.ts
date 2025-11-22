export type CreateDto<T> = Omit<T, 'id' | 'created' | 'updated'>;
export type UpdateDto<T> = Partial<CreateDto<T>>;
