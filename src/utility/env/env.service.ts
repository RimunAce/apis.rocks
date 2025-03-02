import { env } from "process";
import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  OPENROUTER_KEY: z.string().optional(),
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
