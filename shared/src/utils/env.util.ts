type EnvResolver = (name: string) => string | undefined;

class EnvEntry {
  private readonly value: string | undefined;
  private readonly name: string;

  public constructor(name: string, value: string | undefined) {
    this.name = name;
    this.value = value;
  }

  public string(defaultValue: string): string {
    return this.value ?? defaultValue;
  }

  public number(defaultValue: number): number {
    if (!this.value) {
      return defaultValue;
    }
    const normalized = this.value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new Error(`Invalid numeric value for ${this.name}: ${this.value}`);
    }
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Invalid numeric value for ${this.name}: ${this.value}`);
    }
    return parsed;
  }

  public boolean(defaultValue: boolean): boolean {
    if (!this.value) {
      return defaultValue;
    }
    return this.value === 'true';
  }
}

export function createEnv(resolver: EnvResolver) {
  return (name: string) => new EnvEntry(name, resolver(name));
}
