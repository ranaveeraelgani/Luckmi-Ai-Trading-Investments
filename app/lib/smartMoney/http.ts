import { NextResponse } from 'next/server';

export type SmartMoneyErrorCode =
  | 'FEATURE_DISABLED'
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UPSTREAM_FAILURE'
  | 'INTERNAL_ERROR';

export function isSmartMoneyEnabled(): boolean {
  return process.env.SMART_MONEY_ENABLED !== 'false';
}

export function smartMoneyError(
  message: string,
  status: number,
  code: SmartMoneyErrorCode,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error: message,
      structuredError: {
        code,
        message,
        details: details ?? {},
      },
    },
    { status },
  );
}
