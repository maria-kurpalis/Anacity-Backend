export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly errors: FieldError[]) {
    super(errors[0]?.message ?? 'Request failed');
    this.name = 'ApiError';
  }
}
