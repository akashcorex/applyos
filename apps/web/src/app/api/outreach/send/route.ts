export async function POST() {
  return Response.json(
    { error: 'Email outreach is not implemented' },
    { status: 501 },
  );
}
