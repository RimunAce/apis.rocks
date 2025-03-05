import { createClient } from "@supabase/supabase-js";
import { envService } from "../env/env.service";
import logger from "../logger/logger.service";

const supabaseUrl = envService.get("SUPABASE_URI");
const supabaseKey = envService.get("SUPABASE_KEY");

if (!supabaseUrl || !supabaseKey) {
  logger.error("Supabase URI or key not provided");
  throw new Error("Supabase URI or key not provided");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
