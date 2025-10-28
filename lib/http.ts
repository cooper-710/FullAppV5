export async function getJSON(res: Response) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
  if (!text) return { ok: true, data: [] };
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON: ${text.slice(0, 200)}`);
  }
}
