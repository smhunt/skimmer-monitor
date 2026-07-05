/**
 * Minimal Particle Cloud function caller.
 *
 * The firmware's safety interlocks (MAX_FILL_DURATION_MS, MAX_DAILY_FILLS,
 * rate-of-rise abort, battery lockout) are enforced on-device — a cloud
 * function call can request a fill but never bypass those checks.
 */

const API_BASE = "https://api.particle.io/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required for Particle Cloud calls`);
  }
  return value;
}

export async function callParticleFunction(
  fn: string,
  arg = "",
): Promise<{ return_value: number }> {
  const token = requireEnv("PARTICLE_TOKEN");
  const device = requireEnv("PARTICLE_DEVICE");

  const res = await fetch(`${API_BASE}/devices/${device}/${fn}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ arg }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Particle API ${res.status}: ${body}`);
  }
  return (await res.json()) as { return_value: number };
}
