import { z } from "zod";

export type PitcherSpan = "regular" | "postseason" | "total";
export type PitcherRollup = "season" | "last3" | "career";

const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const tableRowSchema = z.record(valueSchema);
const tableSectionSchema = z.array(tableRowSchema);

const pitchMixEntrySchema = z.object({
  pitch_type: z.string(),
  usage_pct: z.number().nullable().optional(),
  avg_velo: z.number().nullable().optional(),
  whiff_rate: z.number().nullable().optional(),
  count: z.number().int().optional(),
});

const movementEntrySchema = z.object({
  pitch_type: z.string(),
  horz: z.number().nullable().optional(),
  vert: z.number().nullable().optional(),
  velo: z.number().nullable().optional(),
  count: z.number().int().optional(),
});

const velocityEntrySchema = z.object({
  date: z.string(),
  pitch_type: z.string(),
  velo: z.number().nullable().optional(),
});

const splitEntrySchema = z.object({
  handedness: z.string(),
  pitches: z.number().optional(),
  whiff_rate: z.number().nullable().optional(),
  contact_rate: z.number().nullable().optional(),
  avg_velo: z.number().nullable().optional(),
  avg_ev: z.number().nullable().optional(),
});

const pitchTypeSplitEntrySchema = z.object({
  pitch_type: z.string(),
  count: z.number().optional(),
  avg_velo: z.number().nullable().optional(),
  avg_spin: z.number().nullable().optional(),
  whiff_rate: z.number().nullable().optional(),
  csw: z.number().nullable().optional(),
  avg_iva: z.number().nullable().optional(),
  usage: z.number().nullable().optional(),
});

const gameLogEntrySchema = z.object({
  game_pk: z.number(),
  date: z.string(),
  pitches: z.number().optional(),
  whiffs: z.number().nullable().optional(),
  contacts: z.number().nullable().optional(),
  avg_velo: z.number().nullable().optional(),
  avg_launch_speed: z.number().nullable().optional(),
  avg_launch_angle: z.number().nullable().optional(),
});

const deepDiveSchema = z
  .object({
    meta: z.object({
      player: z
        .object({
          fg_id: z.number().optional(),
          mlbam: z.number().optional(),
          name: z.string().optional(),
          throws: z.string().nullable().optional(),
          bats: z.string().nullable().optional(),
          height: z.string().nullable().optional(),
          weight: z.union([z.number(), z.string()]).nullable().optional(),
          birthdate: z.string().nullable().optional(),
          age: z.union([z.number(), z.string()]).nullable().optional(),
        })
        .optional(),
      missing: z.record(z.boolean()).optional(),
      source: z.record(z.any()).optional(),
    }),
    standard: tableSectionSchema.optional(),
    advanced: tableSectionSchema.optional(),
    statcast: tableSectionSchema.optional(),
    batted_ball: tableSectionSchema.optional(),
    win_prob: tableSectionSchema.optional(),
    pitch_values: tableSectionSchema.optional(),
    pitch_type_velo: tableSectionSchema.optional(),
    plate_discipline: tableSectionSchema.optional(),
    pitchingbot: tableSectionSchema.optional(),
    fielding_pitcher: tableSectionSchema.optional(),
    value: tableSectionSchema.optional(),
    player_graphs: tableSectionSchema.optional(),
    pitch_type_splits: z.array(pitchTypeSplitEntrySchema).optional(),
    splits: z.array(splitEntrySchema).optional(),
    pitch_velocity: z.array(velocityEntrySchema).optional(),
    pitch_type_mix: z.array(pitchMixEntrySchema).optional(),
    movement_scatter: z.array(movementEntrySchema).optional(),
    velo_trend: z.array(velocityEntrySchema).optional(),
    game_log: z.array(gameLogEntrySchema).optional(),
  })
  .passthrough();

export type DataRow = z.infer<typeof tableRowSchema>;
export type PitchMixEntry = z.infer<typeof pitchMixEntrySchema>;
export type MovementEntry = z.infer<typeof movementEntrySchema>;
export type VelocityEntry = z.infer<typeof velocityEntrySchema>;
export type SplitEntry = z.infer<typeof splitEntrySchema>;
export type PitchTypeSplitEntry = z.infer<typeof pitchTypeSplitEntrySchema>;
export type GameLogEntry = z.infer<typeof gameLogEntrySchema>;

export interface PitcherDeepDive {
  meta: {
    player?: {
      fg_id?: number;
      mlbam?: number;
      name?: string;
      throws?: string | null;
      bats?: string | null;
      height?: string | null;
      weight?: number | string | null;
      birthdate?: string | null;
      age?: number | string | null;
    };
    missing?: Record<string, boolean>;
    source?: Record<string, unknown>;
  };
  standard: DataRow[];
  advanced: DataRow[];
  statcast: DataRow[];
  batted_ball: DataRow[];
  win_prob: DataRow[];
  pitch_values: DataRow[];
  pitch_type_velo: DataRow[];
  plate_discipline: DataRow[];
  pitchingbot: DataRow[];
  fielding_pitcher: DataRow[];
  value: DataRow[];
  player_graphs: DataRow[];
  pitch_type_splits: PitchTypeSplitEntry[];
  splits: SplitEntry[];
  pitch_velocity: VelocityEntry[];
  pitch_type_mix: PitchMixEntry[];
  movement_scatter: MovementEntry[];
  velo_trend: VelocityEntry[];
  game_log: GameLogEntry[];
}

const SECTION_KEYS: Array<keyof PitcherDeepDive> = [
  "standard",
  "advanced",
  "statcast",
  "batted_ball",
  "win_prob",
  "pitch_values",
  "pitch_type_velo",
  "plate_discipline",
  "pitchingbot",
  "fielding_pitcher",
  "value",
  "player_graphs",
  "pitch_type_splits",
  "splits",
  "pitch_velocity",
  "pitch_type_mix",
  "movement_scatter",
  "velo_trend",
  "game_log",
];

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDeepDive(parsed: z.infer<typeof deepDiveSchema>): PitcherDeepDive {
  const result: PitcherDeepDive = {
    meta: parsed.meta ?? {},
    standard: [],
    advanced: [],
    statcast: [],
    batted_ball: [],
    win_prob: [],
    pitch_values: [],
    pitch_type_velo: [],
    plate_discipline: [],
    pitchingbot: [],
    fielding_pitcher: [],
    value: [],
    player_graphs: [],
    pitch_type_splits: [],
    splits: [],
    pitch_velocity: [],
    pitch_type_mix: [],
    movement_scatter: [],
    velo_trend: [],
    game_log: [],
  };

  for (const key of SECTION_KEYS) {
    const data = (parsed as any)[key];
    if (Array.isArray(data)) {
      (result as any)[key] = data;
    }
  }

  if (!result.pitch_velocity.length && result.velo_trend.length) {
    result.pitch_velocity = result.velo_trend;
  }
  return result;
}

export interface FetchPitcherDeepDiveParams {
  mlbam: number;
  year: number;
  span: PitcherSpan;
  rollup: PitcherRollup;
  signal?: AbortSignal;
  retries?: number;
}

export async function fetchPitcherDeepDive({
  mlbam,
  year,
  span,
  rollup,
  signal,
  retries = 2,
}: FetchPitcherDeepDiveParams): Promise<PitcherDeepDive> {
  const qs = new URLSearchParams({
    mlbam: String(mlbam),
    year: String(year),
    span,
    rollup,
  });
  const url = `/api/deep-dive/pitcher/full?${qs.toString()}`;

  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          await delay(300 * Math.pow(2, attempt));
          attempt += 1;
          continue;
        }
        const body = await response.text();
        throw new Error(`Deep dive request failed (${response.status}): ${body || response.statusText}`);
      }
      const raw = await response.json();
      const parsed = deepDiveSchema.parse(raw);
      return normalizeDeepDive(parsed);
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        throw err;
      }
      lastError = err;
      if (attempt >= retries) {
        throw err;
      }
      await delay(400 * Math.pow(2, attempt));
      attempt += 1;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unknown fetch error");
}
