export class AlbumError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
