// VX plugins "../lib/client.js" se sirf `db` lete hain. Poora VX client yahan nahi chalta —
// sirf VX ka apna settings DB (data/vxdb me) chalta hai.
import WalDBFast from "./database/db-remote.js";

export const db = new WalDBFast({
  dir: "./data/vxdb",
  journalMaxEntries: 50_000,
  compactIntervalMs: 30_000,
});
export default { db };
