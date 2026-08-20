import { loadAbsences } from '../lib/cube.js';

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const start = String(req.query.start || today).slice(0, 10);
  const end = String(req.query.end || start).slice(0, 10);
  const debug = req.query.debug === '1';

  try {
    const data = await loadAbsences({ start, end, debug });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ ok: true, start, end, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
