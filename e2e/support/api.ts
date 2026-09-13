import { account } from '../../playwright.config';

type Json = Record<string, unknown>;

// The PocketBase REST API, as a superuser. Seeding goes through it rather than
// through the screens: what a test is about should be the only thing it drives
// with a mouse.
export class AdminApi {
  private token = '';

  public constructor(private readonly baseURL: string) {}

  public async signIn() {
    const body = await this.send('POST', '/api/collections/_superusers/auth-with-password', {
      identity: account.superuser.email,
      password: account.superuser.password,
    });
    this.token = body.token as string;
  }

  public async create(collection: string, data: Json) {
    return this.send('POST', `/api/collections/${collection}/records`, data);
  }

  public async update(collection: string, id: string, data: Json) {
    return this.send('PATCH', `/api/collections/${collection}/records/${id}`, data);
  }

  public async first(collection: string, filter: string) {
    const query = new URLSearchParams({ filter, perPage: '1' });
    const body = await this.send('GET', `/api/collections/${collection}/records?${query}`);
    const items = body.items as Json[];
    return items[0];
  }

  private async send(method: string, path: string, data?: Json) {
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: this.token } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path} -> ${response.status} ${text}`);
    }
    return text ? (JSON.parse(text) as Json) : {};
  }
}
