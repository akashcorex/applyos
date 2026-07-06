export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { company_name, ats_type, ats_slug, job_title } = body;

    const res = await fetch('http://127.0.0.1:8001/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_profile: {
          user_id: body.user_id || 'default',
          preferred_role: job_title || '',
          years_experience: 3,
          preferred_locations: [],
        },
        cv_data: {
          full_name: body.full_name || 'User',
          email: body.email || 'user@example.com',
          skills: [],
        },
        targets: [
          {
            company_name,
            ats_type,
            ats_slug,
          },
        ],
        max_jobs_per_company: 1,
        max_total_applies: 1,
        auto_apply: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Orchestrator is unreachable' },
      { status: 502 },
    );
  }
}
