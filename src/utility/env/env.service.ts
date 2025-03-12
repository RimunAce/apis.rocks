import { env } from "process";
import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  OPENROUTER_KEY: z.string().optional(),
  DATABASE_TYPE: z
    .enum(["supabase", "mysql", "postgres", "mongodb"])
    .default("supabase"),
  SUPABASE_URI: z.string().optional(),
  SUPABASE_KEY: z.string().optional(),
  UPSTASH_REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
  SCRAPPER_URL: z.string().optional(),
  BUNNYCDN_API_KEY: z.string().optional(),
  DDOS_PROTECTION_ENABLED: z.coerce.boolean().default(true),
  DDOS_THRESHOLD_REQUESTS: z.coerce.number().default(100),
  DDOS_TIME_WINDOW_SECONDS: z.coerce.number().default(10),
  DDOS_BAN_DURATION_SECONDS: z.coerce.number().default(300),
});

export type Env = z.infer<typeof envSchema>;

class EnvService {
  private readonly env: Env;

  constructor() {
    try {
      this.env = envSchema.parse(env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        throw new Error(`❌ Invalid environment variables:\n${issues}`);
      }
      throw error;
    }
  }

  public getEnv(): Readonly<Env> {
    return Object.freeze({ ...this.env });
  }

  public get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }
}

export const envService = new EnvService();
