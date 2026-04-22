// Edge function: fetch-github-activity
//
// Input:  POST { project_id: string }
// Output: { pushed_at, default_branch, html_url, fetched_at, error? }
//
// Flow:
//   1. Verify the caller's JWT via the anon client; read the project row
//      through RLS so non-members can't trigger fetches.
//   2. Parse owner/repo from projects.github_repo_url.
//   3. Read labs.github_pat via the service-role client (bypasses RLS and
//      column grants).
//   4. Call GitHub REST `GET /repos/{owner}/{repo}` with the PAT.
//   5. Upsert into project_repo_status and return the row to the caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RepoIdent = { owner: string; repo: string };

function parseRepoUrl(input: string | null | undefined): RepoIdent | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // https://github.com/OWNER/REPO(.git)(/...)
  const httpsMatch = trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  // git@github.com:OWNER/REPO(.git)
  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  let body: { project_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const projectId = body.project_id?.trim();
  if (!projectId) {
    return jsonResponse({ error: "project_id required" }, 400);
  }

  // 1. Caller-scoped read of the project (RLS enforces lab membership).
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const projectResult = await userClient
    .from("projects")
    .select("id, lab_id, github_repo_url")
    .eq("id", projectId)
    .maybeSingle();

  if (projectResult.error) {
    return jsonResponse({ error: projectResult.error.message }, 400);
  }
  if (!projectResult.data) {
    return jsonResponse({ error: "Project not found or not accessible" }, 404);
  }

  const { lab_id: labId, github_repo_url: repoUrl } = projectResult.data as {
    id: string;
    lab_id: string;
    github_repo_url: string | null;
  };

  const ident = parseRepoUrl(repoUrl);

  // Service-role client for PAT read + status upsert.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const upsertStatus = async (fields: {
    pushed_at?: string | null;
    default_branch?: string | null;
    html_url?: string | null;
    error?: string | null;
  }) => {
    const now = new Date().toISOString();
    const { data, error } = await adminClient
      .from("project_repo_status")
      .upsert(
        {
          project_id: projectId,
          lab_id: labId,
          pushed_at: fields.pushed_at ?? null,
          default_branch: fields.default_branch ?? null,
          html_url: fields.html_url ?? null,
          error: fields.error ?? null,
          fetched_at: now,
        },
        { onConflict: "project_id" }
      )
      .select("project_id, lab_id, pushed_at, default_branch, html_url, error, fetched_at, updated_at")
      .single();
    if (error) throw error;
    return data;
  };

  if (!ident) {
    try {
      const row = await upsertStatus({ error: "Invalid or missing GitHub repo URL" });
      return jsonResponse(row);
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 500);
    }
  }

  // 3. Pull PAT via service role.
  const labResult = await adminClient
    .from("labs")
    .select("github_pat")
    .eq("id", labId)
    .maybeSingle();

  if (labResult.error) {
    return jsonResponse({ error: labResult.error.message }, 500);
  }
  const pat = (labResult.data?.github_pat as string | null | undefined)?.trim();
  if (!pat) {
    try {
      const row = await upsertStatus({ error: "Lab GitHub PAT not configured" });
      return jsonResponse(row, 200);
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 500);
    }
  }

  // 4. GitHub REST call.
  let pushedAt: string | null = null;
  let defaultBranch: string | null = null;
  let htmlUrl: string | null = null;
  let ghError: string | null = null;

  try {
    const ghResp = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(ident.owner)}/${encodeURIComponent(ident.repo)}`,
      {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ilm-fetch-github-activity",
        },
      }
    );
    if (!ghResp.ok) {
      const text = await ghResp.text();
      ghError = `GitHub ${ghResp.status}: ${text.slice(0, 200)}`;
    } else {
      const payload = await ghResp.json();
      pushedAt = typeof payload.pushed_at === "string" ? payload.pushed_at : null;
      defaultBranch = typeof payload.default_branch === "string" ? payload.default_branch : null;
      htmlUrl = typeof payload.html_url === "string" ? payload.html_url : null;
    }
  } catch (err) {
    ghError = `Fetch failed: ${(err as Error).message}`;
  }

  try {
    const row = await upsertStatus({
      pushed_at: pushedAt,
      default_branch: defaultBranch,
      html_url: htmlUrl,
      error: ghError,
    });
    return jsonResponse(row);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
