import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { SqlRow } from "@buy-local-sparta/core";
import { getPublicSurveyPostgresRuntime, productionDatabaseConfigured } from "../lib/postgres-runtime";
import styles from "./ResearchFieldworkInsights.module.css";

type Bucket = { count: number; date?: string; dow?: number; slot?: number };
type FieldworkStats = {
  started: number;
  completed: number;
  validDurations: number;
  medianSeconds: number | null;
  daily: Bucket[];
  weekdays: Bucket[];
  hours: Bucket[];
  durations: Bucket[];
};

const readFieldworkStats = unstable_cache(
  async (studyId: string, waveId: string): Promise<FieldworkStats | null> => {
    // One bounded, aggregate-only query. Never send response IDs, email, answers or
    // exact timestamps to the public UI. The pilot is excluded explicitly.
    const result = await getPublicSurveyPostgresRuntime().sqlPool.query<SqlRow>(`
      WITH base AS MATERIALIZED (
        SELECT r.started_at AT TIME ZONE 'Europe/Athens' AS local_start,
               r.status, r.duration_seconds
        FROM research_responses r
        JOIN research_invites i ON i.id = r.invite_id
        WHERE r.study_id = $1 AND r.wave_id = $2 AND i.fieldwork_phase = 'main'
      ),
      duration_base AS (
        SELECT duration_seconds FROM base
        WHERE status = 'completed' AND duration_seconds BETWEEN 1 AND 86400
      )
      SELECT
        (SELECT count(*) FROM base)::int AS started,
        (SELECT count(*) FROM base WHERE status = 'completed')::int AS completed,
        (SELECT count(*) FROM duration_base)::int AS valid_durations,
        (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds))
         FROM duration_base) AS median_seconds,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('date', date_key, 'count', n) ORDER BY date_key), '[]'::jsonb)
         FROM (SELECT local_start::date AS date_key, count(*)::int AS n
               FROM base WHERE local_start IS NOT NULL GROUP BY 1) d) AS daily,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'count', n) ORDER BY dow), '[]'::jsonb)
         FROM (SELECT extract(isodow FROM local_start)::int AS dow, count(*)::int AS n
               FROM base WHERE local_start IS NOT NULL GROUP BY 1) d) AS weekdays,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'count', n) ORDER BY slot), '[]'::jsonb)
         FROM (SELECT floor(extract(hour FROM local_start) / 3)::int AS slot, count(*)::int AS n
               FROM base WHERE local_start IS NOT NULL GROUP BY 1) d) AS hours,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'count', n) ORDER BY slot), '[]'::jsonb)
         FROM (SELECT CASE
                        WHEN duration_seconds < 300 THEN 0
                        WHEN duration_seconds < 600 THEN 1
                        WHEN duration_seconds < 1200 THEN 2
                        WHEN duration_seconds < 2400 THEN 3
                        WHEN duration_seconds < 3600 THEN 4
                        ELSE 5 END AS slot, count(*)::int AS n
               FROM duration_base GROUP BY 1) d) AS durations
    `, [studyId, waveId]);
    const row = result.rows[0];
    if (!row) return null;
    const buckets = (key: string): Bucket[] =>
      Array.isArray(row[key])
        ? (row[key] as Record<string, unknown>[]).map((item) => ({
            count: Math.max(0, Number(item.count) || 0),
            ...(typeof item.date === "string" ? { date: item.date } : {}),
            ...(item.dow !== undefined ? { dow: Number(item.dow) } : {}),
            ...(item.slot !== undefined ? { slot: Number(item.slot) } : {})
          }))
        : [];
    return {
      started: Number(row.started) || 0,
      completed: Number(row.completed) || 0,
      validDurations: Number(row.valid_durations) || 0,
      medianSeconds: row.median_seconds == null ? null : Number(row.median_seconds),
      daily: buckets("daily"),
      weekdays: buckets("weekdays"),
      hours: buckets("hours"),
      durations: buckets("durations")
    };
  },
  ["greek-retail-fieldwork-behaviour-v1"],
  { revalidate: 300 }
);

const weekdays = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"];
const durationLabels = ["<5′", "5–10′", "10–20′", "20–40′", "40–60′", "1–24 ώ."];
const format = (value: number) => value.toLocaleString("el-GR");
const barHeight = (value: number, max: number) =>
  `${Math.max(3, Math.round(100 * value / Math.max(1, max)))}%`;

function MiniChart({ title, subtitle, labels, values }: {
  title: string; subtitle: string; labels: string[]; values: number[];
}) {
  const max = Math.max(1, ...values);
  return <article className={styles.chartPanel}>
    <h3>{title}</h3>
    <p>{subtitle}</p>
    <div className={styles.miniBars} role="img" aria-label={`${title}: ${labels.map((label, i) => `${label}, ${format(values[i] ?? 0)}`).join("; ")}`}>
      {labels.map((label, i) => <div className={styles.miniItem} key={label}>
        <div className={styles.miniTrack}>
          <span className={styles.miniFill} style={{ height: barHeight(values[i] ?? 0, max) }}
            title={`${label}: ${format(values[i] ?? 0)}`} />
        </div>
        <strong>{label}</strong>
      </div>)}
    </div>
  </article>;
}

export async function ResearchFieldworkInsights({ studyId, waveId }: {
  studyId: string; waveId: string;
}) {
  let stats: FieldworkStats | null = null;
  if (productionDatabaseConfigured()) {
    try {
      stats = await readFieldworkStats(studyId, waveId);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code) : "unavailable";
      console.warn("research.public_fieldwork_analytics_unavailable", { code });
    }
  }

  const dates = stats?.daily ?? [];
  const maxDay = Math.max(1, ...dates.map((entry) => entry.count));
  const median = stats?.medianSeconds != null
    ? `${Math.floor(stats.medianSeconds / 60)}′ ${String(Math.round(stats.medianSeconds % 60)).padStart(2, "0")}″`
    : null;

  return <section className={styles.section} id="fieldwork-behaviour" aria-labelledby="fieldwork-title">
    <div className={styles.head}>
      <div>
        <span className={styles.eyebrow}>Η διαδικασία πίσω από τη μελέτη</span>
        <h2 id="fieldwork-title">Πώς συμμετείχαν οι επιχειρήσεις</h2>
      </div>
      <p>Μια εικόνα της διαδρομής του ερωτηματολογίου: πότε ξεκίνησαν οι συμμετοχές και πόσο διήρκεσε η καταγεγραμμένη συμπλήρωση. <strong>Δεν παρουσιάζονται απαντήσεις ή ευρήματα.</strong></p>
    </div>

    {stats && stats.started > 0 ? <>
      <div className={styles.metrics}>
        <div><span>Ενάρξεις κύριας συλλογής</span><strong>{format(stats.started)}</strong><small>Εξαιρείται η πιλοτική φάση</small></div>
        <div><span>Καταγεγραμμένες ολοκληρώσεις</span><strong>{format(stats.completed)}</strong><small>Περιλαμβάνονται τεκμηριωμένες διαχειριστικές οριστικοποιήσεις</small></div>
        <div><span>Διάμεσος καταγεγραμμένος χρόνος</span><strong>{median ?? "—"}</strong><small>{format(stats.validDurations)} ολοκληρώσεις με διάρκεια έως 24 ώρες</small></div>
      </div>

      <article className={styles.dailyPanel}>
        <div className={styles.chartHeading}>
          <div><h3>Η συμμετοχή στον χρόνο</h3><p>Ημερήσιες ενάρξεις ερωτηματολογίων · ώρα Ελλάδας</p></div>
          <span>Κύρια έρευνα 2026</span>
        </div>
        <div className={styles.dailyScroll}>
          <div className={styles.dailyBars} role="img"
            aria-label={`Ενάρξεις ανά ημέρα: ${dates.map((entry) => `${entry.date}: ${format(entry.count)}`).join("; ")}`}>
            {dates.map((entry, i) => <div className={styles.dailyItem} key={entry.date}>
              <span className={styles.dailyNumber}>{entry.count}</span>
              <div className={styles.dailyTrack}>
                <span className={styles.dailyFill} style={{ height: barHeight(entry.count, maxDay) }}
                  title={`${entry.date}: ${format(entry.count)} ενάρξεις`} />
              </div>
              <span className={styles.dailyDate}>
                {i % 3 === 0 || i === dates.length - 1
                  ? (entry.date ?? "").slice(8) + "/" + (entry.date ?? "").slice(5, 7)
                  : "\u00a0"}
              </span>
            </div>)}
          </div>
        </div>
      </article>

      <div className={styles.chartGrid}>
        <MiniChart title="Ποιες ημέρες ξεκίνησαν" subtitle="Συνολικές ενάρξεις ανά ημέρα της εβδομάδας"
          labels={weekdays} values={weekdays.map((_, i) => stats.weekdays.find((b) => b.dow === i + 1)?.count ?? 0)} />
        <MiniChart title="Ποιες ώρες ξεκίνησαν" subtitle="Τρίωρες ζώνες ώρας Ελλάδας"
          labels={Array.from({ length: 8 }, (_, i) => `${String(i * 3).padStart(2, "0")}–${String(i * 3 + 3).padStart(2, "0")}`)}
          values={Array.from({ length: 8 }, (_, i) => stats.hours.find((b) => b.slot === i)?.count ?? 0)} />
        <MiniChart title="Διάρκεια συμπλήρωσης" subtitle="Καταγεγραμμένος χρόνος · έως 24 ώρες"
          labels={durationLabels} values={durationLabels.map((_, i) => stats.durations.find((b) => b.slot === i)?.count ?? 0)} />
      </div>
      <p className={styles.dataNote}><strong>Πώς διαβάζονται τα διαγράμματα:</strong> Οι ημέρες και οι ώρες βασίζονται στην έναρξη του ερωτηματολογίου, όχι στη στιγμή αποστολής πρόσκλησης. Η διάρκεια είναι ο καταγεγραμμένος χρόνος από την έναρξη έως την ολοκλήρωση· δεν αποτελεί μέτρηση ενεργού χρόνου ανά ερώτηση και μπορεί να περιλαμβάνει διακοπές. Για τη σύγκριση διάρκειας εξαιρούνται οι μη καταγεγραμμένοι χρόνοι και οι διάρκειες άνω των 24 ωρών. Οι διαχειριστικές οριστικοποιήσεις περιλαμβάνονται στον αριθμό ολοκληρώσεων, όχι ως ξεχωριστές υποβολές συμμετεχόντων. Όλα τα στοιχεία είναι αθροιστικά και ανώνυμα, χωρίς ατομικά ιστορικά.</p>
    </> : <div className={styles.unavailable} role="status">Οι συγκεντρωτικές μετρήσεις χρόνου δεν είναι προσωρινά διαθέσιμες. Η περιγραφή της μεθοδολογίας παραμένει διαθέσιμη.</div>}

    <div className={styles.process}>
      <div className={styles.processHead}><span className={styles.eyebrow}>Πώς διεξήχθη η έρευνα</span><h3>Από το πλαίσιο επιχειρήσεων στην τεκμηριωμένη ανάλυση</h3></div>
      <div className={styles.processGrid}>
        <article><span>01 / Πλαίσιο</span><h4>Επιχειρήσεις του ελληνικού εμπορίου</h4><p>Ο πληθυσμός ορίστηκε με συγκεκριμένους ΚΑΔ και στοιχεία ενεργών επιχειρήσεων του ΓΕΜΗ. Η διαθέσιμη ηλεκτρονική επικοινωνία αποτέλεσε πρακτικό κανάλι προσέγγισης, όχι απόδειξη αντιπροσωπευτικού δείγματος.</p></article>
        <article><span>02 / Προετοιμασία</span><h4>Πιλοτικός έλεγχος</h4><p>Προηγήθηκε δοκιμαστική φάση για τη λειτουργία του ερωτηματολογίου και των διαδικασιών. Οι δοκιμαστικές απαντήσεις εξαιρούνται από την κύρια συλλογή.</p></article>
        <article><span>03 / Συλλογή</span><h4>Ηλεκτρονικές προσκλήσεις</h4><p>Η κύρια συλλογή πραγματοποιήθηκε με ηλεκτρονικό ερωτηματολόγιο και προσκλήσεις στις ομάδες Α και Β. Η συμπλήρωση ήταν προαιρετική και οι επιλογές συγκατάθεσης τηρήθηκαν χωριστά.</p></article>
        <article><span>04 / Τεκμηρίωση</span><h4>Ποιοτικός έλεγχος και περιορισμοί</h4><p>Καταγράφονται η πρόοδος, η μη απόκριση και οι έλεγχοι πληρότητας. Οι διοικητικές οριστικοποιήσεις διακρίνονται από τις υποβολές των συμμετεχόντων. Κάθε ερμηνεία οφείλει να λαμβάνει υπόψη τους περιορισμούς κάλυψης και μη απόκρισης.</p></article>
      </div>
      <Link href="/research/greek-retail-2026/methodology" className={styles.methodLink}>Πλήρης μεθοδολογία της μελέτης →</Link>
    </div>
  </section>;
}
