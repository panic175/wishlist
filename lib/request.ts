import { NextRequest } from 'next/server';

/**
 * Safely parse a JSON request body. Returns null when the body is missing,
 * empty, or not valid JSON, so route handlers can return a 400 instead of
 * unhandled-promise exceptions (500s).
 */
export async function parseJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}