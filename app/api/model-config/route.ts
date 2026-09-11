import { NextRequest, NextResponse } from 'next/server';
import { getModelConfig, validateEnv } from '@/lib/config';

/**
 * GET /api/model-config
 * Returns the current model configuration and environment status
 */
export async function GET(request: NextRequest) {
  try {
    const config = getModelConfig();
    const envStatus = validateEnv();

    return NextResponse.json({
      success: true,
      config,
      envStatus,
    });
  } catch (error) {
    console.error('Error fetching model config:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/model-config
 * Saves model configuration (in a real implementation, this would persist to database)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body;

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'config is required' },
        { status: 400 }
      );
    }

    // In a real implementation, you would save this to a database
    // For now, we'll just validate it and return success
    // This is a placeholder for future persistence
    
    return NextResponse.json({
      success: true,
      message: 'Configuration saved (placeholder - implement persistence)',
    });
  } catch (error) {
    console.error('Error saving model config:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}