import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
import pdf from 'pdf-parse/lib/pdf-parse.js';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdf(buffer);

    const text = data.text
      // line-ending + invisible-char cleanup
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\f/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // force each UUID header onto its own line
      .replace(
        /(\d+\.\s*)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (m: string) => '\n' + m
      )
      // force each speaker label onto its own line
      .replace(/\s*(BOT\s*:|USER\s*:|Assistant\s*:|User\s*:)/g, '\n$1')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return NextResponse.json({
      text,
      pages: data.numpages,
      chars: text.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'PDF parse failed' }, { status: 500 });
  }
}