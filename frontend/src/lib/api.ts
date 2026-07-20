export class ApiError extends Error {
	status: number;
	body: { error?: string; errors?: string[] } | null;

	constructor(
		status: number,
		body: { error?: string; errors?: string[] } | null,
	) {
		super(body?.error ?? body?.errors?.join(', ') ?? `APIエラー (${status})`);
		this.status = status;
		this.body = body;
	}
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(path, {
		headers: { 'Content-Type': 'application/json', ...options.headers },
		...options,
	});
	if (!res.ok) {
		throw new ApiError(res.status, await res.json().catch(() => null));
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}
